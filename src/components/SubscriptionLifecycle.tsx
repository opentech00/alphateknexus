import { Recycle, ChevronRight, Pause, MapPin, Clock } from 'lucide-react';

interface Subscription {
  id: string;
  waste_type: string;
  bin_size_liters: number;
  frequency: string;
  time_slot: string;
  address: string;
  plan_name: string | null;
  plan_price_sle: number | null;
  status: string;
  paused_until: string | null;
}

interface SubscriptionLifecycleProps {
  subscription: Subscription;
  onUpdated?: () => void;
  onNavigate: (page: string) => void;
}

const WASTE_LABELS: Record<string, string> = {
  general: 'General Waste', recyclables: 'Recyclables', organic: 'Organic / Green',
  construction: 'Construction', ewaste: 'E-Waste', bulk: 'Bulk Items',
};

const FREQ_LABELS: Record<string, string> = {
  'one-time': 'One-Time', daily: 'Daily', 'twice-weekly': 'Twice Weekly',
  weekly: 'Weekly', 'three-weeks': 'Every 3 Weeks', monthly: 'Monthly',
  'bi-weekly': 'Bi-Weekly',
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

const SUB_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function SubscriptionLifecycle({ subscription: sub, onNavigate }: SubscriptionLifecycleProps) {
  return (
    <button
      type="button"
      onClick={() => onNavigate('smart-sort-subs')}
      className="w-full text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="p-4 sm:p-5 flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <Recycle className="w-5 h-5 text-emerald-600" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-slate-900 truncate">
              {sub.plan_name || `${WASTE_LABELS[sub.waste_type] || 'Smart Sort'} Plan`}
            </h3>
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${SUB_STATUS_COLORS[sub.status]}`}>
              {sub.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 truncate">
            {WASTE_LABELS[sub.waste_type] || sub.waste_type} · {sub.bin_size_liters}L · {FREQ_LABELS[sub.frequency] || sub.frequency}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" />{SLOT_LABELS[sub.time_slot] || sub.time_slot}</span>
            <span className="inline-flex items-center gap-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" aria-hidden="true" />{sub.address}</span>
            {sub.paused_until && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <Pause className="w-3 h-3" aria-hidden="true" />
                Paused until {new Date(sub.paused_until + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 flex-shrink-0">
          Manage
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}
