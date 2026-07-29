import { UnifiedCalendar } from '../components/UnifiedCalendar';

interface CalendarPageProps {
  onNavigate?: (page: string) => void;
}

export function CalendarPage({ onNavigate }: CalendarPageProps) {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Scheduling Calendar</h1>
        <p className="mt-0.5 text-slate-400 text-sm">All your bookings and subscription pickups in one view</p>
      </div>
      <UnifiedCalendar onNavigate={onNavigate} />
    </div>
  );
}
