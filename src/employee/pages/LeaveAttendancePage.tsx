import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Calendar, CheckCircle2, Clock, Loader2, LogIn, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { fmtDate } from '../types';
import {
  ATTENDANCE_UPDATED_EVENT,
  clockInOffice,
  localWorkDate,
} from '../lib/attendance';

interface LeaveRow {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  review_note: string | null;
  employee_id: string;
}

interface AttRow {
  id: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  status: string;
}

const LEAVE_TYPES = [
  { id: 'annual', label: 'Annual leave' },
  { id: 'sick', label: 'Sick leave' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'other', label: 'Other' },
];

export function LeaveAttendancePage() {
  const { employee, user, isDivisionHead, hasCapability } = useAuth();
  const canReview = isDivisionHead || hasCapability('div.manage_staff_access');
  const today = localWorkDate();

  const [leaveType, setLeaveType] = useState('annual');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const [mine, setMine] = useState<LeaveRow[]>([]);
  const [pendingTeam, setPendingTeam] = useState<(LeaveRow & { employees?: { full_name: string } | null })[]>([]);
  const [outToday, setOutToday] = useState<{ full_name: string; leave_type: string }[]>([]);
  const [todayAtt, setTodayAtt] = useState<AttRow | null>(null);
  const [history, setHistory] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    if (!employee || !user) { setLoading(false); return; }
    setLoading(true);
    const [leaveRes, attRes, teamRes, outRes] = await Promise.all([
      supabase.from('leave_requests').select('*').eq('employee_id', employee.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('office_attendance').select('*').eq('employee_id', employee.id).order('work_date', { ascending: false }).limit(14),
      canReview
        ? supabase.from('leave_requests').select('*, employees!leave_requests_employee_id_fkey(full_name)').eq('service_id', employee.service_id).eq('status', 'pending').order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      canReview
        ? supabase.from('leave_requests').select('leave_type, employees!leave_requests_employee_id_fkey(full_name)').eq('service_id', employee.service_id).eq('status', 'approved').lte('start_date', today).gte('end_date', today)
        : Promise.resolve({ data: [] }),
    ]);
    setMine((leaveRes.data as LeaveRow[]) || []);
    const att = (attRes.data as AttRow[]) || [];
    setHistory(att);
    setTodayAtt(att.find((a) => a.work_date === today) || null);
    setPendingTeam((teamRes.data as any[]) || []);
    setOutToday(((outRes.data as any[]) || []).map((r) => ({
      full_name: r.employees?.full_name || 'Staff',
      leave_type: r.leave_type,
    })));
    setLoading(false);
  }, [employee, user, canReview, today]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onUpdated = () => { void load(); };
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(ATTENDANCE_UPDATED_EVENT, onUpdated);
  }, [load]);

  const clockIn = async () => {
    if (!employee || !user) return;
    setSaving(true); setError('');
    const { error: err, late } = await clockInOffice({
      employeeId: employee.id,
      userId: user.id,
      serviceId: employee.service_id,
    });
    if (err) setError(err);
    else setOk(late ? 'Clocked in (marked late).' : 'Clocked in.');
    setSaving(false);
    await load();
  };

  const clockOut = async () => {
    if (!todayAtt) return;
    setSaving(true); setError('');
    const { error: err } = await supabase.from('office_attendance').update({
      clock_out_at: new Date().toISOString(),
    }).eq('id', todayAtt.id);
    if (err) setError(err.message);
    else setOk('Clocked out.');
    setSaving(false);
    await load();
  };

  const requestLeave = async () => {
    if (!employee || !user) return;
    if (endDate < startDate) { setError('End date cannot be before start date.'); return; }
    setSaving(true); setError(''); setOk('');
    const { error: err } = await supabase.from('leave_requests').insert({
      employee_id: employee.id,
      user_id: user.id,
      service_id: employee.service_id,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || null,
      status: 'pending',
    });
    if (err) setError(err.message);
    else {
      setOk('Leave request sent.');
      setReason('');
    }
    setSaving(false);
    await load();
  };

  const reviewLeave = async (id: string, status: 'approved' | 'rejected') => {
    setSaving(true); setError('');
    const { error: err } = await supabase.from('leave_requests').update({
      status,
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    if (err) setError(err.message);
    setSaving(false);
    await load();
  };

  const cancelMine = async (id: string) => {
    const { error: err } = await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', id);
    if (err) setError(err.message);
    await load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Leave & attendance</h1>
        <p className="text-sm text-slate-400">Clock in for office days and request time off.</p>
      </div>

      {error && <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"><AlertCircle className="w-4 h-4" />{error}</p>}
      {ok && <p className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3"><CheckCircle2 className="w-4 h-4" />{ok}</p>}

      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Today</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {todayAtt?.clock_in_at
            ? `In ${new Date(todayAtt.clock_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${todayAtt.clock_out_at ? ` · Out ${new Date(todayAtt.clock_out_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`
            : 'You have not clocked in yet.'}
        </p>
        <div className="flex gap-2">
          <button type="button" disabled={saving || !!todayAtt?.clock_in_at} onClick={() => void clockIn()} className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 bg-slate-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
            <LogIn className="w-4 h-4" /> Clock in
          </button>
          <button type="button" disabled={saving || !todayAtt?.clock_in_at || !!todayAtt?.clock_out_at} onClick={() => void clockOut()} className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 border border-slate-200 rounded-xl text-sm font-semibold disabled:opacity-40">
            <LogOut className="w-4 h-4" /> Clock out
          </button>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Request leave</h2>
        </div>
        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full min-h-[44px] px-3 border border-slate-200 rounded-xl text-sm bg-white">
          {LEAVE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="min-h-[44px] px-3 border border-slate-200 rounded-xl text-sm" />
          <input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="min-h-[44px] px-3 border border-slate-200 rounded-xl text-sm" />
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (optional)" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
        <button type="button" disabled={saving} onClick={() => void requestLeave()} className="w-full min-h-[44px] bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
          {saving ? 'Sending…' : 'Submit request'}
        </button>
      </section>

      {canReview && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Team</h2>
          {outToday.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800">
              Out today: {outToday.map((o) => `${o.full_name} (${o.leave_type})`).join(', ')}
            </div>
          )}
          {pendingTeam.length === 0 ? (
            <p className="text-sm text-slate-400">No pending leave requests.</p>
          ) : pendingTeam.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">{(r as any).employees?.full_name || 'Staff'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{r.leave_type} · {fmtDate(r.start_date)} – {fmtDate(r.end_date)}</p>
              {r.reason && <p className="text-xs text-slate-400 mt-1">{r.reason}</p>}
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => void reviewLeave(r.id, 'approved')} className="flex-1 min-h-[40px] bg-emerald-600 text-white rounded-xl text-xs font-semibold">Approve</button>
                <button type="button" onClick={() => void reviewLeave(r.id, 'rejected')} className="flex-1 min-h-[40px] border border-slate-200 rounded-xl text-xs font-semibold">Reject</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="text-sm font-bold text-slate-900 mb-2">My leave</h2>
        {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : mine.length === 0 ? (
          <p className="text-sm text-slate-400">No leave requests yet.</p>
        ) : mine.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3.5 mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{r.leave_type} · {fmtDate(r.start_date)} – {fmtDate(r.end_date)}</p>
              <p className="text-xs text-slate-400">{r.status}{r.review_note ? ` · ${r.review_note}` : ''}</p>
            </div>
            {r.status === 'pending' && (
              <button type="button" onClick={() => void cancelMine(r.id)} className="text-xs font-semibold text-slate-500">Cancel</button>
            )}
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-sm font-bold text-slate-900 mb-2">Recent clock-ins</h2>
        {history.map((a) => (
          <div key={a.id} className="text-xs text-slate-500 py-1.5 border-b border-slate-100 last:border-0">
            {fmtDate(a.work_date)} · {a.status}
            {a.clock_in_at ? ` · in ${new Date(a.clock_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
            {a.clock_out_at ? ` · out ${new Date(a.clock_out_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
        ))}
      </section>
    </div>
  );
}
