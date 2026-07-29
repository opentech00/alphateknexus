import { useEffect, useState, useRef } from 'react';
import {
  CheckCircle2, Clock, Package, Truck, PlayCircle, XCircle,
  Loader2,
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

export function BookingTracker({ bookingId, currentStatus }: BookingTrackerProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    fetchHistory();

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
            if (prev.some((h) => h.id === payload.new.id)) return prev;
            return [...prev, payload.new as HistoryEntry].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
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
    </div>
  );
}
