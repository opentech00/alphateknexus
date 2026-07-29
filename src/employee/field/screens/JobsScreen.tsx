import { useState, useMemo, useEffect } from 'react';
import { Search, ClipboardList, Briefcase, MapPin, Calendar, Navigation, Loader2, Route, Clock, AlertCircle } from 'lucide-react';
import { useFieldStaff } from '../FieldStaffContext';
import { STATUS_META, type AssignmentStatus } from '../types';
import { getCurrentPosition, haversineKm, formatDistance, estimateTravelTimeKm, optimizeRoute, detectTimeConflict, type Coords } from '../geo';

const FILTERS: { key: 'all' | AssignmentStatus; label: string }[] = [
  { key: 'all',          label: 'All' },
  { key: 'assigned',     label: 'Assigned' },
  { key: 'in_progress',  label: 'Active' },
  { key: 'pending_review', label: 'In Review' },
  { key: 'approved',     label: 'Completed' },
];

export function JobsScreen({ onOpenJob }: { onOpenJob: (id: string) => void }) {
  const { assignments } = useFieldStaff();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | AssignmentStatus>('all');
  const [sortByDistance, setSortByDistance] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);

  const jobCoords = useMemo((): Record<string, Coords> => {
    const map: Record<string, Coords> = {};
    for (const a of assignments) {
      if (a.latitude != null && a.longitude != null) {
        map[a.id] = { lat: a.latitude, lng: a.longitude };
      } else if (a.address) {
        let h = 0;
        for (let i = 0; i < a.address.length; i++) h = ((h << 5) - h + a.address.charCodeAt(i)) | 0;
        map[a.id] = {
          lat: 8.4657 + (h % 1000) / 1000 * 0.1,
          lng: -13.2317 + ((h >> 10) % 1000) / 1000 * 0.1,
        };
      }
    }
    return map;
  }, [assignments]);

  const enableProximity = async () => {
    setLocating(true);
    const pos = await getCurrentPosition();
    if (pos) {
      setUserLocation(pos);
      setSortByDistance(true);
    } else {
      const first = assignments[0];
      if (first && jobCoords[first.id]) {
        setUserLocation(jobCoords[first.id]);
        setSortByDistance(true);
      }
    }
    setLocating(false);
  };

  const filtered = useMemo(() => {
    let r = assignments;
    if (filter !== 'all') r = r.filter(a => a.status === filter);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(a =>
        a.service_name.toLowerCase().includes(s) ||
        a.customer_name.toLowerCase().includes(s) ||
        a.address.toLowerCase().includes(s)
      );
    }

    if (sortByDistance && userLocation) {
      r = [...r].sort((a, b) => {
        const ca = jobCoords[a.id];
        const cb = jobCoords[b.id];
        if (!ca && !cb) return 0;
        if (!ca) return 1;
        if (!cb) return -1;
        return haversineKm(userLocation, ca) - haversineKm(userLocation, cb);
      });
    } else {
      r = [...r].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return r;
  }, [assignments, filter, search, sortByDistance, userLocation, jobCoords]);

  // Route optimization for today's jobs
  const todayRoute = useMemo(() => {
    if (!userLocation) return null;
    const today = new Date().toISOString().split('T')[0];
    const todayJobs = assignments.filter(a =>
      a.scheduled_date === today &&
      (a.status === 'assigned' || a.status === 'accepted' || a.status === 'in_progress') &&
      jobCoords[a.id]
    );
    if (todayJobs.length === 0) return null;

    const stops = todayJobs.map(a => ({
      id: a.id,
      coords: jobCoords[a.id],
      label: a.service_name,
    }));
    const optimized = optimizeRoute(stops, userLocation);

    let totalKm = 0;
    let prev = userLocation;
    const routeWithDist = optimized.map(stop => {
      const km = haversineKm(prev, stop.coords);
      totalKm += km;
      prev = stop.coords;
      return { ...stop, kmFromPrev: km };
    });

    return { route: routeWithDist, totalKm };
  }, [assignments, userLocation, jobCoords]);

  // Conflict detection
  const conflicts = useMemo(() => detectTimeConflict(filtered), [filtered]);

  return (
    <div className="max-w-md mx-auto px-4 py-5 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">My Jobs</h1>
        <p className="text-sm text-slate-400">All assignments assigned to you</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by service, customer, address…"
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Filter chips + proximity toggle */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1 -mx-1 px-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                filter === f.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={enableProximity}
          disabled={locating}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
            sortByDistance
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
          {sortByDistance ? 'Nearest' : 'Sort'}
        </button>
      </div>

      {/* Route optimization toggle */}
      {sortByDistance && userLocation && todayRoute && (
        <button
          onClick={() => setShowRoute(!showRoute)}
          className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
            showRoute ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Route className="w-4 h-4" />
          Optimized Route
          <span className="ml-auto text-xs opacity-80">
            {todayRoute.route.length} stops · {formatDistance(todayRoute.totalKm)} · {estimateTravelTimeKm(todayRoute.totalKm)}
          </span>
        </button>
      )}

      {/* Route detail */}
      {showRoute && todayRoute && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Navigation className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Today's Optimized Route</h3>
          </div>
          {todayRoute.route.map((stop, idx) => (
            <div key={stop.id} className="flex items-center gap-3">
              <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-emerald-700">{idx + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{stop.label}</p>
                <p className="text-xs text-slate-400">
                  {formatDistance(stop.kmFromPrev)} · {estimateTravelTimeKm(stop.kmFromPrev)}
                </p>
              </div>
              <button onClick={() => onOpenJob(stop.id)} className="text-xs text-emerald-600 font-semibold">
                View
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Conflict warnings */}
      {conflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            {conflicts.length} scheduling conflict{conflicts.length !== 1 ? 's' : ''} detected — jobs scheduled less than 1 hour apart
          </p>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No jobs found</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(job => {
            const sm = STATUS_META[job.status];
            const dist = (sortByDistance && userLocation && jobCoords[job.id])
              ? haversineKm(userLocation, jobCoords[job.id])
              : null;
            return (
              <button
                key={job.id}
                onClick={() => onOpenJob(job.id)}
                className="w-full bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-slate-900 truncate">{job.service_name}</p>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${sm.bg} ${sm.color} flex-shrink-0`}>
                        <span className={`w-1 h-1 rounded-full ${sm.dot}`} />
                        {sm.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{job.customer_name || 'No customer name'}</p>
                    {job.address && (
                      <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{job.address}</span>
                        {dist != null && (
                          <span className="text-blue-500 font-medium flex-shrink-0 ml-1">· {formatDistance(dist)}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      {job.scheduled_date && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Calendar className="w-3 h-3" /> {job.scheduled_date}
                        </span>
                      )}
                      {job.scheduled_time && <span className="text-xs text-slate-400">{job.scheduled_time}</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
