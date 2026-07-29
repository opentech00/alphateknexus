import { useMemo } from 'react';
import {
  ClipboardList, Clock, MapPin, AlertTriangle, ChevronRight,
  CheckCircle2, Calendar, TrendingUp, Zap, Briefcase,
} from 'lucide-react';
import { useAuth } from '../../contexts/EmployeeAuthContext';
import { useFieldStaff } from '../FieldStaffContext';
import { STATUS_META } from '../types';

export function DashboardScreen({ onOpenJob, onReportIncident }: {
  onOpenJob: (id: string) => void;
  onReportIncident: () => void;
}) {
  const { employee } = useAuth();
  const { assignments, todayAttendance, incidents } = useFieldStaff();

  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    const active = assignments.filter(a =>
      a.status === 'assigned' || a.status === 'accepted' || a.status === 'in_progress'
    );
    const todayJobs = assignments.filter(a => a.scheduled_date === today);
    const completed = assignments.filter(a => a.status === 'approved');
    const pendingReview = assignments.filter(a => a.status === 'pending_review');
    return { active: active.length, today: todayJobs.length, completed: completed.length, pendingReview: pendingReview.length };
  }, [assignments, today]);

  const todayJobs = useMemo(
    () => assignments.filter(a => a.scheduled_date === today).sort((a, b) =>
      (a.scheduled_time || '').localeCompare(b.scheduled_time || '')
    ),
    [assignments, today],
  );

  const upcomingJobs = useMemo(
    () => assignments
      .filter(a => a.scheduled_date && a.scheduled_date > today && (a.status === 'assigned' || a.status === 'accepted'))
      .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))
      .slice(0, 3),
    [assignments, today],
  );

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="max-w-md mx-auto px-4 py-5 space-y-5">
      {/* Welcome */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="relative">
          <p className="text-sm text-emerald-100">{greeting},</p>
          <h1 className="text-xl font-bold leading-tight">{employee?.full_name?.split(' ')[0]}</h1>
          <p className="text-xs text-emerald-100 mt-0.5">{employee?.position || employee?.hr_roles?.name || 'Field Staff'}</p>
          <div className="mt-4 flex items-center gap-2">
            {todayAttendance?.clock_in ? (
              <span className="inline-flex items-center gap-1.5 text-xs bg-white/15 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5" /> Clocked in
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs bg-white/15 px-2.5 py-1 rounded-lg">
                <Clock className="w-3.5 h-3.5" /> Not clocked in
              </span>
            )}
            <span className="text-xs text-emerald-100">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={ClipboardList} label="Active Jobs" value={stats.active} color="text-blue-600" bg="bg-blue-50" />
        <StatTile icon={Calendar}      label="Today"       value={stats.today}   color="text-amber-600" bg="bg-amber-50" />
        <StatTile icon={CheckCircle2}   label="Completed"  value={stats.completed} color="text-emerald-600" bg="bg-emerald-50" />
        <StatTile icon={Clock}          label="In Review"  value={stats.pendingReview} color="text-purple-600" bg="bg-purple-50" />
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={onReportIncident}
          className="flex-1 flex items-center justify-center gap-2 bg-white border border-red-200 rounded-xl py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
        >
          <AlertTriangle className="w-4 h-4" /> Report Incident
        </button>
        <button
          onClick={() => {}}
          className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-xl py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <TrendingUp className="w-4 h-4" /> My Stats
        </button>
      </div>

      {/* Today's jobs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Today's Schedule</h2>
          {todayJobs.length > 0 && <span className="text-xs text-slate-400">{todayJobs.length} job{todayJobs.length !== 1 ? 's' : ''}</span>}
        </div>
        {todayJobs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No jobs scheduled for today</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {todayJobs.map(job => {
              const sm = STATUS_META[job.status];
              return (
                <button
                  key={job.id}
                  onClick={() => onOpenJob(job.id)}
                  className="w-full bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all text-left flex items-center gap-3"
                >
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{job.service_name}</p>
                    <p className="text-xs text-slate-400 truncate">{job.customer_name || job.address}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {job.scheduled_time && <span className="text-xs text-slate-500">{job.scheduled_time}</span>}
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${sm.bg} ${sm.color}`}>
                        <span className={`w-1 h-1 rounded-full ${sm.dot}`} />
                        {sm.label}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Upcoming */}
      {upcomingJobs.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-slate-900 mb-3">Upcoming</h2>
          <div className="space-y-2">
            {upcomingJobs.map(job => (
              <button
                key={job.id}
                onClick={() => onOpenJob(job.id)}
                className="w-full bg-white rounded-xl border border-slate-200 p-3.5 flex items-center gap-3 hover:shadow-sm transition-all text-left"
              >
                <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{job.service_name}</p>
                  <p className="text-xs text-slate-400">{job.scheduled_date} {job.scheduled_time && `· ${job.scheduled_time}`}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recent incidents */}
      {incidents.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-slate-900 mb-3">Recent Incidents</h2>
          <div className="space-y-2">
            {incidents.slice(0, 2).map(inc => (
              <div key={inc.id} className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-start gap-3">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{inc.incident_type}</p>
                  <p className="text-xs text-slate-400 truncate">{inc.description}</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  inc.status === 'open' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                }`}>{inc.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, color, bg }: {
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
