import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, Inbox, Loader2, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { localWorkDate } from '../lib/attendance';
import { isInternalDepartmentSlug } from '../../lib/capabilities';

function mondayOfWeek(d = new Date()) {
  const copy = new Date(d);
  const day = copy.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + offset);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function hoursBetween(start: string | null, end: string | null) {
  if (!start) return 0;
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / 3_600_000;
}

export function EmployeeScorecard() {
  const { employee, user } = useAuth();
  const isInternal = isInternalDepartmentSlug(employee?.services?.slug);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    assigned: 0,
    completed: 0,
    hours: 0,
    tasksDone: 0,
    leavePending: 0,
  });

  useEffect(() => {
    if (!employee || !user) { setLoading(false); return; }
    const start = mondayOfWeek();
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const startDate = localWorkDate(start);
    const endDate = localWorkDate(end);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    void (async () => {
      const emptyCount = Promise.resolve({ count: 0 });
      const [assignedRes, completedRes, attRes, tasksRes, leaveRes] = await Promise.all([
        isInternal ? emptyCount : supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .gte('scheduled_date', startDate)
          .lt('scheduled_date', endDate)
          .not('status', 'eq', 'cancelled'),
        isInternal ? emptyCount : supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .eq('status', 'completed')
          .gte('scheduled_date', startDate)
          .lt('scheduled_date', endDate),
        supabase
          .from('office_attendance')
          .select('clock_in_at, clock_out_at')
          .eq('employee_id', employee.id)
          .gte('work_date', startDate)
          .lt('work_date', endDate),
        supabase
          .from('task_delegations')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .eq('status', 'completed')
          .gte('completed_at', startIso)
          .lt('completed_at', endIso),
        supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employee.id)
          .eq('status', 'pending'),
      ]);

      const hours = ((attRes.data as { clock_in_at: string | null; clock_out_at: string | null }[]) || [])
        .reduce((sum, row) => sum + hoursBetween(row.clock_in_at, row.clock_out_at), 0);

      setStats({
        assigned: assignedRes.count || 0,
        completed: completedRes.count || 0,
        hours: Math.round(hours * 10) / 10,
        tasksDone: tasksRes.count || 0,
        leavePending: leaveRes.count || 0,
      });
      setLoading(false);
    })();
  }, [employee, user, isInternal]);

  const rate = stats.assigned > 0 ? Math.round((stats.completed / stats.assigned) * 100) : 0;
  const cards = [
    { label: 'Jobs this week', value: String(stats.assigned), hint: isInternal ? 'N/A for this department' : 'Assigned to you', icon: Inbox },
    { label: 'Completed', value: String(stats.completed), hint: `${rate}% of assigned`, icon: CheckCircle2 },
    { label: 'Hours clocked', value: `${stats.hours}h`, hint: 'Office attendance', icon: Clock },
    { label: 'Tasks closed', value: String(stats.tasksDone), hint: stats.leavePending ? `${stats.leavePending} leave pending` : 'Delegated work', icon: ClipboardList },
  ];

  return (
    <section className="emp-fade-in space-y-3" aria-labelledby="scorecard-heading">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-emerald-600" aria-hidden="true" />
        <h2 id="scorecard-heading" className="text-sm font-bold text-slate-900">This week</h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-8" role="status">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-hidden="true" />
          <span className="sr-only">Loading this week’s scorecard</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card, i) => {
            const Icon = card.icon;
            return (
              <article
                key={card.label}
                className="emp-fade-in bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-500">{card.label}</p>
                  <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />
                </div>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{card.value}</p>
                <p className="text-xs text-slate-400 mt-1">{card.hint}</p>
                {card.label === 'Completed' && (
                  <div
                    className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={rate}
                    aria-label="Completion rate this week"
                  >
                    <div className="h-full bg-emerald-500 rounded-full transition-[width] duration-500" style={{ width: `${rate}%` }} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
