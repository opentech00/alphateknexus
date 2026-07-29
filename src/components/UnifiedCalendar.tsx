import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, MapPin,
  Loader2, Recycle, Briefcase, X, Truck, Bell,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CalendarBooking {
  id: string;
  type: 'booking';
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  status: string;
  service_icon: string;
  service_slug: string;
}

interface CalendarPickup {
  id: string;
  type: 'pickup';
  title: string;
  date: string;
  time_slot: string;
  address: string | null;
  status: string;
  bin_size: number;
  waste_type: string;
  driver_name: string | null;
}

type CalendarEvent = CalendarBooking | CalendarPickup;

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-red-100 text-red-600',
  scheduled: 'bg-sky-100 text-sky-700',
  assigned: 'bg-indigo-100 text-indigo-700',
  missed: 'bg-red-100 text-red-600',
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

const WASTE_LABELS: Record<string, string> = {
  general: 'General Waste',
  recyclables: 'Recyclables',
  organic: 'Organic / Green',
  construction: 'Construction',
  ewaste: 'E-Waste',
  bulk: 'Bulk Items',
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

interface UnifiedCalendarProps {
  onNavigate?: (page: string) => void;
}

export function UnifiedCalendar({ onNavigate }: UnifiedCalendarProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [animateIn, setAnimateIn] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const startDate = formatDateKey(currentYear, currentMonth, 1);
    const endDate = formatDateKey(currentYear, currentMonth, getDaysInMonth(currentYear, currentMonth));

    const [bookingsRes, pickupsRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, status, scheduled_date, scheduled_time, location, services(name, icon, slug)')
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('smart_sort_pickups')
        .select('id, scheduled_date, time_slot, status, driver_name, subscriptions:smart_sort_subscriptions(waste_type, address, bin_size_liters)')
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .order('scheduled_date', { ascending: true }),
    ]);

    const bookings: CalendarBooking[] = (bookingsRes.data || []).map((b: any) => ({
      id: b.id,
      type: 'booking' as const,
      title: b.services?.name || 'Booking',
      date: b.scheduled_date,
      time: b.scheduled_time,
      location: b.location,
      status: b.status,
      service_icon: b.services?.icon || 'Briefcase',
      service_slug: b.services?.slug || '',
    }));

    const pickups: CalendarPickup[] = (pickupsRes.data || []).map((p: any) => ({
      id: p.id,
      type: 'pickup' as const,
      title: `${WASTE_LABELS[p.subscriptions?.waste_type] || 'Collection'} Pickup`,
      date: p.scheduled_date,
      time_slot: p.time_slot,
      address: p.subscriptions?.address || null,
      status: p.status,
      bin_size: p.subscriptions?.bin_size_liters || 25,
      waste_type: p.subscriptions?.waste_type || 'general',
      driver_name: p.driver_name,
    }));

    setEvents([...bookings, ...pickups]);
    setLoading(false);
    setAnimateIn(true);
  }, [currentYear, currentMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [events]);

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  const goToPreviousMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
    setSelectedDate(null);
    setAnimateIn(false);
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
    setSelectedDate(null);
    setAnimateIn(false);
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(formatDateKey(today.getFullYear(), today.getMonth(), today.getDate()));
    setAnimateIn(false);
  };

  const isToday = (day: number): boolean =>
    today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day;

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const hasBookings = events.some((e) => e.type === 'booking');
  const hasPickups = events.some((e) => e.type === 'pickup');

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span>Bookings</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>Pickups</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-800">{monthName} {currentYear}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={goToToday}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Today
              </button>
              <button onClick={goToPreviousMonth} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors" aria-label="Previous month">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goToNextMonth} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors" aria-label="Next month">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-3 pt-3">
            {DAY_HEADERS.map((day) => (
              <div key={day} className="text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-1 px-3 pb-3">
            {loading ? (
              <div className="col-span-7 flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              </div>
            ) : (
              cells.map((day, i) => {
                if (day === null) return <div key={`empty-${i}`} className="h-16 sm:h-20" />;
                const dateKey = formatDateKey(currentYear, currentMonth, day);
                const dayEvents = eventsByDate[dateKey] || [];
                const dayBookings = dayEvents.filter((e) => e.type === 'booking');
                const dayPickups = dayEvents.filter((e) => e.type === 'pickup');
                const isSelected = selectedDate === dateKey;
                const isTodayDate = isToday(day);

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateKey === selectedDate ? null : dateKey)}
                    className={`relative flex flex-col items-center justify-start pt-1.5 h-16 sm:h-20 rounded-lg text-sm font-medium transition-all duration-200 group ${
                      isSelected
                        ? 'bg-emerald-50 ring-2 ring-emerald-400'
                        : isTodayDate
                        ? 'bg-slate-50 ring-1 ring-emerald-200'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className={isTodayDate && !isSelected ? 'text-emerald-600 font-bold' : 'text-slate-700'}>
                      {day}
                    </span>
                    <div className="flex flex-col gap-0.5 mt-1 px-1 w-full items-center">
                      {dayBookings.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {dayBookings.length > 1 && <span className="text-[9px] text-blue-600 font-semibold">{dayBookings.length}</span>}
                        </div>
                      )}
                      {dayPickups.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {dayPickups.length > 1 && <span className="text-[9px] text-emerald-600 font-semibold">{dayPickups.length}</span>}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Side panel: events for selected day */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">
              {selectedDate ? formatDate(selectedDate) : 'Select a date'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedEvents.length > 0 ? `${selectedEvents.length} event${selectedEvents.length !== 1 ? 's' : ''}` : 'No events scheduled'}
            </p>
          </div>

          <div className="p-4 max-h-[400px] overflow-y-auto">
            {!selectedDate ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Calendar className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">Click any date to see scheduled events</p>
              </div>
            ) : selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mb-2">
                  <Calendar className="w-5 h-5 text-slate-300" />
                </div>
                <p className="text-sm text-slate-400">Nothing scheduled</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((ev, i) => (
                  <button
                    key={`${ev.type}-${ev.id}`}
                    onClick={() => setDetailEvent(ev)}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-200 hover:shadow-sm animate-[fadeIn_0.3s_ease] ${
                      ev.type === 'booking'
                        ? 'border-blue-100 bg-blue-50/50 hover:bg-blue-50'
                        : 'border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50'
                    }`}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        ev.type === 'booking' ? 'bg-blue-100' : 'bg-emerald-100'
                      }`}>
                        {ev.type === 'booking'
                          ? <Briefcase className="w-4 h-4 text-blue-600" />
                          : <Recycle className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{ev.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {ev.type === 'booking' ? (ev.time || 'Any time') : SLOT_LABELS[ev.time_slot] || ev.time_slot}
                          </span>
                          {(ev.type === 'booking' ? ev.location : ev.address) && (
                            <span className="inline-flex items-center gap-1 truncate max-w-[120px]">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              {ev.type === 'booking' ? ev.location : ev.address}
                            </span>
                          )}
                        </div>
                        <span className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full capitalize ${STATUS_STYLES[ev.status] || 'bg-slate-100 text-slate-500'}`}>
                          {ev.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event Detail Modal */}
      {detailEvent && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" onClick={() => setDetailEvent(null)}>
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md animate-[slideUp_0.3s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  detailEvent.type === 'booking' ? 'bg-blue-100' : 'bg-emerald-100'
                }`}>
                  {detailEvent.type === 'booking'
                    ? <Briefcase className="w-4.5 h-4.5 text-blue-600" />
                    : <Recycle className="w-4.5 h-4.5 text-emerald-600" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{detailEvent.title}</h2>
                  <p className="text-xs text-slate-400">
                    {detailEvent.type === 'booking' ? 'Service Booking' : 'Subscription Pickup'}
                  </p>
                </div>
              </div>
              <button onClick={() => setDetailEvent(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-slate-700">{formatDate(detailEvent.date)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-slate-700">
                  {detailEvent.type === 'booking'
                    ? detailEvent.time || 'Any time'
                    : SLOT_LABELS[detailEvent.time_slot] || detailEvent.time_slot}
                </span>
              </div>
              {(detailEvent.type === 'booking' ? detailEvent.location : detailEvent.type === 'pickup' ? detailEvent.address : null) && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-700">
                    {detailEvent.type === 'booking' ? detailEvent.location : detailEvent.address}
                  </span>
                </div>
              )}
              {detailEvent.type === 'pickup' && (
                <>
                  <div className="flex items-center gap-3 text-sm">
                    <Recycle className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-700">{detailEvent.bin_size}L bin · {WASTE_LABELS[detailEvent.waste_type] || detailEvent.waste_type}</span>
                  </div>
                  {detailEvent.driver_name && (
                    <div className="flex items-center gap-3 text-sm">
                      <Truck className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700">Driver: {detailEvent.driver_name}</span>
                    </div>
                  )}
                </>
              )}
              <div className="pt-1">
                <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full capitalize ${STATUS_STYLES[detailEvent.status] || 'bg-slate-100 text-slate-500'}`}>
                  {detailEvent.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setDetailEvent(null)}
                className="flex-1 py-3 text-slate-600 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
              >
                Close
              </button>
              {onNavigate && (
                <button
                  onClick={() => { setDetailEvent(null); onNavigate(detailEvent.type === 'booking' ? 'bookings' : 'subscriptions'); }}
                  className="flex-1 py-3 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-colors text-sm"
                >
                  View in {detailEvent.type === 'booking' ? 'Bookings' : 'Subscriptions'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
