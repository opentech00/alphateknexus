import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SchedulingCalendarProps {
  onSelectSlot?: (date: string, time: string) => void;
  serviceId?: string;
  mode?: 'view' | 'pick';
}

const TIME_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
];

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  // Convert Sunday=0 to Monday-based (Mon=0, Sun=6)
  return day === 0 ? 6 : day - 1;
}

function formatDate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function SchedulingCalendar({
  onSelectSlot,
  serviceId,
  mode = 'view',
}: SchedulingCalendarProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [bookings, setBookings] = useState<{ scheduled_date: string; scheduled_time: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = formatDate(currentYear, currentMonth, 1);
      const endDate = formatDate(
        currentYear,
        currentMonth,
        getDaysInMonth(currentYear, currentMonth)
      );

      let query = supabase
        .from('bookings')
        .select('scheduled_date, scheduled_time')
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate);

      if (serviceId) {
        query = query.eq('service_id', serviceId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching bookings:', error);
        setBookings([]);
      } else {
        setBookings(data || []);
      }
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth, serviceId]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setSelectedDate(null);
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const bookingDates = new Set(bookings.map((b) => b.scheduled_date));

  const getBookedTimesForDate = (date: string): Set<string> => {
    return new Set(
      bookings.filter((b) => b.scheduled_date === date).map((b) => b.scheduled_time)
    );
  };

  const isPastDate = (day: number): boolean => {
    const date = new Date(currentYear, currentMonth, day);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return date < todayMidnight;
  };

  const handleDateClick = (day: number) => {
    if (mode === 'pick' && !isPastDate(day)) {
      const date = formatDate(currentYear, currentMonth, day);
      setSelectedDate(date === selectedDate ? null : date);
    }
  };

  const handleSlotClick = (time: string) => {
    if (selectedDate && onSelectSlot) {
      onSelectSlot(selectedDate, time);
    }
  };

  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', {
    month: 'long',
  });

  const isToday = (day: number): boolean => {
    return (
      today.getFullYear() === currentYear &&
      today.getMonth() === currentMonth &&
      today.getDate() === day
    );
  };

  const renderCalendarGrid = () => {
    const cells: React.ReactNode[] = [];

    // Empty cells for days before the first day of month
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="h-10 sm:h-12" />);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const date = formatDate(currentYear, currentMonth, day);
      const hasBooking = bookingDates.has(date);
      const isSelected = selectedDate === date;
      const isTodayDate = isToday(day);

      cells.push(
        <button
          key={day}
          onClick={() => handleDateClick(day)}
          disabled={mode === 'view' || isPastDate(day)}
          className={`
            relative flex flex-col items-center justify-center
            h-10 sm:h-12 rounded-lg text-sm font-medium
            transition-all duration-200 ease-in-out
            ${
              isSelected
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                : isTodayDate
                ? 'bg-slate-100 text-slate-900 ring-1 ring-emerald-300'
                : 'text-slate-700 hover:bg-slate-50'
            }
            ${mode === 'pick' ? 'cursor-pointer hover:scale-105' : 'cursor-default'}
          `}
        >
          <span>{day}</span>
          {hasBooking && (
            <span
              className={`
                absolute bottom-1 w-1.5 h-1.5 rounded-full
                ${isSelected ? 'bg-white' : 'bg-teal-400'}
              `}
            />
          )}
        </button>
      );
    }

    return cells;
  };

  const renderTimeSlots = () => {
    if (!selectedDate) return null;

    const bookedTimes = getBookedTimesForDate(selectedDate);

    return (
      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-teal-500" />
          <h3 className="text-sm font-semibold text-slate-700">
            Available times for{' '}
            <span className="text-emerald-600">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('default', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </h3>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {TIME_SLOTS.map((time) => {
            const isBooked = bookedTimes.has(time);

            return (
              <button
                key={time}
                onClick={() => !isBooked && handleSlotClick(time)}
                disabled={isBooked}
                className={`
                  px-3 py-2 rounded-lg text-sm font-medium
                  transition-all duration-150 ease-in-out
                  ${
                    isBooked
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed line-through'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-sm cursor-pointer active:scale-95'
                  }
                `}
              >
                {time}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-teal-500" />
          <h2 className="text-lg font-bold text-slate-800">
            {monthName} {currentYear}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPreviousMonth}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {loading ? (
          <div className="col-span-7 flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : (
          renderCalendarGrid()
        )}
      </div>

      {/* Time slots (pick mode only) */}
      {mode === 'pick' && renderTimeSlots()}

      {/* Legend */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-teal-400" />
          <span>Has bookings</span>
        </div>
        {mode === 'pick' && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Selected</span>
          </div>
        )}
      </div>
    </div>
  );
}
