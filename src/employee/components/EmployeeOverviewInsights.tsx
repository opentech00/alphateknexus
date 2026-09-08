import { useEffect, useState } from 'react';
import { Banknote, Bell, Briefcase, Calendar, ClipboardList, Clock, GitBranch, Loader2, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDate } from '../types';

type OverviewNavKey =
  | 'bookings'
  | 'schedule'
  | 'documents'
  | 'report'
  | 'delegated-tasks'
  | 'notifications'
  | 'cash-collections'
  | 'manage-division';

interface QuickAction {
  label: string;
  page: OverviewNavKey;
  icon: any;
  show: boolean;
}

interface TodayFocusItem {
  key: string;
  title: string;
  detail: string;
  page: OverviewNavKey;
  priority: 'high' | 'medium' | 'low';
}

interface Props {
  employee: any;
  isDivisionHead: boolean;
  hasCapability: (key: string) => boolean;
  onNavigate: (page: OverviewNavKey) => void;
}

export function EmployeeOverviewInsights({ employee, isDivisionHead, hasCapability, onNavigate }: Props) {
  const [insightLoading, setInsightLoading] = useState(true);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([]);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [announcementFeed, setAnnouncementFeed] = useState<any[]>([]);
  const [kpis, setKpis] = useState({
    currentTotal: 0,
    previousTotal: 0,
    currentCompleted: 0,
    previousCompleted: 0,
    pendingReview: 0,
  });

  useEffect(() => {
    if (!employee?.service_id) {
      setInsightLoading(false);
      return;
    }

    const run = async () => {
      setInsightLoading(true);

      const now = new Date();
      const startCurrent = new Date(now);
      startCurrent.setDate(now.getDate() - 6);
      const startPrevious = new Date(now);
      startPrevious.setDate(now.getDate() - 13);
      const startCurrentIso = startCurrent.toISOString();
      const startPreviousIso = startPrevious.toISOString();
      const nowIso = now.toISOString();

      const [
        upcomingRes,
        recentRes,
        tasksRes,
        notifRes,
        currentTotalRes,
        previousTotalRes,
        currentCompletedRes,
        previousCompletedRes,
        pendingReviewRes,
      ] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, status, scheduled_date, scheduled_time, location, contact_name, details, services(name,slug)')
          .eq('service_id', employee.service_id)
          .gte('scheduled_date', now.toISOString().slice(0, 10))
          .order('scheduled_date', { ascending: true })
          .limit(8),
        supabase
          .from('bookings')
          .select('id, status, scheduled_date, scheduled_time, location, contact_name, created_at, details, services(name,slug)')
          .eq('service_id', employee.service_id)
          .order('created_at', { ascending: false })
          .limit(6),
        employee?.user_id
          ? supabase
              .from('task_delegations')
              .select('id, title, status, priority, due_date')
              .eq('assigned_to', employee.user_id)
              .in('status', ['pending', 'accepted', 'in_progress'])
              .order('due_date', { ascending: true, nullsFirst: false })
              .limit(6)
          : Promise.resolve({ data: [] }),
        employee?.user_id
          ? supabase
              .from('notifications')
              .select('id, title, body, type, read, created_at')
              .eq('user_id', employee.user_id)
              .order('created_at', { ascending: false })
              .limit(8)
          : Promise.resolve({ data: [] }),
        supabase
          .from('bookings')
          .select('*', { head: true, count: 'exact' })
          .eq('service_id', employee.service_id)
          .gte('created_at', startCurrentIso)
          .lte('created_at', nowIso),
        supabase
          .from('bookings')
          .select('*', { head: true, count: 'exact' })
          .eq('service_id', employee.service_id)
          .gte('created_at', startPreviousIso)
          .lt('created_at', startCurrentIso),
        supabase
          .from('bookings')
          .select('*', { head: true, count: 'exact' })
          .eq('service_id', employee.service_id)
          .eq('status', 'completed')
          .gte('created_at', startCurrentIso)
          .lte('created_at', nowIso),
        supabase
          .from('bookings')
          .select('*', { head: true, count: 'exact' })
          .eq('service_id', employee.service_id)
          .eq('status', 'completed')
          .gte('created_at', startPreviousIso)
          .lt('created_at', startCurrentIso),
        supabase
          .from('bookings')
          .select('*', { head: true, count: 'exact' })
          .eq('service_id', employee.service_id)
          .eq('status', 'pending_review'),
      ]);

      setUpcomingBookings(upcomingRes.data || []);
      setRecentBookings(recentRes.data || []);
      setActiveTasks(tasksRes.data || []);
      setAnnouncementFeed(notifRes.data || []);
      setKpis({
        currentTotal: currentTotalRes.count || 0,
        previousTotal: previousTotalRes.count || 0,
        currentCompleted: currentCompletedRes.count || 0,
        previousCompleted: previousCompletedRes.count || 0,
        pendingReview: pendingReviewRes.count || 0,
      });
      setInsightLoading(false);
    };

    run();
  }, [employee?.service_id, employee?.user_id]);

  const completionRate = kpis.currentTotal > 0
    ? Math.round((kpis.currentCompleted / kpis.currentTotal) * 100)
    : 0;

  const trendText = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%';
    const pct = Math.round(((current - previous) / previous) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
  };

  const quickActions: QuickAction[] = [
    { label: 'Bookings', page: 'bookings' as OverviewNavKey, icon: Calendar, show: hasCapability('div.view') },
    { label: 'Schedule', page: 'schedule' as OverviewNavKey, icon: Clock, show: hasCapability('div.view') },
    { label: 'Documents', page: 'documents' as OverviewNavKey, icon: Briefcase, show: hasCapability('div.manage_documents') },
    { label: 'Submit Report', page: 'report' as OverviewNavKey, icon: ClipboardList, show: hasCapability('div.reports') },
    { label: 'Delegated Tasks', page: 'delegated-tasks' as OverviewNavKey, icon: GitBranch, show: true },
    { label: 'Notifications', page: 'notifications' as OverviewNavKey, icon: Bell, show: true },
    { label: 'Cash Collections', page: 'cash-collections' as OverviewNavKey, icon: Banknote, show: hasCapability('div.cash_collections') },
    { label: 'Manage Division', page: 'manage-division' as OverviewNavKey, icon: Shield, show: isDivisionHead || hasCapability('div.manage_staff_access') },
  ].filter((a) => a.show);

  const unreadCount = announcementFeed.filter((n) => !n.read).length;
  const todayFocus = [
    upcomingBookings[0]
      ? {
          key: 'next-shift',
          title: 'Next booking today',
          detail: `${upcomingBookings[0].services?.name || 'Service'} - ${upcomingBookings[0].contact_name || 'Client'}`,
          page: 'schedule',
          priority: 'high',
        }
      : null,
    activeTasks.length > 0
      ? {
          key: 'task',
          title: `${activeTasks.length} delegated task${activeTasks.length > 1 ? 's' : ''} active`,
          detail: activeTasks[0]?.title || 'Review your assigned tasks',
          page: 'delegated-tasks',
          priority: 'high',
        }
      : null,
    kpis.pendingReview > 0
      ? {
          key: 'review',
          title: `${kpis.pendingReview} booking${kpis.pendingReview > 1 ? 's' : ''} pending review`,
          detail: 'Review and update status to keep operations moving',
          page: 'bookings',
          priority: 'medium',
        }
      : null,
    unreadCount > 0
      ? {
          key: 'alerts',
          title: `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`,
          detail: 'Check team updates and client notifications',
          page: 'notifications',
          priority: 'medium',
        }
      : null,
    hasCapability('div.reports')
      ? {
          key: 'report',
          title: 'Submit today report',
          detail: 'Share daily progress or incidents for your division',
          page: 'report',
          priority: 'low',
        }
      : null,
  ].filter(Boolean).slice(0, 3) as TodayFocusItem[];

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Quick Actions</h2>
          <span className="text-xs text-slate-400">{quickActions.length} shortcuts</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.page}
                onClick={() => onNavigate(action.page)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-medium transition-colors"
              >
                <Icon className="w-4 h-4 text-slate-500" />
                <span className="truncate">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Today Focus</h2>
          {insightLoading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        </div>
        {todayFocus.length === 0 ? (
          <p className="text-sm text-slate-500">No urgent actions right now. Great work.</p>
        ) : (
          <div className="space-y-2.5">
            {todayFocus.map((item) => (
              <button
                key={item.key}
                onClick={() => onNavigate(item.page)}
                className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      item.priority === 'high'
                        ? 'bg-red-50 text-red-600'
                        : item.priority === 'medium'
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.priority}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Bookings (7d)</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{kpis.currentTotal}</p>
          <p className={`text-xs mt-1 ${kpis.currentTotal >= kpis.previousTotal ? 'text-emerald-600' : 'text-red-500'}`}>
            vs previous: {trendText(kpis.currentTotal, kpis.previousTotal)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Completed (7d)</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{kpis.currentCompleted}</p>
          <p className={`text-xs mt-1 ${kpis.currentCompleted >= kpis.previousCompleted ? 'text-emerald-600' : 'text-red-500'}`}>
            vs previous: {trendText(kpis.currentCompleted, kpis.previousCompleted)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Completion Rate</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{completionRate}%</p>
          <p className="text-xs text-slate-500 mt-1">From current 7-day requests</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Pending Review</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{kpis.pendingReview}</p>
          <p className={`text-xs mt-1 ${kpis.pendingReview > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {kpis.pendingReview > 0 ? 'Needs attention' : 'All clear'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900">Client Service Intelligence</h2>
            <button onClick={() => onNavigate('bookings')} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
              Open bookings
            </button>
          </div>
          {recentBookings.length === 0 ? (
            <p className="text-sm text-slate-500">No recent client submissions yet.</p>
          ) : (
            <div className="space-y-2.5">
              {recentBookings.slice(0, 4).map((b) => {
                const mode = b.details?.quote_request ? 'Quote' : 'Hire';
                const urgency = String(b.details?.urgency || b.details?.risk_level || b.details?.waste_class || 'normal');
                const payment = String(b.details?.payment_method || 'not specified');
                const attention = ['pending', 'pending_review'].includes(b.status) || /high|urgent|critical/i.test(urgency);
                return (
                  <div key={b.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {b.contact_name || 'Client'} - {b.services?.name || 'Service'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {fmtDate(b.scheduled_date)}
                          {b.location ? ` - ${b.location}` : ''}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          attention ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {attention ? 'Attention' : 'Stable'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700">{mode}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">Urgency: {urgency}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">Payment: {payment}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900">Division Announcements & Shift Alerts</h2>
            <button onClick={() => onNavigate('notifications')} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
              View all
            </button>
          </div>
          <div className="space-y-2.5">
            {upcomingBookings.slice(0, 2).map((b) => (
              <div key={`shift-${b.id}`} className="p-3 rounded-xl border border-blue-200 bg-blue-50">
                <p className="text-xs font-semibold text-blue-700">Shift Alert</p>
                <p className="text-sm text-blue-900 mt-0.5">
                  {b.services?.name || 'Service'} for {b.contact_name || 'client'} on {fmtDate(b.scheduled_date)}
                  {b.scheduled_time ? ` at ${b.scheduled_time}` : ''}
                </p>
              </div>
            ))}

            {announcementFeed.length === 0 && upcomingBookings.length === 0 ? (
              <p className="text-sm text-slate-500">No announcements yet.</p>
            ) : (
              announcementFeed.slice(0, 4).map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-xl border ${
                    n.read ? 'border-slate-200 bg-slate-50/60' : 'border-emerald-200 bg-emerald-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800 truncate">{n.title || 'Update'}</p>
                    {!n.read && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">New</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{fmtDate(n.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
