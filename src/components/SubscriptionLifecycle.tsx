import { useEffect, useState } from 'react';
import { Recycle, ChevronRight, Pause, MapPin, Clock, Calendar, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
  nextPickup?: { scheduled_date: string; time_slot: string } | null;
  balanceSle?: number;
  paying?: boolean;
  onPay?: () => void;
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

function formatPickupDate(iso: string) {
  return new Date(iso + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function openSmartSortPage(onNavigate: (page: string) => void, tab?: 'billing' | 'upcoming' | 'plan') {
  if (tab) {
    try { sessionStorage.setItem('alphatek.smartSortTab', tab); } catch { /* ignore */ }
  }
  onNavigate('smart-sort-subs');
}

export function SubscriptionLifecycle({
  subscription: sub,
  onNavigate,
  nextPickup,
  balanceSle = 0,
  paying = false,
  onPay,
}: SubscriptionLifecycleProps) {
  return (
    <div className="w-full text-left bg-white rounded-xl border border-slate-200 overflow-hidden">
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
          <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-600">
            <Calendar className="w-3 h-3 text-slate-400" aria-hidden="true" />
            {nextPickup
              ? `Next collection ${formatPickupDate(nextPickup.scheduled_date)} · ${SLOT_LABELS[nextPickup.time_slot] || nextPickup.time_slot}`
              : 'No collection scheduled'}
          </p>
          {balanceSle > 0 && (
            <p className="mt-1 text-xs font-semibold text-amber-700">SLE {balanceSle.toLocaleString()} due</p>
          )}
        </div>
      </div>
      <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
        {balanceSle > 0 && onPay && (
          <button
            type="button"
            disabled={paying}
            onClick={onPay}
            className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            <CreditCard className="w-4 h-4" aria-hidden="true" />
            {paying ? 'Starting…' : 'Pay'}
          </button>
        )}
        <button
          type="button"
          onClick={() => openSmartSortPage(onNavigate)}
          className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-emerald-700"
        >
          Manage
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function SmartSortHomeCard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [card, setCard] = useState<{
    address: string;
    nextDate: string | null;
    slot: string | null;
    balance: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: subs } = await supabase
        .from('smart_sort_subscriptions')
        .select('id, address, status')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
      const sub = subs?.[0];
      if (!sub || cancelled) return;
      const [pickupsRes, invoicesRes] = await Promise.all([
        supabase
          .from('smart_sort_pickups')
          .select('scheduled_date, time_slot')
          .eq('subscription_id', sub.id)
          .gte('scheduled_date', today)
          .in('status', ['scheduled', 'assigned'])
          .order('scheduled_date', { ascending: true })
          .limit(1),
        supabase
          .from('smart_sort_invoices')
          .select('amount_sle, amount_paid_sle, status')
          .eq('subscription_id', sub.id)
          .in('status', ['pending', 'partial', 'overdue']),
      ]);
      if (cancelled) return;
      const pickup = pickupsRes.data?.[0];
      const balance = (invoicesRes.data || []).reduce(
        (sum, row) => sum + Math.max(0, Number(row.amount_sle) - Number(row.amount_paid_sle)),
        0,
      );
      setCard({
        address: sub.address,
        nextDate: pickup?.scheduled_date || null,
        slot: pickup?.time_slot || null,
        balance,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  if (!card) return null;

  return (
    <button
      type="button"
      onClick={() => openSmartSortPage(onNavigate, card.balance > 0 ? 'billing' : 'upcoming')}
      className="w-full rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Smart Sort</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">
        {card.nextDate
          ? `Next collection ${formatPickupDate(card.nextDate)}${card.slot ? ` · ${SLOT_LABELS[card.slot] || card.slot}` : ''}`
          : 'No collection scheduled'}
      </p>
      <p className="mt-1 truncate text-xs text-slate-500">{card.address}</p>
      {card.balance > 0 && (
        <p className="mt-2 text-xs font-semibold text-amber-700">SLE {card.balance.toLocaleString()} due · Open billing</p>
      )}
    </button>
  );
}
