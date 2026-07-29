import { useMemo } from 'react';
import {
  TrendingUp, CheckCircle2, Clock, AlertTriangle, Briefcase, Award,
  Target, Zap, Calendar, Star,
} from 'lucide-react';
import { useFieldStaff } from '../FieldStaffContext';
import { STATUS_META } from '../types';

export function PerformanceScreen() {
  const { assignments, incidents, attendance, jobScores, checkIns } = useFieldStaff();

  const stats = useMemo(() => {
    const completed = assignments.filter(a => a.status === 'approved');
    const inProgress = assignments.filter(a => a.status === 'in_progress');
    const pendingReview = assignments.filter(a => a.status === 'pending_review');
    const rejected = assignments.filter(a => a.status === 'rejected');
    const total = assignments.length;
    const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;
    const openIncidents = incidents.filter(i => i.status === 'open').length;
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const lateDays = attendance.filter(a => a.status === 'late').length;
    const totalEarnings = completed.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    // On-time rate: check-in within 15 min of scheduled time
    let onTimeCount = 0;
    let checkedInCount = 0;
    completed.forEach(a => {
      const ci = checkIns[a.id];
      if (ci?.checkin_time && a.scheduled_time) {
        checkedInCount++;
        const checkinMins = new Date(ci.checkin_time).getTime() / 60000;
        const [h, m] = a.scheduled_time.split(':').map(Number);
        const scheduledMins = h * 60 + m;
        const diff = Math.abs(checkinMins % (24 * 60) - scheduledMins);
        if (diff <= 15) onTimeCount++;
      }
    });
    const onTimeRate = checkedInCount > 0 ? Math.round((onTimeCount / checkedInCount) * 100) : 0;

    // Average job duration
    let totalDurationMin = 0;
    let durationCount = 0;
    completed.forEach(a => {
      const ci = checkIns[a.id];
      if (ci?.checkin_time && ci?.checkout_time) {
        const dur = (new Date(ci.checkout_time).getTime() - new Date(ci.checkin_time).getTime()) / 60000;
        if (dur > 0 && dur < 600) { totalDurationMin += dur; durationCount++; }
      }
    });
    const avgDuration = durationCount > 0 ? Math.round(totalDurationMin / durationCount) : 0;

    // Average score
    const scoreValues = Object.values(jobScores);
    const avgScore = scoreValues.length > 0
      ? Math.round(scoreValues.reduce((s, sc) => s + sc.overall_score, 0) / scoreValues.length)
      : 0;

    // Weekly stats
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekJobs = completed.filter(a => new Date(a.updated_at) >= weekStart);
    const weekEarnings = weekJobs.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    return {
      completed, inProgress, pendingReview, rejected, total,
      completionRate, openIncidents, presentDays, lateDays,
      totalEarnings, onTimeRate, avgDuration, avgScore,
      weekJobs: weekJobs.length, weekEarnings,
    };
  }, [assignments, incidents, attendance, jobScores, checkIns]);

  const fmtDuration = (mins: number) => {
    if (mins === 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="max-w-md mx-auto px-4 py-5 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Performance</h1>
        <p className="text-sm text-slate-400">Your work statistics and metrics</p>
      </div>

      {/* Completion rate hero with score */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-100" />
              <p className="text-sm font-semibold text-emerald-100">Completion Rate</p>
            </div>
            {stats.avgScore > 0 && (
              <div className="flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-lg">
                <Star className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-sm font-bold">{stats.avgScore}/100</span>
              </div>
            )}
          </div>
          <p className="text-4xl font-bold">{stats.completionRate}%</p>
          <p className="text-xs text-emerald-100 mt-1">{stats.completed.length} of {stats.total} jobs approved</p>
        </div>
      </div>

      {/* Weekly summary card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">This Week</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.weekJobs}</p>
            <p className="text-xs text-slate-400">Jobs completed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600">SLE {stats.weekEarnings.toFixed(2)}</p>
            <p className="text-xs text-slate-400">Earnings</p>
          </div>
        </div>
      </div>

      {/* Pro metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <ProMetric icon={Target} label="On-Time Rate" value={`${stats.onTimeRate}%`} color="text-emerald-600" bg="bg-emerald-50" />
        <ProMetric icon={Clock} label="Avg Duration" value={fmtDuration(stats.avgDuration)} color="text-blue-600" bg="bg-blue-50" />
        <ProMetric icon={CheckCircle2} label="Completed" value={stats.completed.length} color="text-emerald-600" bg="bg-emerald-50" />
        <ProMetric icon={Briefcase} label="In Review" value={stats.pendingReview.length} color="text-purple-600" bg="bg-purple-50" />
        <ProMetric icon={Clock} label="In Progress" value={stats.inProgress.length} color="text-amber-600" bg="bg-amber-50" />
        <ProMetric icon={AlertTriangle} label="Incidents" value={stats.openIncidents} color="text-red-600" bg="bg-red-50" />
      </div>

      {/* Total earnings */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">Total Earnings</h3>
        </div>
        <p className="text-2xl font-bold text-slate-900">SLE {stats.totalEarnings.toFixed(2)}</p>
        <p className="text-xs text-slate-400 mt-0.5">From {stats.completed.length} approved jobs</p>
      </div>

      {/* Job scores breakdown */}
      {Object.keys(jobScores).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">Job Scores</h3>
          </div>
          <div className="space-y-2.5">
            {Object.entries(jobScores).map(([assignmentId, score]) => {
              const job = assignments.find(a => a.id === assignmentId);
              return (
                <div key={assignmentId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{job?.service_name || 'Unknown job'}</p>
                    <div className="flex gap-3 mt-0.5">
                      <span className="text-[10px] text-slate-400">Punctuality: {score.punctuality_score}</span>
                      <span className="text-[10px] text-slate-400">Speed: {score.speed_score}</span>
                      <span className="text-[10px] text-slate-400">Quality: {score.quality_score}</span>
                    </div>
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    score.overall_score >= 80 ? 'bg-emerald-100' :
                    score.overall_score >= 60 ? 'bg-amber-100' : 'bg-red-100'
                  }`}>
                    <span className={`text-sm font-bold ${
                      score.overall_score >= 80 ? 'text-emerald-700' :
                      score.overall_score >= 60 ? 'text-amber-700' : 'text-red-700'
                    }`}>{score.overall_score}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Attendance summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Attendance</h3>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.presentDays}</p>
              <p className="text-xs text-slate-400">Present</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats.lateDays}</p>
              <p className="text-xs text-slate-400">Late</p>
            </div>
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

function ProMetric({ icon: Icon, label, value, color, bg }: {
  icon: typeof Home; label: string; value: string | number; color: string; bg: string;
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
