import { useEffect, useState } from 'react';
import {
  Loader2, FileText, Calendar, Upload, ClipboardList, BarChart3,
  ArrowLeft, CheckCircle2, Clock, AlertCircle, FileDown, Inbox,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Employee } from '../types';
import { fmtDate, STATUS_META } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Shared helpers
   ═══════════════════════════════════════════════════════════════ */

function PageHeader({ icon: Icon, title, subtitle }: { icon: typeof FileText; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: typeof FileText; title: string; subtitle: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Bookings Page — view bookings in the employee's division
   ═══════════════════════════════════════════════════════════════ */

interface Booking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  services?: { name: string }[] | { name: string } | null;
}

function serviceName(b: Booking): string {
  if (!b.services) return 'Service';
  if (Array.isArray(b.services)) return b.services[0]?.name || 'Service';
  return b.services.name;
}

export function BookingsPage({ employee }: { employee: Employee | null }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee?.service_id) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, status, scheduled_date, scheduled_time, location, contact_name, contact_phone, notes, services(name)')
        .eq('service_id', employee.service_id)
        .order('scheduled_date', { ascending: false })
        .limit(50);
      setBookings((data as Booking[]) || []);
      setLoading(false);
    })();
  }, [employee?.service_id]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;

  return (
    <div>
      <PageHeader icon={FileText} title="Division Bookings" subtitle="Bookings assigned to your division" />
      {bookings.length === 0 ? (
        <EmptyState icon={Inbox} title="No bookings yet" subtitle="There are no bookings in your division right now." />
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const meta = STATUS_META[b.status] || STATUS_META.pending;
            return (
              <div key={b.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{serviceName(b)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{fmtDate(b.scheduled_date)}{b.scheduled_time ? ` · ${b.scheduled_time.slice(0, 5)}` : ''}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.cls}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${meta.dot} mr-1.5`} />
                    {meta.label}
                  </span>
                </div>
                {b.location && <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {b.location}</p>}
                {b.contact_name && <p className="text-xs text-slate-500 mt-1">Contact: {b.contact_name}{b.contact_phone ? ` · ${b.contact_phone}` : ''}</p>}
                {b.notes && <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{b.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Schedule Page — upcoming work schedule
   ═══════════════════════════════════════════════════════════════ */

export function SchedulePage({ employee }: { employee: Employee | null }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee?.service_id) { setLoading(false); return; }
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('bookings')
        .select('id, status, scheduled_date, scheduled_time, location, contact_name, contact_phone, notes, services(name)')
        .eq('service_id', employee.service_id)
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(30);
      setBookings((data as Booking[]) || []);
      setLoading(false);
    })();
  }, [employee?.service_id]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;

  return (
    <div>
      <PageHeader icon={Calendar} title="My Schedule" subtitle="Upcoming assigned work" />
      {bookings.length === 0 ? (
        <EmptyState icon={Calendar} title="No upcoming work" subtitle="Your schedule is clear for now." />
      ) : (
        <div className="relative pl-6 space-y-4">
          <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200" />
          {bookings.map((b) => (
            <div key={b.id} className="relative">
              <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm" />
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <p className="font-semibold text-slate-900 text-sm">{serviceName(b)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{fmtDate(b.scheduled_date)}{b.scheduled_time ? ` · ${b.scheduled_time.slice(0, 5)}` : ''}</p>
                {b.location && <p className="text-xs text-slate-500 mt-1">{b.location}</p>}
                {b.contact_name && <p className="text-xs text-slate-400 mt-1">Contact: {b.contact_name}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Documents Page — upload and view division documents
   ═══════════════════════════════════════════════════════════════ */

interface DocRow {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  uploaded_by_admin: boolean;
}

export function DocumentsPage({ employee }: { employee: Employee | null }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const fetchDocs = async () => {
    if (!employee) { setLoading(false); return; }
    const { data } = await supabase
      .from('documents')
      .select('id, file_name, file_url, file_type, file_size, created_at, uploaded_by_admin')
      .or(`user_id.eq.${employee.user_id},service_slug.eq.${employee.services?.slug || ''}`)
      .order('created_at', { ascending: false })
      .limit(50);
    setDocs((data as DocRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [employee]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employee?.user_id) return;
    setUploading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop() || 'file';
      const path = `employee-docs/${employee.user_id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file);
      if (upErr) throw upErr;
      const { data: pubData } = supabase.storage.from('documents').getPublicUrl(path);
      await supabase.from('documents').insert({
        user_id: employee.user_id,
        file_name: file.name,
        file_url: pubData.publicUrl,
        file_type: ext,
        file_size: file.size,
        uploaded_by_admin: false,
        service_slug: employee.services?.slug || null,
      });
      await fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploading(false);
    e.target.value = '';
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;

  return (
    <div>
      <PageHeader icon={Upload} title="Documents" subtitle="Upload and view division documents" />
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      <label className="block mb-4">
        <input type="file" onChange={handleUpload} disabled={uploading} className="hidden" />
        <div className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors">
          {uploading ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" /> : <Upload className="w-5 h-5 text-slate-400" />}
          <span className="text-sm text-slate-500 font-medium">{uploading ? 'Uploading…' : 'Click to upload a document'}</span>
        </div>
      </label>
      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" subtitle="Upload your first document using the area above." />
      ) : (
        <div className="space-y-2.5">
          {docs.map((d) => (
            <a key={d.id} href={d.file_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-sm transition-all">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{d.file_name}</p>
                <p className="text-xs text-slate-400">{fmtDate(d.created_at)}{d.uploaded_by_admin ? ' · Admin' : ''}</p>
              </div>
              <FileDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Report Page — submit daily or incident reports
   ═══════════════════════════════════════════════════════════════ */

export function ReportPage({ employee, onBack }: { employee: Employee | null; onBack: () => void }) {
  const [reportType, setReportType] = useState<'daily' | 'incident'>('daily');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setError('Please fill in all fields'); return; }
    if (!employee?.user_id) { setError('Unable to identify your account'); return; }
    setSaving(true);
    setError('');
    try {
      const { error: insErr } = await supabase.from('messages').insert({
        sender_id: employee.user_id,
        subject: `[${reportType.toUpperCase()}] ${title.trim()}`,
        body: body.trim(),
        category: reportType,
      });
      if (insErr) throw insErr;
      setSaved(true);
      setTitle(''); setBody('');
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    }
    setSaving(false);
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to activities
      </button>
      <PageHeader icon={ClipboardList} title="Submit Report" subtitle="Submit a daily or incident report" />
      {saved && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> Report submitted successfully
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {(['daily', 'incident'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setReportType(t)}
              className={`py-3 rounded-xl border-2 text-sm font-semibold capitalize transition-all ${
                reportType === t
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300'
              }`}>
              {t === 'daily' ? 'Daily Report' : 'Incident Report'}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief title for your report"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Details</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
            placeholder="Describe the activities, observations, or incident details…"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all resize-none" />
        </div>
        <button type="submit" disabled={saving}
          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/20">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Submit Report</>}
        </button>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Performance Page — view personal performance metrics
   ═══════════════════════════════════════════════════════════════ */

export function PerformancePage({ employee }: { employee: Employee | null }) {
  const [stats, setStats] = useState({ totalBookings: 0, completed: 0, pending: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employee?.service_id) { setLoading(false); return; }
    (async () => {
      const { count: total } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', employee.service_id);
      const { count: completed } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', employee.service_id)
        .eq('status', 'completed');
      const { count: pending } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', employee.service_id)
        .in('status', ['pending', 'confirmed', 'in_progress']);
      const { count: cancelled } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', employee.service_id)
        .eq('status', 'cancelled');
      setStats({
        totalBookings: total || 0,
        completed: completed || 0,
        pending: pending || 0,
        cancelled: cancelled || 0,
      });
      setLoading(false);
    })();
  }, [employee?.service_id]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;

  const completionRate = stats.totalBookings > 0 ? Math.round((stats.completed / stats.totalBookings) * 100) : 0;

  return (
    <div>
      <PageHeader icon={BarChart3} title="My Performance" subtitle="Your work metrics and statistics" />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.totalBookings}</p>
          <p className="text-xs text-slate-500">Total Bookings</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.completed}</p>
          <p className="text-xs text-slate-500">Completed</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mb-3">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.pending}</p>
          <p className="text-xs text-slate-500">In Progress</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center mb-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.cancelled}</p>
          <p className="text-xs text-slate-500">Cancelled</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Completion Rate</p>
          <p className="text-sm font-bold text-emerald-600">{completionRate}%</p>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
            style={{ width: `${completionRate}%` }} />
        </div>
      </div>
    </div>
  );
}
