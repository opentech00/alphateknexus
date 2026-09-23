import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import {
  AlertCircle, ArrowRight, Banknote, CalendarDays, CheckCircle2, ClipboardList,
  Clock, Inbox, Loader2, LogIn, LogOut, Sun, Sunset, Moon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { useEmployeeNotifications } from '../contexts/EmployeeNotificationsContext';
import { fmtDate } from '../types';
import {
  ATTENDANCE_UPDATED_EVENT,
  clockInOffice,
  clockOutOffice,
  fetchOfficeAttendanceToday,
  localWorkDate,
} from '../lib/attendance';
import { destinationForNotification, type NavTarget } from '../lib/workNav';
import { toast } from '../../components/toast/toast';
import { isInternalDepartmentSlug } from '../../lib/capabilities';

interface DayBooking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  contact_name: string | null;
  services?: { name: string } | { name: string }[] | null;
}

interface DayTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string;
}

interface DayLeave {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return { text: 'Good morning', Icon: Sun };
  if (h < 17) return { text: 'Good afternoon', Icon: Sunset };
  return { text: 'Good evening', Icon: Moon };
}

function serviceName(b: DayBooking) {
  if (!b.services) return 'Service';
  return Array.isArray(b.services) ? (b.services[0]?.name || 'Service') : b.services.name;
}

function fmtClock(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function todayLong() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function MyDayPage({ onNavigate }: { onNavigate: (target: NavTarget) => void }) {
  const { employee, user, hasCapability } = useAuth();
  const { notifications, unreadCount } = useEmployeeNotifications();
  const liveId = useId();
  const canCash = hasCapability('div.cash_collections');
  const isInternal = isInternalDepartmentSlug(employee?.services?.slug);
  const today = localWorkDate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [attendance, setAttendance] = useState<{
    id: string; clock_in_at: string | null; clock_out_at: string | null; status: string;
  } | null>(null);
  const [nextJob, setNextJob] = useState<DayBooking | null>(null);
  const [todayJobs, setTodayJobs] = useState<DayBooking[]>([]);
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [leave, setLeave] = useState<DayLeave[]>([]);
  const [cashCount, setCashCount] = useState(0);

  const load = useCallback(async () => {
    if (!employee || !user) { setLoading(false); return; }
    setLoading(true);
    setError('');
    const [att, jobsRes, taskRes, leaveRes, cashRes] = await Promise.all([
      fetchOfficeAttendanceToday(employee.id, today),
      isInternal
        ? Promise.resolve({ data: [] as DayBooking[] })
        : supabase
            .from('bookings')
            .select('id, status, scheduled_date, scheduled_time, location, contact_name, services(name)')
            .eq('assigned_to', user.id)
            .gte('scheduled_date', today)
            .not('status', 'eq', 'cancelled')
            .order('scheduled_date', { ascending: true })
            .limit(8),
      supabase
        .from('task_delegations')
        .select('id, title, status, due_date, priority')
        .eq('assigned_to', user.id)
        .in('status', ['pending', 'accepted', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(6),
      supabase
        .from('leave_requests')
        .select('id, leave_type, start_date, end_date, status')
        .eq('employee_id', employee.id)
        .in('status', ['pending', 'approved'])
        .gte('end_date', today)
        .order('start_date', { ascending: true })
        .limit(4),
      canCash
        ? supabase.from('payments').select('id', { count: 'exact', head: true }).eq('method', 'cash').eq('status', 'pending')
        : Promise.resolve({ count: 0 }),
    ]);
    setAttendance(att);
    const jobs = (jobsRes.data as DayBooking[]) || [];
    setTodayJobs(jobs.filter((j) => j.scheduled_date === today && j.status !== 'completed'));
    setNextJob(jobs.find((j) => j.status !== 'completed') ?? null);
    setTasks((taskRes.data as DayTask[]) || []);
    setLeave((leaveRes.data as DayLeave[]) || []);
    setCashCount(cashRes.count || 0);
    setLoading(false);
  }, [employee, user, today, isInternal, canCash]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onUpdated = () => { void load(); };
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(ATTENDANCE_UPDATED_EVENT, onUpdated);
  }, [load]);

  const clockedIn = Boolean(attendance?.clock_in_at);
  const clockedOut = Boolean(attendance?.clock_out_at);
  const onLeaveToday = leave.some((l) => l.status === 'approved' && l.start_date <= today && l.end_date >= today);
  const greet = greeting();
  const GreetIcon = greet.Icon;

  const handleClockIn = async () => {
    if (!employee || !user) return;
    setSaving(true);
    setError('');
    const { error: err, late } = await clockInOffice({
      employeeId: employee.id,
      userId: user.id,
      serviceId: employee.service_id,
    });
    if (err) {
      setError(err);
      toast.error(err);
    } else {
      const msg = late ? 'Clocked in. You were marked late.' : 'Clocked in. Have a good day.';
      setStatusMsg(msg);
      toast.success(msg);
    }
    setSaving(false);
    await load();
  };

  const handleClockOut = async () => {
    if (!attendance?.id) return;
    setSaving(true);
    setError('');
    const { error: err } = await clockOutOffice(attendance.id);
    if (err) {
      setError(err);
      toast.error(err);
    } else {
      setStatusMsg('Clocked out. See you tomorrow.');
      toast.success('Clocked out. See you tomorrow.');
    }
    setSaving(false);
    await load();
  };

  const recentUnread = notifications.filter((n) => !n.read).slice(0, 3);

  return (
    <div className="space-y-5">
      <header className="emp-fade-in bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 sm:p-7 text-white relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="relative flex items-start gap-4">
          {employee?.photo_url ? (
            <img src={employee.photo_url} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20" />
          ) : (
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border-2 border-white/20" aria-hidden="true">
              <span className="text-2xl font-bold">{employee?.full_name[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm text-slate-300 flex items-center gap-1.5">
              <GreetIcon className="w-4 h-4" aria-hidden="true" /> {greet.text}
            </p>
            <h1 id="employee-page-title" tabIndex={-1} className="text-xl sm:text-2xl font-bold leading-tight outline-none">
              {employee?.full_name}
            </h1>
            <p className="text-xs text-slate-400 mt-1.5">{todayLong()}</p>
          </div>
        </div>
      </header>

      <div id={liveId} className="sr-only" aria-live="polite" aria-atomic="true">
        {statusMsg || error}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-hidden="true" />
          <span className="sr-only">Loading your day</span>
        </div>
      ) : (
        <>
          <section
            className="emp-fade-in bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
            style={{ animationDelay: '60ms' }}
            aria-labelledby="clock-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="clock-heading" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Attendance
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {onLeaveToday
                    ? 'Approved leave covers today. Clock-in is optional.'
                    : clockedOut
                      ? `In ${fmtClock(attendance?.clock_in_at)} · Out ${fmtClock(attendance?.clock_out_at)}`
                      : clockedIn
                        ? `Clocked in at ${fmtClock(attendance?.clock_in_at)}`
                        : 'You have not clocked in yet.'}
                </p>
                {attendance?.status === 'late' && clockedIn && (
                  <p className="text-xs text-amber-700 mt-1">Marked late</p>
                )}
              </div>
              <div className="flex gap-2">
                {!clockedIn && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleClockIn()}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LogIn className="w-4 h-4" aria-hidden="true" />}
                    Clock in
                  </button>
                )}
                {clockedIn && !clockedOut && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleClockOut()}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LogOut className="w-4 h-4" aria-hidden="true" />}
                    Clock out
                  </button>
                )}
                {clockedOut && (
                  <span className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Done for today
                  </span>
                )}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FocusCard
              delay={120}
              icon={Inbox}
              title="Next job"
              empty={isInternal ? 'No client jobs in this department.' : 'Nothing assigned after today.'}
              actionLabel="Open inbox"
              onAction={() => onNavigate({ page: 'work-inbox', inboxTab: 'mine', bookingId: nextJob?.id })}
            >
              {nextJob && (
                <>
                  <p className="text-sm font-semibold text-slate-900">{serviceName(nextJob)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fmtDate(nextJob.scheduled_date)}
                    {nextJob.scheduled_time ? ` · ${nextJob.scheduled_time.slice(0, 5)}` : ''}
                    {nextJob.location ? ` · ${nextJob.location}` : ''}
                  </p>
                  {todayJobs.length > 1 && (
                    <p className="text-xs text-emerald-700 mt-1">{todayJobs.length} jobs today</p>
                  )}
                </>
              )}
            </FocusCard>

            <FocusCard
              delay={180}
              icon={ClipboardList}
              title="Open tasks"
              empty="No open delegated tasks."
              actionLabel="View tasks"
              onAction={() => onNavigate({ page: 'delegated-tasks' })}
            >
              {tasks.length > 0 && (
                <>
                  <p className="text-sm font-semibold text-slate-900">{tasks[0].title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {tasks.length} open · {tasks[0].due_date ? `Due ${fmtDate(tasks[0].due_date)}` : 'No due date'}
                  </p>
                </>
              )}
            </FocusCard>

            <FocusCard
              delay={240}
              icon={CalendarDays}
              title="Leave"
              empty="No upcoming leave."
              actionLabel="Leave & attendance"
              onAction={() => onNavigate({ page: 'leave' })}
            >
              {leave.length > 0 && (
                <>
                  <p className="text-sm font-semibold text-slate-900 capitalize">{leave[0].leave_type.replace('_', ' ')}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fmtDate(leave[0].start_date)} – {fmtDate(leave[0].end_date)} · {leave[0].status}
                  </p>
                </>
              )}
            </FocusCard>

            {canCash && (
              <FocusCard
                delay={300}
                icon={Banknote}
                title="Cash to collect"
                empty="No pending cash collections."
                actionLabel="Collect"
                onAction={() => onNavigate({ page: 'cash-collections' })}
              >
                {cashCount > 0 && (
                  <p className="text-sm font-semibold text-slate-900">
                    {cashCount} pending payment{cashCount === 1 ? '' : 's'}
                  </p>
                )}
              </FocusCard>
            )}
          </div>

          {unreadCount > 0 && (
            <section
              className="emp-fade-in bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
              style={{ animationDelay: '360ms' }}
              aria-labelledby="alerts-heading"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 id="alerts-heading" className="text-sm font-bold text-slate-900">
                  {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate({ page: 'notifications' })}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 min-h-[44px] px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
                >
                  View all
                </button>
              </div>
              <ul className="space-y-2">
                {recentUnread.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(destinationForNotification(n))}
                      className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <p className="text-sm font-semibold text-slate-800 truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function FocusCard({
  icon: Icon,
  title,
  empty,
  actionLabel,
  onAction,
  children,
  delay,
}: {
  icon: typeof Inbox;
  title: string;
  empty: string;
  actionLabel: string;
  onAction: () => void;
  children?: ReactNode;
  delay: number;
}) {
  const hasContent = Boolean(children);
  return (
    <article
      className="emp-fade-in bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {title}
      </h2>
      <div className="flex-1">{hasContent ? children : <p className="text-sm text-slate-500">{empty}</p>}</div>
      <button
        type="button"
        onClick={onAction}
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800 min-h-[44px] self-start focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg px-1"
      >
        {actionLabel} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </article>
  );
}
