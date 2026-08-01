import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, Card, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import {
  MapPin, Users, Briefcase, Award, Navigation, Calendar, Clock,
  Plus, X, Loader2, CheckCircle2, AlertCircle, Truck, Zap, Star,
  TrendingUp, Route, ArrowRight, Battery, Wifi, WifiOff,
  Radar, Sparkles, Timer, Send, RefreshCw, Navigation2,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================
interface AdminEmployee {
  id: string;
  full_name: string;
  position: string;
  photo_url: string | null;
  service_id: string | null;
  performance_score: number;
  jobs_completed: number;
  status: string;
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
  service_id: string | null;
}

interface LocationPing {
  id: string;
  employee_id: string;
  latitude: number;
  longitude: number;
  battery_level: number | null;
  heading: number | null;
  speed: number | null;
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

interface JobEvent {
  id: string;
  assignment_id: string;
  employee_id: string;
  event_type: string;
  latitude: number | null;
  longitude: number | null;
  eta_minutes: number | null;
  note: string | null;
  created_at: string;
}

interface DispatchSuggestion {
  id: string;
  assignment_id: string;
  employee_id: string;
  match_score: number;
  distance_km: number | null;
  workload_score: number;
  performance_factor: number;
  skill_match: boolean;
  is_selected: boolean;
  created_at: string;
}

interface RouteStop {
  id: string;
  employee_id: string;
  assignment_id: string;
  stop_order: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  estimated_travel_minutes: number | null;
  estimated_arrival: string | null;
  completed: boolean;
  created_at: string;
}

interface OfflineSyncItem {
  id: string;
  employee_id: string;
  assignment_id: string | null;
  data_type: string;
  payload: Record<string, unknown>;
  device_id: string | null;
  synced: boolean;
  synced_at: string | null;
  created_at: string;
}

type View = 'dispatch' | 'map' | 'calendar' | 'leaderboard' | 'auto' | 'routes' | 'sync';

// ============================================================
// Main Component
// ============================================================
export function FieldDispatchPage() {
  const [view, setView] = useState<View>('dispatch');
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [locationPings, setLocationPings] = useState<LocationPing[]>([]);
  const [jobScores, setJobScores] = useState<JobScore[]>([]);
  const [jobEvents, setJobEvents] = useState<JobEvent[]>([]);
  const [suggestions, setSuggestions] = useState<DispatchSuggestion[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [syncQueue, setSyncQueue] = useState<OfflineSyncItem[]>([]);
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
        { data: eventData, error: eventErr },
        { data: suggestData, error: suggestErr },
        { data: routeData, error: routeErr },
        { data: syncData, error: syncErr },
      ] = await Promise.all([
        supabase.from('employees').select('id, full_name, position, photo_url, service_id, performance_score, jobs_completed, status').eq('status', 'active'),
        supabase.from('field_assignments').select('*').order('scheduled_date', { ascending: true }),
        supabase.from('bookings').select('id, service_id, contact_name, location, status, services(name)').in('status', ['pending', 'approved', 'confirmed', 'in_progress']).limit(50),
        supabase.from('field_location_pings').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('field_job_scores').select('*').order('scored_at', { ascending: false }),
        supabase.from('field_job_events').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('field_dispatch_suggestions').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('field_route_stops').select('*').order('stop_order', { ascending: true }),
        supabase.from('field_offline_sync_queue').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

      if (empErr) throw empErr;
      if (assignErr) throw assignErr;
      if (bookErr) throw bookErr;
      if (pingErr) throw pingErr;
      if (scoreErr) throw scoreErr;
      if (eventErr) throw eventErr;
      if (suggestErr) throw suggestErr;
      if (routeErr) throw routeErr;
      if (syncErr) throw syncErr;

      setEmployees(empData || []);
      setAssignments(assignData || []);
      setBookings((bookData || []).map((b: any) => ({
        id: b.id,
        service_id: b.service_id,
        service_name: b.services?.name || 'Service',
        customer_name: b.contact_name || 'Customer',
        address: b.location || '',
        status: b.status,
      })));
      setLocationPings(pingData || []);
      setJobScores(scoreData || []);
      setJobEvents(eventData || []);
      setSuggestions(suggestData || []);
      setRouteStops(routeData || []);
      setSyncQueue(syncData || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load dispatch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('admin_field_dispatch_pro')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'field_location_pings' }, (payload: any) => {
        setLocationPings(prev => [payload.new as LocationPing, ...prev].slice(0, 100));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_assignments' }, () => { loadData(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'field_job_events' }, (payload: any) => {
        setJobEvents(prev => [payload.new as JobEvent, ...prev].slice(0, 200));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_offline_sync_queue' }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const workerStats = useMemo(() => {
    return employees.map(emp => {
      const activeJobs = assignments.filter(a => a.employee_id === emp.id && ['assigned', 'accepted', 'in_progress'].includes(a.status));
      const completedJobs = assignments.filter(a => a.employee_id === emp.id && a.status === 'approved');
      const latestPing = locationPings.find(p => p.employee_id === emp.id);
      const workerEvents = jobEvents.filter(e => e.employee_id === emp.id);
      const latestEvent = workerEvents[0];
      const workerSyncItems = syncQueue.filter(s => s.employee_id === emp.id && !s.synced);
      return {
        ...emp,
        activeJobCount: activeJobs.length,
        completedJobCount: completedJobs.length,
        latestPing,
        latestEvent,
        pendingSyncCount: workerSyncItems.length,
        status: activeJobs.length === 0 ? 'free' : activeJobs.length <= 2 ? 'busy' : 'overloaded',
      };
    });
  }, [employees, assignments, locationPings, jobEvents, syncQueue]);

  const stats = useMemo(() => ({
    totalWorkers: employees.length,
    activeWorkers: workerStats.filter(w => w.activeJobCount > 0).length,
    freeWorkers: workerStats.filter(w => w.status === 'free').length,
    totalJobs: assignments.length,
    activeJobs: assignments.filter(a => ['assigned', 'accepted', 'in_progress'].includes(a.status)).length,
    pendingBookings: bookings.length,
    pendingSyncItems: syncQueue.filter(s => !s.synced).length,
    enRouteJobs: jobEvents.filter(e => e.event_type === 'en_route').length,
  }), [employees, workerStats, assignments, bookings, syncQueue, jobEvents]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  const tabs: { key: View; label: string; icon: typeof Users }[] = [
    { key: 'dispatch', label: 'Workers', icon: Users },
    { key: 'map', label: 'Live Map', icon: MapPin },
    { key: 'auto', label: 'Auto-Dispatch', icon: Zap },
    { key: 'routes', label: 'Routes', icon: Route },
    { key: 'calendar', label: 'Calendar', icon: Calendar },
    { key: 'leaderboard', label: 'Scores', icon: Award },
    { key: 'sync', label: 'Sync Queue', icon: RefreshCw },
  ];

  return (
    <div>
      <PageHeader
        title="Field Dispatch"
        description="Smart assignment, live tracking, route optimization & worker management"
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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        <StatCard label="Workers" value={stats.totalWorkers} icon={Users} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Active" value={stats.activeWorkers} icon={Zap} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Free" value={stats.freeWorkers} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Active Jobs" value={stats.activeJobs} icon={Briefcase} color="text-purple-600" accent="bg-purple-50" />
        <StatCard label="Pending" value={stats.pendingBookings} icon={Clock} color="text-orange-600" accent="bg-orange-50" />
        <StatCard label="En Route" value={stats.enRouteJobs} icon={Navigation2} color="text-cyan-600" accent="bg-cyan-50" />
        <StatCard label="Sync Pending" value={stats.pendingSyncItems} icon={RefreshCw} color="text-rose-600" accent="bg-rose-50" />
        <StatCard label="Total Jobs" value={stats.totalJobs} icon={Truck} color="text-slate-600" accent="bg-slate-50" />
      </div>

      {/* View tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 overflow-x-auto max-w-3xl">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = view === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === 'sync' && stats.pendingSyncItems > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[9px] font-bold">{stats.pendingSyncItems}</span>
              )}
            </button>
          );
        })}
      </div>

      {view === 'dispatch' && <DispatchView workers={workerStats} assignments={assignments} jobEvents={jobEvents} onAssign={() => setShowAssignModal(true)} />}
      {view === 'map' && <MapView workers={workerStats} pings={locationPings} assignments={assignments} />}
      {view === 'auto' && <AutoDispatchView workers={workerStats} assignments={assignments} bookings={bookings} suggestions={suggestions} onRefresh={loadData} />}
      {view === 'routes' && <RouteOptimizationView workers={workerStats} assignments={assignments} routeStops={routeStops} onRefresh={loadData} />}
      {view === 'calendar' && <CalendarView assignments={assignments} employees={employees} />}
      {view === 'leaderboard' && <LeaderboardView workers={workerStats} jobScores={jobScores} assignments={assignments} />}
      {view === 'sync' && <SyncQueueView syncQueue={syncQueue} workers={workerStats} onRefresh={loadData} />}

      {showAssignModal && (
        <AssignModal
          employees={employees}
          bookings={bookings}
          assignments={assignments}
          onClose={() => setShowAssignModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}

// ============================================================
// DISPATCH VIEW — Worker availability + assignment list with timeline
// ============================================================
function DispatchView({ workers, assignments, jobEvents, onAssign }: {
  workers: (AdminEmployee & { activeJobCount: number; completedJobCount: number; latestPing?: LocationPing; latestEvent?: JobEvent; pendingSyncCount: number; status: string })[];
  assignments: AdminAssignment[];
  jobEvents: JobEvent[];
  onAssign: () => void;
}) {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);

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

  const selectedJob = assignments.find(a => a.id === selectedAssignment);
  const selectedJobEvents = selectedAssignment ? jobEvents.filter(e => e.assignment_id === selectedAssignment) : [];

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
              <div key={w.id}>
                <button
                  onClick={() => { setSelectedWorker(selectedWorker === w.id ? null : w.id); setSelectedAssignment(null); }}
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
                    <div className="flex-1 min-w0">
                      <p className="font-semibold text-sm text-slate-900 truncate">{w.full_name}</p>
                      <p className="text-xs text-slate-400 truncate">{w.position || 'Field Staff'}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusColors[w.status]}`}>
                      {statusLabels[w.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs flex-wrap">
                    <span className="text-slate-500"><Briefcase className="w-3 h-3 inline mr-1" />{w.activeJobCount} active</span>
                    <span className="text-slate-500"><CheckCircle2 className="w-3 h-3 inline mr-1" />{w.completedJobCount} done</span>
                    {w.latestPing && <span className="text-slate-500"><MapPin className="w-3 h-3 inline mr-1" />{timeAgo(w.latestPing.created_at)}</span>}
                    {w.latestPing?.battery_level != null && <span className="text-slate-500"><Battery className="w-3 h-3 inline mr-1" />{w.latestPing.battery_level}%</span>}
                    {w.pendingSyncCount > 0 && <span className="text-rose-500"><RefreshCw className="w-3 h-3 inline mr-1" />{w.pendingSyncCount} pending</span>}
                  </div>
                </button>
                {/* Job timeline for selected worker */}
                {selectedWorker === w.id && (
                  <div className="ml-4 mt-2 space-y-1">
                    {assignments.filter(a => a.employee_id === w.id && ['assigned', 'accepted', 'in_progress', 'paused'].includes(a.status)).map(a => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAssignment(selectedAssignment === a.id ? null : a.id)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                          selectedAssignment === a.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-700 truncate">{a.service_name}</span>
                          <span className={`px-1.5 py-0.5 rounded font-medium ${statusBadgeColor(a.status)}`}>{a.status.replace('_', ' ')}</span>
                        </div>
                        <p className="text-slate-400 truncate">{a.customer_name} · {a.address}</p>
                        <p className="text-slate-400">{a.scheduled_date} {a.scheduled_time}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Job timeline or active assignments */}
      <div>
        {selectedJob ? (
          <JobTimelineView assignment={selectedJob} events={selectedJobEvents} worker={workers.find(w => w.id === selectedJob.employee_id)} onBack={() => setSelectedAssignment(null)} />
        ) : (
          <>
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
                  const aEvents = jobEvents.filter(e => e.assignment_id === a.id);
                  const latestEvent = aEvents[0];
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAssignment(a.id)}
                      className="w-full bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900 truncate">{a.service_name}</p>
                          <p className="text-xs text-slate-500 truncate">{a.customer_name} · {a.address}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {a.scheduled_date && <span className="text-xs text-slate-400">{a.scheduled_date}</span>}
                            {a.scheduled_time && <span className="text-xs text-slate-400">{a.scheduled_time}</span>}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadgeColor(a.status)}`}>{a.status.replace('_', ' ')}</span>
                            {latestEvent && (
                              <span className="text-[10px] text-cyan-600 font-medium">
                                {latestEvent.event_type.replace('_', ' ')}
                                {latestEvent.eta_minutes != null && ` · ETA ${latestEvent.eta_minutes}m`}
                              </span>
                            )}
                          </div>
                          {worker && <p className="text-xs text-slate-400 mt-1">Assigned to: {worker.full_name}</p>}
                        </div>
                        {a.amount != null && <span className="text-sm font-semibold text-emerald-600 flex-shrink-0">SLE {Number(a.amount).toFixed(0)}</span>}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// JOB TIMELINE VIEW — Feature 4: Job status timeline with ETA
// ============================================================
function JobTimelineView({ assignment, events, worker, onBack }: {
  assignment: AdminAssignment;
  events: JobEvent[];
  worker?: AdminEmployee;
  onBack: () => void;
}) {
  const eventIcons: Record<string, typeof MapPin> = {
    assigned: Clock,
    en_route: Navigation2,
    on_site: MapPin,
    paused: AlertCircle,
    resumed: RefreshCw,
    completed: CheckCircle2,
    cancelled: X,
  };
  const eventColors: Record<string, string> = {
    assigned: 'text-blue-600 bg-blue-50',
    en_route: 'text-cyan-600 bg-cyan-50',
    on_site: 'text-emerald-600 bg-emerald-50',
    paused: 'text-orange-600 bg-orange-50',
    resumed: 'text-amber-600 bg-amber-50',
    completed: 'text-emerald-600 bg-emerald-50',
    cancelled: 'text-red-600 bg-red-50',
  };

  const sortedEvents = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 mb-3">
        <ArrowRight className="w-3 h-3 rotate-180" /> Back to list
      </button>
      <h3 className="text-sm font-bold text-slate-900 mb-3">Job Timeline</h3>
      <Card className="p-4 mb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm text-slate-900">{assignment.service_name}</p>
            <p className="text-xs text-slate-500">{assignment.customer_name} · {assignment.address}</p>
            <p className="text-xs text-slate-400 mt-1">{assignment.scheduled_date} {assignment.scheduled_time}</p>
            {worker && <p className="text-xs text-slate-400">Worker: {worker.full_name}</p>}
          </div>
          <span className={`text-[10px] px-2 py-1 rounded font-medium ${statusBadgeColor(assignment.status)}`}>{assignment.status.replace('_', ' ')}</span>
        </div>
      </Card>

      {sortedEvents.length === 0 ? (
        <EmptyState icon={Timer} title="No events yet" description="Job events will appear here as the worker updates status" />
      ) : (
        <div className="relative pl-8">
          {/* Vertical line */}
          <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-200" />
          {sortedEvents.map((e, idx) => {
            const Icon = eventIcons[e.event_type] || Clock;
            const isLast = idx === sortedEvents.length - 1;
            return (
              <div key={e.id} className="relative mb-4 last:mb-0">
                <div className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center ${eventColors[e.event_type] || 'text-slate-600 bg-slate-50'} ${isLast ? 'ring-2 ring-offset-2 ring-emerald-200' : ''}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800 capitalize">{e.event_type.replace('_', ' ')}</span>
                    <span className="text-xs text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  {e.eta_minutes != null && (
                    <p className="text-xs text-cyan-600 font-medium mt-1"><Navigation2 className="w-3 h-3 inline mr-1" />ETA: {e.eta_minutes} minutes</p>
                  )}
                  {e.note && <p className="text-xs text-slate-500 mt-1">{e.note}</p>}
                  {e.latitude != null && e.longitude != null && (
                    <p className="text-[10px] text-slate-400 mt-1"><MapPin className="w-2.5 h-2.5 inline mr-1" />{e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAP VIEW — Feature 1: Live GPS tracking map with worker pins & job markers
// ============================================================
function MapView({ workers, pings, assignments }: {
  workers: (AdminEmployee & { activeJobCount: number; latestPing?: LocationPing })[];
  pings: LocationPing[];
  assignments: AdminAssignment[];
}) {
  const workersWithLocation = workers.filter(w => w.latestPing);
  const jobMarkers = assignments.filter(a => a.latitude != null && a.longitude != null && ['assigned', 'accepted', 'in_progress'].includes(a.status));

  if (workersWithLocation.length === 0 && jobMarkers.length === 0) {
    return <EmptyState icon={MapPin} title="No live locations" description="Worker GPS pings and job markers will appear here when jobs are in progress" />;
  }

  const allLats = [...workersWithLocation.map(w => w.latestPing!.latitude), ...jobMarkers.map(a => a.latitude!)];
  const allLngs = [...workersWithLocation.map(w => w.latestPing!.longitude), ...jobMarkers.map(a => a.longitude!)];
  const minLat = Math.min(...allLats), maxLat = Math.max(...allLats);
  const minLng = Math.min(...allLngs), maxLng = Math.max(...allLngs);
  const latRange = Math.max(maxLat - minLat, 0.01);
  const lngRange = Math.max(maxLng - minLng, 0.01);

  const MAP_SIZE = 440;
  const PADDING = 50;

  const projectX = (lng: number) => PADDING + ((lng - minLng) / lngRange) * (MAP_SIZE - PADDING * 2);
  const projectY = (lat: number) => MAP_SIZE - PADDING - ((lat - minLat) / latRange) * (MAP_SIZE - PADDING * 2);

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
        <Radar className="w-4 h-4 text-emerald-600" /> Live GPS Tracking
      </h3>
      <Card className="p-4">
        <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl overflow-hidden" style={{ height: MAP_SIZE }}>
          {/* Grid lines */}
          <div className="absolute inset-0 opacity-30">
            {[...Array(10)].map((_, i) => (
              <div key={`h${i}`} className="absolute left-0 right-0 border-t border-slate-200" style={{ top: `${(i / 10) * 100}%` }} />
            ))}
            {[...Array(10)].map((_, i) => (
              <div key={`v${i}`} className="absolute top-0 bottom-0 border-l border-slate-200" style={{ left: `${(i / 10) * 100}%` }} />
            ))}
          </div>

          {/* Job markers */}
          {jobMarkers.map(a => {
            const x = projectX(a.longitude!);
            const y = projectY(a.latitude!);
            return (
              <div key={a.id} className="absolute -translate-x-1/2 -translate-y-1/2 group" style={{ left: x, top: y }}>
                <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md ring-2 ring-orange-300 border border-orange-200">
                  <MapPin className="w-3 h-3 text-orange-500" />
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <p className="font-semibold text-slate-900">{a.service_name}</p>
                  <p className="text-slate-400">{a.customer_name}</p>
                </div>
              </div>
            );
          })}

          {/* Worker pins */}
          {workersWithLocation.map(w => {
            const x = projectX(w.latestPing!.longitude);
            const y = projectY(w.latestPing!.latitude);
            return (
              <div key={w.id} className="absolute -translate-x-1/2 -translate-y-1/2 group" style={{ left: x, top: y }}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg ring-2 ring-white transition-transform group-hover:scale-110 ${
                  w.activeJobCount > 0 ? 'bg-emerald-600' : 'bg-slate-400'
                }`}>
                  {w.full_name?.[0]?.toUpperCase()}
                </div>
                {w.activeJobCount > 0 && <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse ring-2 ring-white" />}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <p className="font-semibold text-slate-900">{w.full_name}</p>
                  <p className="text-slate-400">{w.activeJobCount} active · {timeAgo(w.latestPing!.created_at)}</p>
                  {w.latestPing!.battery_level != null && <p className="text-slate-400">Battery: {w.latestPing!.battery_level}%</p>}
                  {w.latestPing!.speed != null && <p className="text-slate-400">Speed: {w.latestPing!.speed.toFixed(0)} km/h</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-emerald-600 rounded-full ring-1 ring-white" /> Active worker</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-slate-400 rounded-full ring-1 ring-white" /> Free worker</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-white rounded-full ring-1 ring-orange-300 flex items-center justify-center"><MapPin className="w-2 h-2 text-orange-500" /></div> Job site</span>
        </div>

        {/* Worker list below map */}
        <div className="mt-4 space-y-2">
          {workersWithLocation.map(w => (
            <div key={w.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${w.activeJobCount > 0 ? 'bg-emerald-600' : 'bg-slate-400'}`}>
                {w.full_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{w.full_name}</p>
                <p className="text-xs text-slate-400">{w.latestPing!.latitude.toFixed(4)}, {w.latestPing!.longitude.toFixed(4)} · {timeAgo(w.latestPing!.created_at)}</p>
              </div>
              {w.latestPing!.battery_level != null && <div className="flex items-center gap-1 text-xs text-slate-400"><Battery className="w-3.5 h-3.5" />{w.latestPing!.battery_level}%</div>}
              {w.latestPing!.speed != null && <div className="flex items-center gap-1 text-xs text-slate-400"><Navigation2 className="w-3.5 h-3.5" />{w.latestPing!.speed.toFixed(0)} km/h</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// AUTO-DISPATCH VIEW — Feature 2: Smart auto-dispatch suggestions
// ============================================================
function AutoDispatchView({ workers, assignments, bookings, suggestions, onRefresh }: {
  workers: (AdminEmployee & { activeJobCount: number; performance_score: number; jobs_completed: number; status: string; service_id: string | null })[];
  assignments: AdminAssignment[];
  bookings: AdminBooking[];
  suggestions: DispatchSuggestion[];
  onRefresh: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState('');

  // Unassigned bookings that could be dispatched
  const unassignedBookings = useMemo(() => {
    const assignedBookingIds = new Set(assignments.filter(a => a.booking_id).map(a => a.booking_id));
    return bookings.filter(b => !assignedBookingIds.has(b.id));
  }, [bookings, assignments]);

  // Generate suggestions for a booking
  const handleGenerate = async () => {
    if (!selectedBooking) return;
    setGenerating(true);
    try {
      const booking = bookings.find(b => b.id === selectedBooking);
      if (!booking) return;

      // Score each worker
      const scored = workers.map(w => {
        const workloadScore = w.activeJobCount;
        const performanceFactor = Number(w.performance_score) || 0;
        const skillMatch = true; // could match service_id in future
        // Lower workload + higher performance + skill match = higher score
        const matchScore = Math.round(
          Math.max(0, 100 - workloadScore * 15) * 0.4 +
          performanceFactor * 0.4 +
          (skillMatch ? 20 : 0)
        );
        return { employee_id: w.id, match_score: matchScore, workload_score: workloadScore, performance_factor: performanceFactor, skill_match: skillMatch };
      }).sort((a, b) => b.match_score - a.match_score);

      // Save top 3 suggestions
      const top3 = scored.slice(0, 3);
      for (const s of top3) {
        await supabase.from('field_dispatch_suggestions').insert({
          assignment_id: null,
          employee_id: s.employee_id,
          match_score: s.match_score,
          workload_score: s.workload_score,
          performance_factor: s.performance_factor,
          skill_match: s.skill_match,
        });
      }
      onRefresh();
    } catch (err) {
      console.error('Auto-dispatch error:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Accept a suggestion — creates an assignment
  const handleAccept = async (suggestion: DispatchSuggestion) => {
    const booking = bookings.find(b => b.id === selectedBooking);
    const worker = workers.find(w => w.id === suggestion.employee_id);
    if (!booking || !worker) return;
    try {
      const { data: newAssign } = await supabase.from('field_assignments').insert({
        employee_id: suggestion.employee_id,
        service_name: booking.service_name,
        customer_name: booking.customer_name,
        address: booking.address,
        scheduled_date: new Date().toISOString().split('T')[0],
        scheduled_time: '09:00',
        status: 'assigned',
      }).select().single();

      if (newAssign) {
        await supabase.from('field_dispatch_suggestions').update({ is_selected: true, assignment_id: newAssign.id }).eq('id', suggestion.id);
        // Log job event
        await supabase.from('field_job_events').insert({
          assignment_id: newAssign.id,
          employee_id: suggestion.employee_id,
          event_type: 'assigned',
          note: 'Auto-dispatched by system',
        });
      }
      onRefresh();
      setSelectedBooking('');
    } catch (err) {
      console.error('Accept suggestion error:', err);
    }
  };

  const recentSuggestions = suggestions.slice(0, 10);

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-500" /> Smart Auto-Dispatch
      </h3>

      <Card className="p-4 mb-4">
        <p className="text-xs text-slate-500 mb-3">Select an unassigned booking to generate the best worker recommendations based on workload, performance, and skills.</p>
        <div className="flex gap-2">
          <select
            value={selectedBooking}
            onChange={e => setSelectedBooking(e.target.value)}
            className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— Select a booking —</option>
            {unassignedBookings.map(b => (
              <option key={b.id} value={b.id}>{b.service_name} · {b.customer_name}</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={!selectedBooking || generating}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </Card>

      {recentSuggestions.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-700 mb-2">Top Recommendations</h4>
          <div className="space-y-2">
            {recentSuggestions.map((s, idx) => {
              const worker = workers.find(w => w.id === s.employee_id);
              if (!worker) return null;
              return (
                <div key={s.id} className={`bg-white rounded-xl border p-4 shadow-sm flex items-center gap-4 ${
                  s.is_selected ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {idx + 1}
                  </div>
                  {worker.photo_url ? (
                    <img src={worker.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                      <span className="text-sm font-semibold text-slate-600">{worker.full_name?.[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{worker.full_name}</p>
                    <p className="text-xs text-slate-400">{worker.position || 'Field Staff'} · {worker.activeJobCount} active jobs</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-amber-600">{s.match_score}%</div>
                    <p className="text-[10px] text-slate-400">match score</p>
                  </div>
                  {!s.is_selected && (
                    <button
                      onClick={() => handleAccept(s)}
                      className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Assign
                    </button>
                  )}
                  {s.is_selected && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ROUTE OPTIMIZATION VIEW — Feature 3: Route optimization for multi-stop days
// ============================================================
function RouteOptimizationView({ workers, assignments, routeStops, onRefresh }: {
  workers: (AdminEmployee & { activeJobCount: number; status: string })[];
  assignments: AdminAssignment[];
  routeStops: RouteStop[];
  onRefresh: () => void;
}) {
  const [selectedWorker, setSelectedWorker] = useState<string>('');
  const [optimizing, setOptimizing] = useState(false);

  const workerJobs = useMemo(() => {
    if (!selectedWorker) return [];
    return assignments.filter(a => a.employee_id === selectedWorker && ['assigned', 'accepted'].includes(a.status) && a.latitude != null && a.longitude != null);
  }, [selectedWorker, assignments]);

  const handleOptimize = async () => {
    if (workerJobs.length < 2) return;
    setOptimizing(true);
    try {
      // Nearest-neighbor TSP
      const stops = [...workerJobs];
      const ordered: typeof stops = [stops[0]];
      const remaining = stops.slice(1);
      while (remaining.length > 0) {
        const last = ordered[ordered.length - 1];
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const dist = Math.sqrt(Math.pow((remaining[i].latitude! - last.latitude!), 2) + Math.pow((remaining[i].longitude! - last.longitude!), 2));
          if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
        }
        ordered.push(remaining.splice(nearestIdx, 1)[0]);
      }

      // Clear old route stops for this worker
      await supabase.from('field_route_stops').delete().eq('employee_id', selectedWorker);

      // Insert optimized stops
      const now = new Date();
      const inserts = ordered.map((a, i) => ({
        employee_id: selectedWorker,
        assignment_id: a.id,
        stop_order: i + 1,
        latitude: a.latitude,
        longitude: a.longitude,
        address: a.address,
        estimated_travel_minutes: i === 0 ? 0 : Math.round(haversineKm(ordered[i - 1].latitude!, ordered[i - 1].longitude!, a.latitude!, a.longitude!) / 30 * 60),
        estimated_arrival: new Date(now.getTime() + (i === 0 ? 0 : Math.round(haversineKm(ordered[i - 1].latitude!, ordered[i - 1].longitude!, a.latitude!, a.longitude!) / 30 * 60) * 60000)).toISOString(),
        completed: false,
      }));
      await supabase.from('field_route_stops').insert(inserts);
      onRefresh();
    } catch (err) {
      console.error('Route optimization error:', err);
    } finally {
      setOptimizing(false);
    }
  };

  const workerRouteStops = routeStops.filter(s => s.employee_id === selectedWorker).sort((a, b) => a.stop_order - b.stop_order);

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
        <Route className="w-4 h-4 text-blue-500" /> Route Optimization
      </h3>

      <Card className="p-4 mb-4">
        <p className="text-xs text-slate-500 mb-3">Select a worker to optimize their multi-stop route. The system uses nearest-neighbor optimization to minimize travel time.</p>
        <div className="flex gap-2">
          <select
            value={selectedWorker}
            onChange={e => setSelectedWorker(e.target.value)}
            className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— Select worker —</option>
            {workers.map(w => (
              <option key={w.id} value={w.id}>{w.full_name} · {w.activeJobCount} active</option>
            ))}
          </select>
          <button
            onClick={handleOptimize}
            disabled={!selectedWorker || workerJobs.length < 2 || optimizing}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
            Optimize Route
          </button>
        </div>
        {selectedWorker && workerJobs.length < 2 && (
          <p className="text-xs text-amber-600 mt-2">This worker needs at least 2 jobs with location data to optimize a route.</p>
        )}
      </Card>

      {workerRouteStops.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-700 mb-2">Optimized Route ({workerRouteStops.length} stops)</h4>
          <div className="space-y-2">
            {workerRouteStops.map((stop, idx) => {
              const job = assignments.find(a => a.id === stop.assignment_id);
              return (
                <div key={stop.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    stop.completed ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {stop.completed ? <CheckCircle2 className="w-4 h-4" /> : stop.stop_order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{job?.service_name || 'Unknown job'}</p>
                    <p className="text-xs text-slate-400 truncate">{stop.address}</p>
                    {stop.estimated_arrival && (
                      <p className="text-xs text-blue-500 mt-0.5"><Clock className="w-3 h-3 inline mr-1" />ETA: {new Date(stop.estimated_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    )}
                  </div>
                  {stop.estimated_travel_minutes != null && stop.estimated_travel_minutes > 0 && (
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-600">{stop.estimated_travel_minutes} min</p>
                      <p className="text-[10px] text-slate-400">travel</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SYNC QUEUE VIEW — Feature 5: Offline sync queue dashboard
// ============================================================
function SyncQueueView({ syncQueue, workers, onRefresh }: {
  syncQueue: OfflineSyncItem[];
  workers: (AdminEmployee & { full_name: string; pendingSyncCount: number })[];
  onRefresh: () => void;
}) {
  const pending = syncQueue.filter(s => !s.synced);
  const synced = syncQueue.filter(s => s.synced);

  const dataTypeIcons: Record<string, typeof MapPin> = {
    photo: MapPin,
    signature: CheckCircle2,
    form: Briefcase,
    incident_report: AlertCircle,
    checklist: CheckCircle2,
    attendance: Clock,
  };

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-rose-500" /> Offline Sync Queue
      </h3>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Pending" value={pending.length} icon={WifiOff} color="text-rose-600" accent="bg-rose-50" />
        <StatCard label="Synced" value={synced.length} icon={Wifi} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Workers w/ Pending" value={workers.filter(w => w.pendingSyncCount > 0).length} icon={Users} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Total Items" value={syncQueue.length} icon={RefreshCw} color="text-slate-600" accent="bg-slate-50" />
      </div>

      {/* Workers with pending sync */}
      {workers.filter(w => w.pendingSyncCount > 0).length > 0 && (
        <Card className="p-4 mb-4">
          <h4 className="text-xs font-bold text-slate-700 mb-2">Workers with Pending Data</h4>
          <div className="space-y-2">
            {workers.filter(w => w.pendingSyncCount > 0).map(w => (
              <div key={w.id} className="flex items-center gap-3 p-2 rounded-lg bg-rose-50/50 border border-rose-100">
                <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center">
                  <WifiOff className="w-4 h-4 text-rose-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{w.full_name}</p>
                  <p className="text-xs text-slate-400">{w.position || 'Field Staff'}</p>
                </div>
                <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded text-xs font-bold">{w.pendingSyncCount} pending</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pending items */}
      {pending.length === 0 ? (
        <EmptyState icon={Wifi} title="All data synced" description="No pending offline data from field workers" />
      ) : (
        <div>
          <h4 className="text-xs font-bold text-slate-700 mb-2">Pending Items</h4>
          <div className="space-y-2">
            {pending.slice(0, 20).map(item => {
              const worker = workers.find(w => w.id === item.employee_id);
              const Icon = dataTypeIcons[item.data_type] || Briefcase;
              return (
                <div key={item.id} className="bg-white rounded-xl border border-rose-200 p-3 shadow-sm flex items-center gap-3">
                  <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center">
                    <Icon className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{worker?.full_name || 'Unknown worker'}</p>
                    <p className="text-xs text-slate-400 capitalize">{item.data_type.replace('_', ' ')} · {timeAgo(item.created_at)}</p>
                  </div>
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-semibold">Pending</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recently synced */}
      {synced.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-bold text-slate-700 mb-2">Recently Synced</h4>
          <div className="space-y-2">
            {synced.slice(0, 10).map(item => {
              const worker = workers.find(w => w.id === item.employee_id);
              const Icon = dataTypeIcons[item.data_type] || Briefcase;
              return (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex items-center gap-3 opacity-60">
                  <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                    <Icon className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{worker?.full_name || 'Unknown worker'}</p>
                    <p className="text-xs text-slate-400 capitalize">{item.data_type.replace('_', ' ')} · {item.synced_at ? timeAgo(item.synced_at) : ''}</p>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
              );
            })}
          </div>
        </div>
      )}
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
                <span className="text-xs font-bold text-slate-700">{new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className={`text-xs ${isToday ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>{new Date(date).getDate()}</span>
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
        const earnings = assignments.filter(a => a.employee_id === w.id && a.status === 'approved').reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
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
          <div key={w.id} className={`bg-white rounded-xl border p-4 shadow-sm flex items-center gap-4 ${idx === 0 ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-100 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'
            }`}>{idx + 1}</div>
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
                <div className="flex items-center gap-1 justify-end"><Star className="w-3.5 h-3.5 text-amber-500" /><span className="text-sm font-bold text-slate-900">{w.avgScore}</span></div>
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
function AssignModal({ employees, bookings, assignments, onClose, onCreated }: {
  employees: AdminEmployee[];
  bookings: AdminBooking[];
  assignments: AdminAssignment[];
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

  // Auto-recommend best worker — uses actual workload from assignments
  const recommendedWorker = useMemo(() => {
    if (employees.length === 0) return null;
    const scored = employees.map(e => {
      const activeJobs = assignments.filter(a => a.employee_id === e.id && ['assigned', 'accepted', 'in_progress'].includes(a.status)).length;
      const score = (Number(e.performance_score) || 0) * 0.5 - activeJobs * 10;
      return { ...e, dispatchScore: score, activeJobs };
    });
    scored.sort((a, b) => b.dispatchScore - a.dispatchScore);
    return scored[0];
  }, [employees, assignments]);

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
      const { data: newAssign, error: insertErr } = await supabase.from('field_assignments').insert(payload).select().single();
      if (insertErr) throw insertErr;
      // Log job event
      if (newAssign) {
        await supabase.from('field_job_events').insert({
          assignment_id: newAssign.id,
          employee_id: employeeId,
          event_type: 'assigned',
          note: 'Manually assigned by admin',
        });
      }
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

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">From Booking (optional)</label>
          <select value={bookingId} onChange={e => setBookingId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">— Select a booking —</option>
            {bookings.map(b => <option key={b.id} value={b.id}>{b.service_name} · {b.customer_name} · {b.address}</option>)}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assign To</label>
            {recommendedWorker && (
              <button onClick={handleUseRecommended} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                <Zap className="w-3 h-3" /> Recommended: {recommendedWorker.full_name.split(' ')[0]} ({recommendedWorker.activeJobs} active)
              </button>
            )}
          </div>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">— Select worker —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} · {e.position || 'Field Staff'} · {e.jobs_completed || 0} done</option>)}
          </select>
        </div>

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

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Amount (SLE)</label>
          <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Instructions</label>
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Special instructions for the worker…" rows={3} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Assign Job
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
