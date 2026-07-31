import { useEffect, useState, useRef } from 'react';
import {
  CheckCircle2, Clock, Package, Truck, PlayCircle, XCircle,
  Loader2, MapPin, Navigation, User,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BookingTrackerProps {
  bookingId: string;
  currentStatus: string;
}

interface HistoryEntry {
  id: string;
  status: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

interface FieldAssignment {
  id: string;
  status: string;
  service_name: string;
  employee_id: string;
  scheduled_time: string | null;
}

interface JobEvent {
  id: string;
  assignment_id: string;
  event_type: string;
  eta_minutes: number | null;
  created_at: string;
}

const stages = [
  { key: 'pending', label: 'Submitted', description: 'Booking request received', icon: Clock, color: 'amber' },
  { key: 'confirmed', label: 'Confirmed', description: 'Admin confirmed your booking', icon: CheckCircle2, color: 'blue' },
  { key: 'in_progress', label: 'In Progress', description: 'Team is on the job', icon: PlayCircle, color: 'emerald' },
  { key: 'completed', label: 'Completed', description: 'Service delivered successfully', icon: Package, color: 'slate' },
];

const colorMap: Record<string, { dot: string; line: string; icon: string; text: string }> = {
  amber: { dot: 'bg-amber-500', line: 'bg-amber-400', icon: 'text-amber-600', text: 'text-amber-700' },
  blue: { dot: 'bg-blue-500', line: 'bg-blue-400', icon: 'text-blue-600', text: 'text-blue-700' },
  emerald: { dot: 'bg-emerald-500', line: 'bg-emerald-400', icon: 'text-emerald-600', text: 'text-emerald-700' },
  slate: { dot: 'bg-slate-500', line: 'bg-slate-300', icon: 'text-slate-600', text: 'text-slate-700' },
  red: { dot: 'bg-red-500', line: 'bg-red-400', icon: 'text-red-600', text: 'text-red-700' },
};

const fieldStatusLabels: Record<string, string> = {
  assigned: 'Worker Assigned',
  accepted: 'Worker En Route',
  in_progress: 'Worker On Site',
  paused: 'Work Paused',
  pending_review: 'Work Submitted',
  approved: 'Work Approved',
  rejected: 'Needs Attention',
  declined: 'Worker Unavailable',
};

const fieldStatusColors: Record<string, string> = {
  assigned: 'bg-blue-50 text-blue-700',
  accepted: 'bg-indigo-50 text-indigo-700',
  in_progress: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-orange-50 text-orange-700',
  pending_review: 'bg-purple-50 text-purple-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  declined: 'bg-red-50 text-red-700',
};

export function BookingTracker({ bookingId, currentStatus }: BookingTrackerProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [fieldAssignment, setFieldAssignment] = useState<FieldAssignment | null>(null);
  const [latestEvent, setLatestEvent] = useState<JobEvent | null>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    fetchHistory();
    fetchFieldAssignment();

    // Real-time subscription to status history changes
    subscriptionRef.current = supabase
      .channel(`booking-tracker-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_status_history',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          setHistory((prev) => {
            if (prev.some((h) => h.id === (payload.new as HistoryEntry).id)) return prev;
            return [...prev, payload.new as HistoryEntry].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'field_assignments',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          if (payload.new) {
            const fa = payload.new as FieldAssignment;
            setFieldAssignment(fa);
            fetchLatestEvent(fa.id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'field_job_events',
        },
        (payload) => {
          const evt = payload.new as JobEvent;
          if (fieldAssignment && evt.assignment_id === fieldAssignment.id) {
            setLatestEvent(evt);
          }
        }
      )
      .subscribe();

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [bookingId]);

  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from('booking_status_history')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    if (error) { setFetchError(true); setLoading(false); return; }
    setHistory((data as HistoryEntry[]) || []);
    setLoading(false);
  };

  const fetchFieldAssignment = async () => {
    const { data } = await supabase
      .from('field_assignments')
      .select('id, status, service_name, employee_id, scheduled_time')
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (data) {
      setFieldAssignment(data as FieldAssignment);
      fetchLatestEvent(data.id);
    }
  };

  const fetchLatestEvent = async (assignmentId: string) => {
    const { data } = await supabase
      .from('field_job_events')
      .select('id, assignment_id, event_type, eta_minutes, created_at')
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setLatestEvent(data as JobEvent);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-slate-500 mb-3">Failed to load tracking history.</p>
        <button onClick={() => { setFetchError(false); setLoading(true); fetchHistory(); }} className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  const isCancelled = currentStatus === 'cancelled';

  // Build the timeline
  const timeline = stages.map((stage, index) => {
    const entry = history.find((h) => h.status === stage.key);
    const isCurrent = currentStatus === stage.key;
    const isPast = history.some((h) => h.status === stage.key);
    const currentStageIndex = stages.findIndex((s) => s.key === currentStatus);
    const isUpcoming = !isPast && index > currentStageIndex && !isCancelled;
    const isActive = isCurrent && currentStatus !== 'completed' && !isCancelled;

    return {
      ...stage,
      entry,
      isPast,
      isCurrent,
      isUpcoming,
      isActive,
    };
  });

  return (
    <div className="py-4 px-2">
      <div className="flex items-center gap-2 mb-5">
        <Truck className="w-4 h-4 text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-700">Live Booking Tracker</h4>
        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Desktop horizontal timeline */}
      <div className="hidden sm:block">
        <div className="relative">
          {/* Progress line */}
          <div className="absolute top-5 left-5 right-5 h-0.5 bg-slate-200 rounded-full">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{
                width: isCancelled
                  ? '0%'
                  : `${(timeline.filter((t) => t.isPast).length / stages.length) * 100}%`,
              }}
            />
          </div>

          <div className="relative flex justify-between">
            {timeline.map((stage) => {
              const Icon = stage.icon;
              const color = colorMap[stage.color];
              const cancelledColor = isCancelled && stage.isCurrent ? colorMap.red : color;

              return (
                <div key={stage.key} className="flex flex-col items-center text-center" style={{ width: '24%' }}>
                  <div
                    className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                      stage.isPast
                        ? `${cancelledColor.dot} text-white shadow-lg`
                        : stage.isActive
                        ? `${cancelledColor.dot} text-white shadow-lg ring-4 ring-emerald-100`
                        : 'bg-white border-2 border-slate-200 text-slate-300'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {stage.isActive && (
                      <span className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-75" />
                    )}
                  </div>
                  <p
                    className={`mt-3 text-xs font-semibold transition-colors ${
                      stage.isPast || stage.isActive ? cancelledColor.text : 'text-slate-400'
                    }`}
                  >
                    {stage.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400 leading-tight max-w-[120px]">
                    {stage.description}
                  </p>
                  {stage.entry && (
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      {new Date(stage.entry.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile vertical timeline */}
      <div className="sm:hidden">
        <div className="relative pl-8">
          <div className="absolute left-3.5 top-2 bottom-2 w-0.5 bg-slate-200">
            <div
              className="w-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{
                height: isCancelled
                  ? '0%'
                  : `${(timeline.filter((t) => t.isPast).length / stages.length) * 100}%`,
              }}
            />
          </div>

          <div className="space-y-5">
            {timeline.map((stage) => {
              const Icon = stage.icon;
              const color = colorMap[stage.color];
              const cancelledColor = isCancelled && stage.isCurrent ? colorMap.red : color;

              return (
                <div key={stage.key} className="relative">
                  <div
                    className={`absolute -left-7 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500 ${
                      stage.isPast
                        ? `${cancelledColor.dot} text-white shadow-md`
                        : stage.isActive
                        ? `${cancelledColor.dot} text-white shadow-md ring-4 ring-emerald-100`
                        : 'bg-white border-2 border-slate-200 text-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        stage.isPast || stage.isActive ? cancelledColor.text : 'text-slate-400'
                      }`}
                    >
                      {stage.label}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{stage.description}</p>
                    {stage.entry && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        {new Date(stage.entry.created_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cancelled notice */}
      {isCancelled && (
        <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          This booking was cancelled.
        </div>
      )}

      {/* Field worker live status */}
      {fieldAssignment && !isCancelled && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-semibold text-slate-700">Field Worker Status</h4>
            {latestEvent && latestEvent.event_type === 'en_route' && latestEvent.eta_minutes != null && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">
                <Navigation className="w-3 h-3" /> ETA {latestEvent.eta_minutes} min
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Navigation className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{fieldAssignment.service_name}</p>
              <p className="text-xs text-slate-400">
                {fieldAssignment.scheduled_time ? `Scheduled: ${fieldAssignment.scheduled_time}` : 'Scheduled time TBD'}
              </p>
              {latestEvent && (
                <p className="text-[11px] text-cyan-600 font-medium mt-0.5">
                  {latestEvent.event_type.replace('_', ' ')}
                  {latestEvent.eta_minutes != null && ` · ETA ${latestEvent.eta_minutes} min`}
                </p>
              )}
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${fieldStatusColors[fieldAssignment.status] || 'bg-slate-100 text-slate-600'}`}>
              {fieldStatusLabels[fieldAssignment.status] || fieldAssignment.status}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
