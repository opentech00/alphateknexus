import { useEffect, useState, useRef } from 'react';
import {
  CheckCircle2, Clock, Package, Truck, PlayCircle, XCircle,
  Loader2, MapPin, Calendar, User, Phone, ArrowLeft, Navigation,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BookingDetail {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  notes: string | null;
  service_id: string;
  services: { name: string; icon: string; slug: string };
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
  { key: 'pending_review', label: 'In Review', description: 'Booking request submitted', icon: Clock, color: 'amber' },
  { key: 'approved', label: 'Approved', description: 'Admin approved your booking', icon: CheckCircle2, color: 'blue' },
  { key: 'confirmed', label: 'Confirmed', description: 'Booking confirmed and scheduled', icon: CheckCircle2, color: 'blue' },
  { key: 'in_progress', label: 'In Progress', description: 'Team is on the job', icon: PlayCircle, color: 'emerald' },
  { key: 'completed', label: 'Completed', description: 'Service delivered successfully', icon: Package, color: 'slate' },
];

const colorMap: Record<string, { dot: string; line: string; icon: string; text: string; bg: string }> = {
  amber: { dot: 'bg-amber-500', line: 'bg-amber-400', icon: 'text-amber-600', text: 'text-amber-700', bg: 'bg-amber-50' },
  blue: { dot: 'bg-blue-500', line: 'bg-blue-400', icon: 'text-blue-600', text: 'text-blue-700', bg: 'bg-blue-50' },
  emerald: { dot: 'bg-emerald-500', line: 'bg-emerald-400', icon: 'text-emerald-600', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  slate: { dot: 'bg-slate-500', line: 'bg-slate-300', icon: 'text-slate-600', text: 'text-slate-700', bg: 'bg-slate-50' },
  red: { dot: 'bg-red-500', line: 'bg-red-400', icon: 'text-red-600', text: 'text-red-700', bg: 'bg-red-50' },
};

const statusLabels: Record<string, string> = {
  pending: 'Pending', pending_review: 'In Review', approved: 'Approved',
  confirmed: 'Confirmed', in_progress: 'In Progress',
  completed: 'Completed', cancelled: 'Cancelled',
};

interface BookingTrackingPageProps {
  bookingId: string;
  onBack: () => void;
}

export function BookingTrackingPage({ bookingId, onBack }: BookingTrackingPageProps) {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [fieldAssignment, setFieldAssignment] = useState<FieldAssignment | null>(null);
  const [latestEvent, setLatestEvent] = useState<JobEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const subRef = useRef<any>(null);

  useEffect(() => {
    fetchBooking();
    fetchHistory();
    fetchFieldAssignment();

    subRef.current = supabase
      .channel(`tracking-${bookingId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `id=eq.${bookingId}`,
      }, (payload) => {
        setBooking((prev) => prev ? { ...prev, ...payload.new } : prev);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_status_history',
        filter: `booking_id=eq.${bookingId}`,
      }, (payload) => {
        setHistory((prev) => {
          if (prev.some((h) => h.id === (payload.new as HistoryEntry).id)) return prev;
          return [...prev, payload.new as HistoryEntry].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'field_assignments',
        filter: `booking_id=eq.${bookingId}`,
      }, (payload) => {
        if (payload.new) {
          const fa = payload.new as FieldAssignment;
          setFieldAssignment(fa);
          fetchLatestEvent(fa.id);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'field_job_events',
      }, (payload) => {
        const evt = payload.new as JobEvent;
        if (fieldAssignment && evt.assignment_id === fieldAssignment.id) {
          setLatestEvent(evt);
        }
      })
      .subscribe();

    return () => {
      if (subRef.current) supabase.removeChannel(subRef.current);
    };
  }, [bookingId]);

  const fetchBooking = async () => {
    const { data, error: err } = await supabase
      .from('bookings')
      .select('*, services(name, icon, slug)')
      .eq('id', bookingId)
      .maybeSingle();
    if (err || !data) { setError(true); setLoading(false); return; }
    setBooking(data as unknown as BookingDetail);
    setLoading(false);
  };

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('booking_status_history')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    setHistory((data as HistoryEntry[]) || []);
  };

  const fetchFieldAssignment = async () => {
    const { data } = await supabase
      .from('field_assignments')
      .select('id, status, service_name, scheduled_time')
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-slate-500 mb-3">Booking not found.</p>
        <button onClick={onBack} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors">
          Go Back
        </button>
      </div>
    );
  }

  const isCancelled = booking.status === 'cancelled';
  const effectiveStatus = booking.status === 'pending' ? 'pending_review' : booking.status;
  const completedCount = history.filter((h) => stages.some((s) => s.key === h.status)).length;
  const progressPct = isCancelled ? 0 : (completedCount / stages.length) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to bookings
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{booking.services.name}</h1>
            <p className="text-sm text-slate-400 mt-0.5">Booking #{booking.id.slice(0, 8)}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full ${
            isCancelled ? 'bg-red-50 text-red-700 border border-red-200' :
            booking.status === 'completed' ? 'bg-slate-100 text-slate-600' :
            booking.status === 'in_progress' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            booking.status === 'confirmed' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            booking.status === 'approved' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
            booking.status === 'pending_review' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
            'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              booking.status === 'in_progress' ? 'bg-emerald-500 animate-pulse' :
              isCancelled ? 'bg-red-500' :
              booking.status === 'completed' ? 'bg-slate-400' :
              booking.status === 'approved' ? 'bg-teal-500' :
              booking.status === 'pending_review' ? 'bg-orange-500' : 'bg-amber-500'
            }`} />
            {statusLabels[booking.status] || booking.status}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
            {new Date(booking.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            {booking.scheduled_time && <span className="text-slate-400">at {booking.scheduled_time}</span>}
          </div>
          {booking.location && (
            <div className="flex items-center gap-2 text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {booking.location}
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-600">
            <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
            {booking.contact_name}
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
            {booking.contact_phone}
          </div>
        </div>
        {booking.notes && (
          <div className="mt-3 p-3 bg-slate-50 rounded-xl text-sm text-slate-500">{booking.notes}</div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <Truck className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Live Booking Tracker</h3>
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> LIVE
          </span>
        </div>

        {/* Desktop horizontal timeline */}
        <div className="hidden sm:block">
          <div className="relative">
            <div className="absolute top-5 left-5 right-5 h-0.5 bg-slate-200 rounded-full">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="relative flex justify-between">
              {stages.map((stage) => {
                const Icon = stage.icon;
                const color = colorMap[stage.color];
                const isPast = history.some((h) => h.status === stage.key);
                const isCurrent = effectiveStatus === stage.key;
                const isActive = isCurrent && effectiveStatus !== 'completed' && !isCancelled;
                const cancelledColor = isCancelled && isCurrent ? colorMap.red : color;
                return (
                  <div key={stage.key} className="flex flex-col items-center text-center" style={{ width: '24%' }}>
                    <div className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isPast ? `${cancelledColor.dot} text-white shadow-lg` :
                      isActive ? `${cancelledColor.dot} text-white shadow-lg ring-4 ring-emerald-100` :
                      'bg-white border-2 border-slate-200 text-slate-300'
                    }`}>
                      <Icon className="w-5 h-5" />
                      {isActive && <span className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-75" />}
                    </div>
                    <p className={`mt-3 text-xs font-semibold transition-colors ${isPast || isActive ? cancelledColor.text : 'text-slate-400'}`}>{stage.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400 leading-tight max-w-[120px]">{stage.description}</p>
                    {history.find((h) => h.status === stage.key) && (
                      <p className="mt-1.5 text-[10px] text-slate-400">
                        {new Date(history.find((h) => h.status === stage.key)!.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
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
              <div className="w-full bg-emerald-500 rounded-full transition-all duration-700" style={{ height: `${progressPct}%` }} />
            </div>
            <div className="space-y-5">
              {stages.map((stage) => {
                const Icon = stage.icon;
                const color = colorMap[stage.color];
                const isPast = history.some((h) => h.status === stage.key);
                const isCurrent = effectiveStatus === stage.key;
                const isActive = isCurrent && effectiveStatus !== 'completed' && !isCancelled;
                const cancelledColor = isCancelled && isCurrent ? colorMap.red : color;
                return (
                  <div key={stage.key} className="relative">
                    <div className={`absolute -left-7 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isPast ? `${cancelledColor.dot} text-white shadow-md` :
                      isActive ? `${cancelledColor.dot} text-white shadow-md ring-4 ring-emerald-100` :
                      'bg-white border-2 border-slate-200 text-slate-300'
                    }`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isPast || isActive ? cancelledColor.text : 'text-slate-400'}`}>{stage.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{stage.description}</p>
                      {history.find((h) => h.status === stage.key) && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          {new Date(history.find((h) => h.status === stage.key)!.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {isCancelled && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <XCircle className="w-4 h-4 flex-shrink-0" /> This booking was cancelled.
          </div>
        )}
      </div>

      {/* Field worker live status with ETA */}
      {fieldAssignment && !isCancelled && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Navigation className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-700">Field Worker Status</h3>
            {latestEvent && latestEvent.event_type === 'en_route' && latestEvent.eta_minutes != null && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">
                <Navigation className="w-3 h-3" /> ETA {latestEvent.eta_minutes} min
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Truck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{fieldAssignment.service_name}</p>
              <p className="text-xs text-slate-400">
                {fieldAssignment.scheduled_time ? `Scheduled: ${fieldAssignment.scheduled_time}` : 'Scheduled time TBD'}
              </p>
              {latestEvent && (
                <p className="text-[11px] text-cyan-600 font-medium mt-0.5">
                  {latestEvent.event_type.replace('_', ' ')}
                  {latestEvent.eta_minutes != null && ` \u00b7 ETA ${latestEvent.eta_minutes} min`}
                </p>
              )}
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              fieldAssignment.status === 'in_progress' ? 'bg-amber-50 text-amber-600' :
              fieldAssignment.status === 'completed' || fieldAssignment.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
              fieldAssignment.status === 'paused' ? 'bg-orange-50 text-orange-600' :
              'bg-slate-100 text-slate-600'
            }`}>
              {fieldAssignment.status.replace('_', ' ')}
            </span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Status History</h3>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No status updates yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => {
              const stage = stages.find((s) => s.key === entry.status);
              const color = colorMap[stage?.color || 'slate'];
              return (
                <div key={entry.id} className="flex items-start gap-3">
                  <div className={`w-8 h-8 ${color.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    {stage ? <stage.icon className={`w-4 h-4 ${color.icon}`} /> : <Clock className="w-4 h-4 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{statusLabels[entry.status] || entry.status}</p>
                    {entry.note && <p className="text-xs text-slate-400 mt-0.5">{entry.note}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">{new Date(entry.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
