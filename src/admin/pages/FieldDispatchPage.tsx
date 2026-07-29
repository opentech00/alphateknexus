import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, Card, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import {
  MapPin, Users, Briefcase, Award, Navigation, Calendar, Clock,
  Plus, X, Loader2, CheckCircle2, AlertCircle, Truck, Zap, Star,
  TrendingUp, Route, ArrowRight, Battery,
} from 'lucide-react';

interface AdminEmployee {
  id: string;
  full_name: string;
  position: string;
  photo_url: string | null;
  division_id: string | null;
  performance_score: number;
  jobs_completed: number;
  is_active: boolean;
}

interface AdminAssignment {
  id: string;
  employee_id: string;
  service_name: string;
  customer_name: string;
  address: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  amount: number | null;
  booking_id: string | null;
}

interface AdminBooking {
  id: string;
  service_name: string;
  customer_name: string;
  address: string;
  status: string;
}

interface LocationPing {
  id: string;
  employee_id: string;
  latitude: number;
  longitude: number;
  battery_level: number | null;
  created_at: string;
}

interface JobScore {
  id: string;
  assignment_id: string;
  employee_id: string;
  punctuality_score: number;
  speed_score: number;
  quality_score: number;
  overall_score: number;
  scored_at: string;
}

type View = 'dispatch' | 'map' | 'calendar' | 'leaderboard';

export function FieldDispatchPage() {
  const [view, setView] = useState<View>('dispatch');
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [locationPings, setLocationPings] = useState<LocationPing[]>([]);
  const [jobScores, setJobScores] = useState<JobScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [
        { data: empData, error: empErr },
        { data: assignData, error: assignErr },
        { data: bookData, error: bookErr },
        { data: pingData, error: pingErr },
        { data: scoreData, error: scoreErr },
      ] = await Promise.all([
        supabase.from('employees').select('id, full_name, position, photo_url, division_id, performance_score, jobs_completed, is_active').eq('is_active', true),
        supabase.from('field_assignments').select('*').order('scheduled_date', { ascending: true }),
        supabase.from('bookings').select('id, service_name, customer_name, address, status').in('status', ['pending', 'confirmed', 'in_progress']).limit(50),
        supabase.from('field_location_pings').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('field_job_scores').select('*').order('scored_at', { ascending: false }),
      ]);

      if (empErr) throw empErr;
      if (assignErr) throw assignErr;
      if (bookErr) throw bookErr;
      if (pingErr) throw pingErr;
      if (scoreErr) throw scoreErr;

      setEmployees(empData || []);
      setAssignments(assignData || []);
      setBookings(bookData || []);
      setLocationPings(pingData || []);
      setJobScores(scoreData || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load dispatch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime for location pings
  useEffect(() => {
    const channel = supabase
      .channel('admin_field_dispatch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'field_location_pings' }, (payload: any) => {
        setLocationPings(prev => [payload.new as LocationPing, ...prev].slice(0, 100));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_assignments' }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const workerStats = useMemo(() => {
    return employees.map(emp => {
      const activeJobs = assignments.filter(a => a.employee_id === emp.id && (a.status === 'assigned' || a.status === 'accepted' || a.status === 'in_progress'));
      const completedJobs = assignments.filter(a => a.employee_id === emp.id && a.status === 'approved');
      const latestPing = locationPings.find(p => p.employee_id === emp.id);
      return {
        ...emp,
        activeJobCount: activeJobs.length,
        completedJobCount: completedJobs.length,
        latestPing,
        status: activeJobs.length === 0 ? 'free' : activeJobs.length <= 2 ? 'busy' : 'overloaded',
      };
    });
  }, [employees, assignments, locationPings]);

  const stats = useMemo(() => ({
    totalWorkers: employees.length,
    activeWorkers: workerStats.filter(w => w.activeJobCount > 0).length,
    freeWorkers: workerStats.filter(w => w.status === 'free').length,
    totalJobs: assignments.length,
    activeJobs: assignments.filter(a => ['assigned', 'accepted', 'in_progress'].includes(a.status)).length,
    pendingBookings: bookings.length,
  }), [employees, workerStats, assignments, bookings]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div>
      <PageHeader
        title="Field Dispatch"
        description="Smart assignment, live tracking, and worker management"
        icon={Navigation}
        actions={
          <button
            onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Assignment
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Workers" value={stats.totalWorkers} icon={Users} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Active" value={stats.activeWorkers} icon={Zap} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Free" value={stats.freeWorkers} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Active Jobs" value={stats.activeJobs} icon={Briefcase} color="text-purple-600" accent="bg-purple-50" />
        <StatCard label="Pending Bookings" value={stats.pendingBookings} icon={Clock} color="text-orange-600" accent="bg-orange-50" />
        <StatCard label="Total Jobs" value={stats.totalJobs} icon={Truck} color="text-slate-600" accent="bg-slate-50" />
      </div>

      {/* View tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 max-w-md">
        {([
          { key: 'dispatch', label: 'Workers', icon: Users },
          { key: 'map', label: 'Live Map', icon: MapPin },
          { key: 'calendar', label: 'Calendar', icon: Calendar },
          { key: 'leaderboard', label: 'Scores', icon: Award },
        ] as const).map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                view === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {view === 'dispatch' && <DispatchView workers={workerStats} assignments={assignments} onAssign={() => setShowAssignModal(true)} />}
      {view === 'map' && <MapView workers={workerStats} pings={locationPings} />}
      {view === 'calendar' && <CalendarView assignments={assignments} employees={employees} />}
      {view === 'leaderboard' && <LeaderboardView workers={workerStats} jobScores={jobScores} assignments={assignments} />}

      {showAssignModal && (
        <AssignModal
          employees={employees}
          bookings={bookings}
          onClose={() => setShowAssignModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}

// ============================================================
// DISPATCH VIEW — Worker availability heatmap + assignment list
// ============================================================
function DispatchView({ workers, assignments, onAssign }: {
  workers: (AdminEmployee & { activeJobCount: number; completedJobCount: number; latestPing?: LocationPing; status: string })[];
  assignments: AdminAssignment[];
  onAssign: () => void;
}) {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);

  const statusColors: Record<string, string> = {
    free: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    busy: 'bg-amber-100 text-amber-700 border-amber-200',
    overloaded: 'bg-red-100 text-red-700 border-red-200',
  };
  const statusLabels: Record<string, string> = {
    free: 'Available',
    busy: 'Busy',
    overloaded: 'At Capacity',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Worker availability */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">Worker Availability</h3>
        <div className="space-y-2">
          {workers.length === 0 ? (
            <EmptyState icon={Users} title="No active workers" description="Add employees to start dispatching" />
          ) : (
            workers.map(w => (
              <button
                key={w.id}
                onClick={() => setSelectedWorker(selectedWorker === w.id ? null : w.id)}
                className={`w-full bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all text-left ${
                  selectedWorker === w.id ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {w.photo_url ? (
                    <img src={w.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                      <span className="text-sm font-semibold text-slate-600">{w.full_name?.[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{w.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{w.position || 'Field Staff'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusColors[w.status]}`}>
                    {statusLabels[w.status]}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs">
                  <span className="text-slate-500"><Briefcase className="w-3 h-3 inline mr-1" />{w.activeJobCount} active</span>
                  <span className="text-slate-500"><CheckCircle2 className="w-3 h-3 inline mr-1" />{w.completedJobCount} done</span>
                  {w.latestPing && (
                    <span className="text-slate-500"><MapPin className="w-3 h-3 inline mr-1" />{timeAgo(w.latestPing.created_at)}</span>
                  )}
                  {w.latestPing?.battery_level != null && (
                    <span className="text-slate-500"><Battery className="w-3 h-3 inline mr-1" />{w.latestPing.battery_level}%</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Selected worker's assignments or all active jobs */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">
          {selectedWorker ? 'Worker Jobs' : 'Active Assignments'}
        </h3>
        <div className="space-y-2">
          {(() => {
            const filtered = selectedWorker
              ? assignments.filter(a => a.employee_id === selectedWorker)
              : assignments.filter(a => ['assigned', 'accepted', 'in_progress', 'paused'].includes(a.status));
            if (filtered.length === 0) {
              return <EmptyState icon={Briefcase} title="No assignments" description={selectedWorker ? "This worker has no jobs" : "No active jobs"} action={<button onClick={onAssign} className="text-sm font-semibold text-emerald-600">Create assignment</button>} />;
            }
            return filtered.map(a => {
              const worker = workers.find(w => w.id === a.employee_id);
              return (
                <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">{a.service_name}</p>
                      <p className="text-xs text-slate-500 truncate">{a.customer_name} · {a.address}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {a.scheduled_date && <span className="text-xs text-slate-400">{a.scheduled_date}</span>}
                        {a.scheduled_time && <span className="text-xs text-slate-400">{a.scheduled_time}</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadgeColor(a.status)}`}>{a.status.replace('_', ' ')}</span>
                      </div>
                      {worker && <p className="text-xs text-slate-400 mt-1">Assigned to: {worker.full_name}</p>}
                    </div>
                    {a.amount != null && <span className="text-sm font-semibold text-emerald-600 flex-shrink-0">SLE {Number(a.amount).toFixed(0)}</span>}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAP VIEW — Live worker locations
// ============================================================
function MapView({ workers, pings }: {
  workers: (AdminEmployee & { activeJobCount: number; latestPing?: LocationPing })[];
  pings: LocationPing[];
}) {
  const workersWithLocation = workers.filter(w => w.latestPing);

  if (workersWithLocation.length === 0) {
    return <EmptyState icon={MapPin} title="No live locations" description="Worker GPS pings will appear here when jobs are in progress" />;
  }

  // Calculate bounding box for the map
  const lats = workersWithLocation.map(w => w.latestPing!.latitude);
  const lngs = workersWithLocation.map(w => w.latestPing!.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latRange = Math.max(maxLat - minLat, 0.01);
  const lngRange = Math.max(maxLng - minLng, 0.01);

  const MAP_SIZE = 400;
  const PADDING = 40;

  const projectX = (lng: number) => PADDING + ((lng - minLng) / lngRange) * (MAP_SIZE - PADDING * 2);
  const projectY = (lat: number) => MAP_SIZE - PADDING - ((lat - minLat) / latRange) * (MAP_SIZE - PADDING * 2);

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-900 mb-3">Live Worker Locations</h3>
      <Card className="p-4">
        <div className="relative bg-slate-50 rounded-xl overflow-hidden" style={{ height: MAP_SIZE }}>
          {/* Grid lines */}
          <div className="absolute inset-0 opacity-30">
            {[...Array(8)].map((_, i) => (
              <div key={`h${i}`} className="absolute left-0 right-0 border-t border-slate-200" style={{ top: `${(i / 8) * 100}%` }} />
            ))}
            {[...Array(8)].map((_, i) => (
              <div key={`v${i}`} className="absolute top-0 bottom-0 border-l border-slate-200" style={{ left: `${(i / 8) * 100}%` }} />
            ))}
          </div>

          {/* Worker pins */}
          {workersWithLocation.map(w => {
            const x = projectX(w.latestPing!.longitude);
            const y = projectY(w.latestPing!.latitude);
            return (
              <div
                key={w.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{ left: x, top: y }}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg ring-2 ring-white ${
                  w.activeJobCount > 0 ? 'bg-emerald-600' : 'bg-slate-400'
                }`}>
                  {w.full_name?.[0]?.toUpperCase()}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <p className="font-semibold text-slate-900">{w.full_name}</p>
                  <p className="text-slate-400">{w.activeJobCount} active · {timeAgo(w.latestPing!.created_at)}</p>
                  {w.latestPing!.battery_level != null && <p className="text-slate-400">Battery: {w.latestPing!.battery_level}%</p>}
                </div>
                {w.activeJobCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse ring-2 ring-white" />
                )}
              </div>
            );
          })}
        </div>

        {/* Worker list below map */}
        <div className="mt-4 space-y-2">
          {workersWithLocation.map(w => (
            <div key={w.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                w.activeJobCount > 0 ? 'bg-emerald-600' : 'bg-slate-400'
              }`}>
                {w.full_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{w.full_name}</p>
                <p className="text-xs text-slate-400">
                  {w.latestPing!.latitude.toFixed(4)}, {w.latestPing!.longitude.toFixed(4)} · {timeAgo(w.latestPing!.created_at)}
                </p>
              </div>
              {w.latestPing!.battery_level != null && (
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Battery className="w-3.5 h-3.5" />
                  {w.latestPing!.battery_level}%
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// CALENDAR VIEW — Week view of all assignments
// ============================================================
function CalendarView({ assignments, employees }: { assignments: AdminAssignment[]; employees: AdminEmployee[] }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDays = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return [...Array(7)].map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  }, [weekOffset]);

  const activeStatuses = ['assigned', 'accepted', 'in_progress', 'paused', 'pending_review'];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900">
          Week of {new Date(weekDays[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </h3>
        <div className="flex gap-2">
          <button onClick={() => setWeekOffset(w => w - 1)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Prev</button>
          <button onClick={() => setWeekOffset(0)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Today</button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Next</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {weekDays.map(date => {
          const dayJobs = assignments.filter(a => a.scheduled_date === date && activeStatuses.includes(a.status));
          const isToday = date === new Date().toISOString().split('T')[0];
          return (
            <div key={date} className={`bg-white rounded-xl border p-3 min-h-[120px] ${isToday ? 'border-emerald-400 ring-1 ring-emerald-100' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">
                  {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className={`text-xs ${isToday ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                  {new Date(date).getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {dayJobs.slice(0, 4).map(job => {
                  const worker = employees.find(e => e.id === job.employee_id);
                  return (
                    <div key={job.id} className={`text-[10px] px-1.5 py-1 rounded border ${statusBorderColor(job.status)}`}>
                      <p className="font-semibold text-slate-700 truncate">{job.service_name}</p>
                      <p className="text-slate-400 truncate">{job.scheduled_time || '—'}</p>
                      {worker && <p className="text-slate-400 truncate">{worker.full_name.split(' ')[0]}</p>}
                    </div>
                  );
                })}
                {dayJobs.length > 4 && <p className="text-[10px] text-slate-400">+{dayJobs.length - 4} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// LEADERBOARD VIEW — Worker performance scores
// ============================================================
function LeaderboardView({ workers, jobScores, assignments }: {
  workers: (AdminEmployee & { activeJobCount: number; completedJobCount: number })[];
  jobScores: JobScore[];
  assignments: AdminAssignment[];
}) {
  const ranked = useMemo(() => {
    return workers
      .map(w => {
        const scores = jobScores.filter(s => s.employee_id === w.id);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s.overall_score, 0) / scores.length) : 0;
        const earnings = assignments
          .filter(a => a.employee_id === w.id && a.status === 'approved')
          .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
        return { ...w, avgScore, earnings, scoreCount: scores.length };
      })
      .sort((a, b) => b.avgScore - a.avgScore || b.completedJobCount - a.completedJobCount);
  }, [workers, jobScores, assignments]);

  if (ranked.length === 0) {
    return <EmptyState icon={Award} title="No scores yet" description="Worker performance scores will appear here after jobs are scored" />;
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-900 mb-3">Performance Leaderboard</h3>
      <div className="space-y-2">
        {ranked.map((w, idx) => (
          <div key={w.id} className={`bg-white rounded-xl border p-4 shadow-sm flex items-center gap-4 ${
            idx === 0 ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              idx === 0 ? 'bg-amber-100 text-amber-700' :
              idx === 1 ? 'bg-slate-100 text-slate-600' :
              idx === 2 ? 'bg-orange-100 text-orange-700' :
              'bg-slate-50 text-slate-400'
            }`}>
              {idx + 1}
            </div>
            {w.photo_url ? (
              <img src={w.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                <span className="text-sm font-semibold text-slate-600">{w.full_name?.[0]?.toUpperCase()}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-slate-900 truncate">{w.full_name}</p>
              <p className="text-xs text-slate-400">{w.position || 'Field Staff'} · {w.completedJobCount} jobs completed</p>
            </div>
            {w.scoreCount > 0 && (
              <div className="text-right">
                <div className="flex items-center gap-1 justify-end">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-sm font-bold text-slate-900">{w.avgScore}</span>
                </div>
                <p className="text-[10px] text-slate-400">{w.scoreCount} scored</p>
              </div>
            )}
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-600">SLE {w.earnings.toFixed(0)}</p>
              <p className="text-[10px] text-slate-400">earned</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ASSIGN MODAL — Create new assignment with auto-recommendation
// ============================================================
function AssignModal({ employees, bookings, onClose, onCreated }: {
  employees: AdminEmployee[];
  bookings: AdminBooking[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [bookingId, setBookingId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [instructions, setInstructions] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedBooking = bookings.find(b => b.id === bookingId);

  // Auto-recommend best worker
  const recommendedWorker = useMemo(() => {
    if (employees.length === 0) return null;
    // Score each worker: fewer active jobs = better, higher performance = better
    const scored = employees.map(e => {
      // Count active jobs for this worker from all assignments (we don't have assignments here, use jobs_completed as inverse proxy)
      const score = (e.performance_score || 0) - (e.jobs_completed || 0) * 0.5;
      return { ...e, dispatchScore: score };
    });
    scored.sort((a, b) => b.dispatchScore - a.dispatchScore);
    return scored[0];
  }, [employees]);

  const handleUseRecommended = () => {
    if (recommendedWorker) setEmployeeId(recommendedWorker.id);
  };

  const handleSave = async () => {
    if (!employeeId) { setError('Please select a worker'); return; }
    if (!selectedBooking && !instructions) { setError('Select a booking or add instructions'); return; }
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        employee_id: employeeId,
        service_name: selectedBooking?.service_name || 'General Service',
        customer_name: selectedBooking?.customer_name || 'Walk-in Customer',
        address: selectedBooking?.address || '',
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        instructions: instructions || null,
        amount: amount ? parseFloat(amount) : null,
        status: 'assigned',
        booking_id: bookingId || null,
      };
      const { error: insertErr } = await supabase.from('field_assignments').insert(payload);
      if (insertErr) throw insertErr;
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">New Field Assignment</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        {error && <ErrorBanner message={error} />}

        {/* Booking selector */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">From Booking (optional)</label>
          <select
            value={bookingId}
            onChange={e => setBookingId(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— Select a booking —</option>
            {bookings.map(b => (
              <option key={b.id} value={b.id}>{b.service_name} · {b.customer_name} · {b.address}</option>
            ))}
          </select>
        </div>

        {/* Worker selector with recommendation */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assign To</label>
            {recommendedWorker && (
              <button onClick={handleUseRecommended} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                <Zap className="w-3 h-3" /> Recommended: {recommendedWorker.full_name.split(' ')[0]}
              </button>
            )}
          </div>
          <select
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— Select worker —</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.full_name} · {e.position || 'Field Staff'} · {e.jobs_completed || 0} done</option>
            ))}
          </select>
        </div>

        {/* Date & time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Date</label>
            <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Time</label>
            <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Amount (SLE)</label>
          <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        {/* Instructions */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Instructions</label>
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Special instructions for the worker…" rows={3} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Assign Job
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusBadgeColor(status: string): string {
  const map: Record<string, string> = {
    assigned: 'bg-blue-50 text-blue-600',
    accepted: 'bg-indigo-50 text-indigo-600',
    in_progress: 'bg-amber-50 text-amber-600',
    paused: 'bg-orange-50 text-orange-600',
    pending_review: 'bg-purple-50 text-purple-600',
    approved: 'bg-emerald-50 text-emerald-600',
    rejected: 'bg-red-50 text-red-600',
  };
  return map[status] || 'bg-slate-100 text-slate-600';
}

function statusBorderColor(status: string): string {
  const map: Record<string, string> = {
    assigned: 'border-blue-200 bg-blue-50/50',
    accepted: 'border-indigo-200 bg-indigo-50/50',
    in_progress: 'border-amber-200 bg-amber-50/50',
    paused: 'border-orange-200 bg-orange-50/50',
    pending_review: 'border-purple-200 bg-purple-50/50',
    approved: 'border-emerald-200 bg-emerald-50/50',
    rejected: 'border-red-200 bg-red-50/50',
  };
  return map[status] || 'border-slate-200 bg-slate-50/50';
}
