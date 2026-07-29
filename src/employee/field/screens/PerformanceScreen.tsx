import { useMemo } from 'react';
import { TrendingUp, CheckCircle2, Clock, AlertTriangle, Briefcase, Award } from 'lucide-react';
import { useFieldStaff } from '../FieldStaffContext';

export function PerformanceScreen() {
  const { assignments, incidents, attendance } = useFieldStaff();

  const stats = useMemo(() => {
    const completed = assignments.filter(a => a.status === 'approved');
    const inProgress = assignments.filter(a => a.status === 'in_progress');
    const pendingReview = assignments.filter(a => a.status === 'pending_review');
    const rejected = assignments.filter(a => a.status === 'rejected');
    const total = assignments.length;
    const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;
    const openIncidents = incidents.filter(i => i.status === 'open').length;
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const totalEarnings = completed.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    return { completed, inProgress, pendingReview, rejected, total, completionRate, openIncidents, presentDays, totalEarnings };
  }, [assignments, incidents, attendance]);

  return (
    <div className="max-w-md mx-auto px-4 py-5 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Performance</h1>
        <p className="text-sm text-slate-400">Your work statistics and metrics</p>
      </div>

      {/* Completion rate hero */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-5 h-5 text-emerald-100" />
            <p className="text-sm font-semibold text-emerald-100">Completion Rate</p>
          </div>
          <p className="text-4xl font-bold">{stats.completionRate}%</p>
          <p className="text-xs text-emerald-100 mt-1">{stats.completed.length} of {stats.total} jobs approved</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={CheckCircle2} label="Completed"   value={stats.completed.length}    color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard icon={Clock}         label="In Progress" value={stats.inProgress.length}  color="text-amber-600"   bg="bg-amber-50" />
        <StatCard icon={Briefcase}     label="In Review"   value={stats.pendingReview.length} color="text-purple-600" bg="bg-purple-50" />
        <StatCard icon={AlertTriangle} label="Incidents"   value={stats.openIncidents}       color="text-red-600"    bg="bg-red-50" />
      </div>

      {/* Earnings */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">Total Earnings</h3>
        </div>
        <p className="text-2xl font-bold text-slate-900">SLE {stats.totalEarnings.toFixed(2)}</p>
        <p className="text-xs text-slate-400 mt-0.5">From {stats.completed.length} approved jobs</p>
      </div>

      {/* Attendance summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Attendance</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.presentDays}</p>
            <p className="text-xs text-slate-400">Days present</p>
          </div>
          <div className="flex gap-1.5">
            {attendance.slice(0, 14).map(a => (
              <div
                key={a.id}
                className={`w-3 h-3 rounded ${
                  a.status === 'present' ? 'bg-emerald-500' :
                  a.status === 'late' ? 'bg-amber-500' :
                  a.status === 'half_day' ? 'bg-blue-500' :
                  'bg-red-400'
                }`}
                title={`${a.work_date}: ${a.status}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Rejected jobs */}
      {stats.rejected.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold text-slate-900">Rejected Jobs ({stats.rejected.length})</h3>
          </div>
          <div className="space-y-2">
            {stats.rejected.map(j => (
              <div key={j.id} className="flex items-center gap-2 text-sm">
                <span className="text-slate-700">{j.service_name}</span>
                <span className="text-xs text-slate-400">· {j.customer_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: typeof Home; label: string; value: number; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-2.5`}>
        <Icon className={`w-4.5 h-4.5 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

import { Home } from 'lucide-react';
