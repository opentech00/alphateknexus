import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase, Users, MapPin, GitBranch, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { supabase } from '../lib/supabase';
import { DivisionBookingsPanel } from '../../components/division/DivisionBookingsPanel';
import { getDivisionConfig } from '../../components/division/divisionConfigs';
import { HeadDelegateForm, ManageDivisionPage, type TeamMember } from './ManageDivisionPage';

type Tab = 'bookings' | 'team' | 'jobs' | 'tasks';

interface OpenBooking {
  id: string;
  contact_name: string;
  location: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
}

interface FieldJob {
  id: string;
  customer_name: string;
  address: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  employee_id: string;
}

export function DivisionWorkspacePage() {
  const { employee, user, hasCapability, isDivisionHead } = useAuth();
  const [tab, setTab] = useState<Tab>('bookings');
  const slug = employee?.services?.slug || '';
  const config = getDivisionConfig(slug, employee?.services?.name);
  const canAssign = isDivisionHead || hasCapability('div.manage_bookings');
  const DivIcon = config.icon;

  if (!employee?.service_id || !slug) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <p className="font-semibold text-slate-900">No division assigned</p>
        <p className="text-sm text-slate-500 mt-1">Ask an administrator to place you in a division before using this workspace.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 ${config.accentLight} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <DivIcon className={`w-6 h-6 ${config.accentText}`} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Division workspace</h1>
          <p className="mt-0.5 text-slate-500 text-sm">
            {config.name} — bookings, team, field jobs, and tasks for your division only.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {([
          { key: 'bookings' as Tab, label: 'Bookings', icon: Briefcase },
          { key: 'team' as Tab, label: 'Team', icon: Users },
          { key: 'jobs' as Tab, label: 'Jobs', icon: MapPin },
          { key: 'tasks' as Tab, label: 'Tasks', icon: GitBranch },
        ]).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === t.key ? `${config.accentColor} text-white` : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'bookings' && (
        <DivisionBookingsPanel
          config={config}
          showHeader={false}
          showAssign={canAssign}
          client={supabase}
          actor={user ? { id: user.id, name: employee.full_name, isAdmin: false } : undefined}
        />
      )}

      {tab === 'team' && (
        <ManageDivisionPage embed tabs={['team', 'access']} initialTab="team" />
      )}

      {tab === 'jobs' && <DivisionJobsTab />}

      {tab === 'tasks' && <WorkspaceTasksTab />}
    </div>
  );
}

function WorkspaceTasksTab() {
  const { employee } = useAuth();
  const [team, setTeam] = useState<TeamMember[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('list_division_staff');
      setTeam(((data as TeamMember[]) || []).filter(t => t.id !== employee?.id));
    })();
  }, [employee?.id]);

  return <HeadDelegateForm team={team} serviceId={employee?.service_id || null} />;
}

function DivisionJobsTab() {
  const { employee } = useAuth();
  const [bookings, setBookings] = useState<OpenBooking[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [bookingId, setBookingId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [instructions, setInstructions] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!employee?.service_id) return;
    setLoading(true);
    const [bookRes, teamRes, jobRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, contact_name, location, scheduled_date, scheduled_time, status, latitude, longitude')
        .eq('service_id', employee.service_id)
        .in('status', ['approved', 'confirmed', 'in_progress'])
        .order('scheduled_date', { ascending: true })
        .limit(80),
      supabase.rpc('list_division_staff'),
      supabase
        .from('field_assignments')
        .select('id, customer_name, address, scheduled_date, scheduled_time, status, employee_id')
        .eq('service_id', employee.service_id)
        .order('created_at', { ascending: false })
        .limit(40),
    ]);
    setBookings((bookRes.data as OpenBooking[]) || []);
    setTeam((teamRes.data as TeamMember[]) || []);
    setJobs((jobRes.data as FieldJob[]) || []);
    setLoading(false);
  }, [employee?.service_id]);

  useEffect(() => { void load(); }, [load]);

  const selectedBooking = bookings.find(b => b.id === bookingId);
  const fieldTeam = useMemo(
    () => team.filter(t =>
      t.status === 'active'
      && t.id !== employee?.id
      && (
        t.org_role === 'field_staff'
        || t.app_type === 'field'
        || t.capability_keys.includes('field.jobs')
      ),
    ),
    [team, employee?.id],
  );

  useEffect(() => {
    if (!selectedBooking) return;
    setScheduledDate(selectedBooking.scheduled_date || '');
    setScheduledTime(selectedBooking.scheduled_time || '09:00');
    if (selectedBooking.latitude != null) setLat(String(selectedBooking.latitude));
    if (selectedBooking.longitude != null) setLng(String(selectedBooking.longitude));
  }, [selectedBooking]);

  const dispatch = async () => {
    setError('');
    setOk('');
    if (!bookingId || !employeeId) {
      setError('Pick a booking and a field teammate.');
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.rpc('create_division_field_assignment', {
      p_booking_id: bookingId,
      p_employee_id: employeeId,
      p_scheduled_date: scheduledDate || null,
      p_scheduled_time: scheduledTime || null,
      p_instructions: instructions.trim() || null,
      p_latitude: lat ? Number(lat) : null,
      p_longitude: lng ? Number(lng) : null,
    });
    if (err) setError(err.message);
    else {
      setOk('Field job assigned.');
      setBookingId('');
      setEmployeeId('');
      setInstructions('');
      await load();
    }
    setSaving(false);
  };

  const nameFor = (id: string) => team.find(t => t.id === id)?.full_name || 'Teammate';

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;
  }

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-slate-900">Assign a field job</h2>
        <p className="text-xs text-slate-500">Dispatch a confirmed booking to a teammate who has field app access. Office bookings stay on the Bookings tab.</p>
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}
        {ok && (
          <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> {ok}
          </div>
        )}
        <select value={bookingId} onChange={e => setBookingId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
          <option value="">Select booking…</option>
          {bookings.map(b => (
            <option key={b.id} value={b.id}>
              {b.contact_name} · {b.scheduled_date} · {b.status}
            </option>
          ))}
        </select>
        <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
          <option value="">Select field teammate…</option>
          {fieldTeam.map(t => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>
        {fieldTeam.length === 0 && (
          <p className="text-xs text-amber-700">No field-capable teammates yet. On Team, attach staff and set their app to Field.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
          <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
        </div>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={3}
          placeholder="Instructions (optional)"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude (optional)" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
          <input value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitude (optional)" className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void dispatch()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Dispatch field job
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="font-bold text-slate-900 px-1">Recent field jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6">No field jobs dispatched in this division yet.</p>
        ) : jobs.map(j => (
          <div key={j.id} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm text-slate-900">{j.customer_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{j.address || 'No address'} · {nameFor(j.employee_id)}</p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                {j.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">{j.scheduled_date} {j.scheduled_time || ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
