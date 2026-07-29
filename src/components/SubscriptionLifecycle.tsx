import { useState, useCallback, useEffect } from 'react';
import {
  Recycle, Pause, Play, XCircle, Loader2, CheckCircle2, AlertCircle,
  Calendar, Clock, MapPin, ChevronDown, CalendarClock, X, Trash2, Bell,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Subscription {
  id: string;
  waste_type: string;
  bin_size_liters: number;
  frequency: string;
  time_slot: string;
  address: string;
  landmark: string | null;
  contact_phone: string;
  special_instructions: string | null;
  plan_name: string | null;
  plan_price_sle: number | null;
  status: string;
  auto_pay: boolean;
  paused_until: string | null;
  created_at: string;
}

interface Plan {
  id: string;
  name: string;
  price_sle: number;
  bin_size_liters: number;
  frequency: string;
}

interface Pickup {
  id: string;
  subscription_id: string;
  scheduled_date: string;
  time_slot: string;
  status: string;
  driver_name: string | null;
  notes: string | null;
  subscriptions: { waste_type: string; address: string; bin_size_liters: number } | null;
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
  morning: 'Morning (7 AM – 11 AM)',
  afternoon: 'Afternoon (12 PM – 4 PM)',
  evening: 'Evening (5 PM – 6:30 PM)',
};

const SUB_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const PICKUP_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  assigned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

interface SubscriptionLifecycleProps {
  subscription: Subscription;
  onUpdated: () => void;
  onNavigate: (page: string) => void;
}

export function SubscriptionLifecycle({ subscription: sub, onUpdated, onNavigate }: SubscriptionLifecycleProps) {
  const [expanded, setExpanded] = useState(false);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [pickupsLoading, setPickupsLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Change plan modal
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planSubmitting, setPlanSubmitting] = useState(false);

  // Reschedule modal
  const [reschedulePickup, setReschedulePickup] = useState<Pickup | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlot, setRescheduleSlot] = useState('morning');
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  useEffect(() => {
    if (!actionMsg) return;
    const t = setTimeout(() => setActionMsg(null), 3500);
    return () => clearTimeout(t);
  }, [actionMsg]);

  const fetchPickups = useCallback(async () => {
    setPickupsLoading(true);
    const { data } = await supabase
      .from('smart_sort_pickups')
      .select('*, subscriptions:smart_sort_subscriptions(waste_type, address, bin_size_liters)')
      .eq('subscription_id', sub.id)
      .order('scheduled_date', { ascending: true })
      .limit(20);
    setPickups((data as Pickup[]) || []);
    setPickupsLoading(false);
  }, [sub.id]);

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase
      .from('smart_sort_plans')
      .select('id, name, price_sle, bin_size_liters, frequency')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setPlans((data as Plan[]) || []);
  }, []);

  const toggleExpand = () => {
    if (!expanded) {
      fetchPickups();
    }
    setExpanded(!expanded);
  };

  const toggleStatus = async () => {
    setBusy(true);
    if (sub.status === 'active') {
      const pausedUntil = new Date();
      pausedUntil.setDate(pausedUntil.getDate() + 30);
      const { error } = await supabase
        .from('smart_sort_subscriptions')
        .update({ status: 'paused', paused_until: pausedUntil.toISOString().split('T')[0] })
        .eq('id', sub.id);
      if (error) { setActionMsg({ type: 'error', text: error.message }); setBusy(false); return; }
      setActionMsg({ type: 'success', text: 'Subscription paused for 30 days' });
    } else if (sub.status === 'paused') {
      const { error } = await supabase
        .from('smart_sort_subscriptions')
        .update({ status: 'active', paused_until: null })
        .eq('id', sub.id);
      if (error) { setActionMsg({ type: 'error', text: error.message }); setBusy(false); return; }
      setActionMsg({ type: 'success', text: 'Subscription resumed' });
    }
    setBusy(false);
    onUpdated();
  };

  const cancelSubscription = async () => {
    if (!confirm('Cancel this subscription? This cannot be undone.')) return;
    setBusy(true);
    const { error } = await supabase
      .from('smart_sort_subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', sub.id);
    if (error) { setActionMsg({ type: 'error', text: error.message }); setBusy(false); return; }
    setActionMsg({ type: 'success', text: 'Subscription cancelled' });
    setBusy(false);
    onUpdated();
  };

  const openPlanModal = () => {
    fetchPlans();
    setShowPlanModal(true);
  };

  const confirmChangePlan = async () => {
    if (!selectedPlanId) return;
    const plan = plans.find((p) => p.id === selectedPlanId);
    if (!plan) return;
    setPlanSubmitting(true);
    const { error } = await supabase
      .from('smart_sort_subscriptions')
      .update({
        plan_name: plan.name,
        plan_price_sle: plan.price_sle,
        bin_size_liters: plan.bin_size_liters,
        frequency: plan.frequency,
      })
      .eq('id', sub.id);
    setPlanSubmitting(false);
    if (error) { setActionMsg({ type: 'error', text: error.message }); return; }
    setActionMsg({ type: 'success', text: `Plan changed to ${plan.name}` });
    setShowPlanModal(false);
    onUpdated();
  };

  const skipPickup = async (pickup: Pickup) => {
    const { error } = await supabase
      .from('smart_sort_pickups')
      .update({ status: 'cancelled' })
      .eq('id', pickup.id);
    if (error) { setActionMsg({ type: 'error', text: error.message }); return; }
    setActionMsg({ type: 'success', text: 'Pickup skipped' });
    fetchPickups();
  };

  const binFull = async (pickup: Pickup) => {
    const { error } = await supabase
      .from('smart_sort_pickups')
      .update({ status: 'scheduled', notes: 'Bin full — priority collection requested' })
      .eq('id', pickup.id);
    if (error) { setActionMsg({ type: 'error', text: error.message }); return; }
    setActionMsg({ type: 'success', text: 'Priority collection flagged' });
    fetchPickups();
  };

  const openReschedule = (pickup: Pickup) => {
    setReschedulePickup(pickup);
    setRescheduleDate(pickup.scheduled_date);
    setRescheduleSlot(pickup.time_slot || 'morning');
    setRescheduleError('');
  };

  const confirmReschedule = async () => {
    if (!reschedulePickup) return;
    if (!rescheduleDate) { setRescheduleError('Please select a date'); return; }
    setRescheduleSubmitting(true);
    setRescheduleError('');
    const { error } = await supabase
      .from('smart_sort_pickups')
      .update({ scheduled_date: rescheduleDate, time_slot: rescheduleSlot })
      .eq('id', reschedulePickup.id);
    setRescheduleSubmitting(false);
    if (error) { setRescheduleError(error.message); return; }
    setActionMsg({ type: 'success', text: 'Pickup rescheduled' });
    setReschedulePickup(null);
    fetchPickups();
  };

  const upcomingPickups = pickups.filter((p) => ['scheduled', 'assigned', 'in_progress'].includes(p.status));

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-all duration-300">
      {/* Main row */}
      <div className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Recycle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">
                  {sub.plan_name || `${WASTE_LABELS[sub.waste_type] || 'Smart Sort'} Plan`}
                </h3>
                <p className="text-xs text-slate-400">
                  {WASTE_LABELS[sub.waste_type] || sub.waste_type} · {sub.bin_size_liters}L bin · {FREQ_LABELS[sub.frequency] || sub.frequency}
                </p>
              </div>
              <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${SUB_STATUS_COLORS[sub.status]}`}>
                {sub.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-500 ml-13">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {SLOT_LABELS[sub.time_slot]?.split(' (')[0] || sub.time_slot}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {sub.address}
              </span>
              {sub.plan_price_sle != null && (
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  Le {sub.plan_price_sle} / period
                </span>
              )}
              {sub.paused_until && (
                <span className="inline-flex items-center gap-1.5 text-amber-600">
                  <Pause className="w-3.5 h-3.5" />
                  Paused until {formatDate(sub.paused_until)}
                </span>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {sub.status === 'active' && (
              <button
                onClick={toggleStatus}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                Pause
              </button>
            )}
            {sub.status === 'paused' && (
              <button
                onClick={toggleStatus}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Resume
              </button>
            )}
            {sub.status !== 'cancelled' && (
              <>
                <button
                  onClick={openPlanModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Change Plan
                </button>
                <button
                  onClick={cancelSubscription}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  Cancel
                </button>
              </>
            )}
            <button
              onClick={toggleExpand}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
            >
              {expanded ? 'Hide' : 'Pickups'}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Action message */}
        {actionMsg && (
          <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
            actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {actionMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {actionMsg.text}
          </div>
        )}
      </div>

      {/* Expanded: pickups list */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Upcoming Pickups</p>
              <button
                onClick={() => onNavigate('subscriptions')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Manage all
              </button>
            </div>

            {pickupsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
              </div>
            ) : upcomingPickups.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No upcoming pickups scheduled</p>
            ) : (
              <div className="space-y-2">
                {upcomingPickups.map((pickup) => (
                  <div key={pickup.id} className="bg-white rounded-lg border border-slate-100 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`w-2 h-2 rounded-full ${pickup.status === 'in_progress' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                      <span className="text-slate-700 font-medium">{formatDate(pickup.scheduled_date)}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{SLOT_LABELS[pickup.time_slot]?.split(' (')[0] || pickup.time_slot}</span>
                      <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full border capitalize ${PICKUP_STATUS_COLORS[pickup.status]}`}>
                        {pickup.status.replace(/_/g, ' ')}
                      </span>
                      {pickup.driver_name && (
                        <span className="inline-flex items-center gap-1 text-xs text-indigo-600">
                          <Bell className="w-3 h-3" />
                          {pickup.driver_name}
                        </span>
                      )}
                    </div>
                    {pickup.status === 'scheduled' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openReschedule(pickup)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-50 rounded-md hover:bg-slate-100 transition-colors"
                        >
                          <CalendarClock className="w-3 h-3" />
                          Reschedule
                        </button>
                        <button
                          onClick={() => skipPickup(pickup)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Skip
                        </button>
                        <button
                          onClick={() => binFull(pickup)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Bin Full
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPlanModal(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Change Plan</h2>
              </div>
              <button onClick={() => setShowPlanModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-3">
              <p className="text-sm text-slate-500">Select a new plan. Your bin size, frequency, and price will update accordingly.</p>
              {plans.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                </div>
              ) : (
                plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedPlanId === plan.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{plan.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {plan.bin_size_liters}L bin · {FREQ_LABELS[plan.frequency] || plan.frequency}
                        </p>
                      </div>
                      <p className="font-bold text-slate-900">Le {plan.price_sle}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowPlanModal(false)}
                className="flex-1 py-3 text-slate-600 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmChangePlan}
                disabled={!selectedPlanId || planSubmitting}
                className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {planSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulePickup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Reschedule Pickup</h2>
              </div>
              <button onClick={() => setReschedulePickup(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {rescheduleError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{rescheduleError}</div>
              )}
              <div className="text-sm text-slate-500 bg-slate-50 rounded-xl p-3">
                Currently: <span className="font-medium text-slate-700">{formatDate(reschedulePickup.scheduled_date)}</span>
                {' '}({SLOT_LABELS[reschedulePickup.time_slot]?.split(' (')[0] || reschedulePickup.time_slot})
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">New Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Time Slot</label>
                <div className="relative">
                  <select
                    value={rescheduleSlot}
                    onChange={(e) => setRescheduleSlot(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white appearance-none focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {Object.entries(SLOT_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setReschedulePickup(null)}
                className="flex-1 py-3 text-slate-600 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmReschedule}
                disabled={rescheduleSubmitting}
                className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {rescheduleSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
