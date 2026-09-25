import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Recycle, Calendar, Clock, MapPin, Loader2, AlertCircle,
  FileText, Trash2, Pause, Play, XCircle, CalendarClock,
  CheckCircle2, X, ChevronDown, Bell, Receipt, CreditCard, TrendingUp, Wallet,
  Package, Plus, Pencil, Leaf, HardHat, Zap, Phone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { startMonimePayment } from '../lib/monime';
import { Portal } from '../lib/portal';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { toast } from '../components/toast/toast';
import { PortalPage } from '../components/portal/PortalPage';
import { LocationAutocomplete } from '../components/LocationAutocomplete';
import { Field, inputClass, ErrorBanner } from '../components/service-form/ServiceFormKit';
import {
  applyFieldErrors, collectErrors, validateAddress, validatePhone, validateRequired,
} from '../lib/serviceFormValidation';

interface SmartSortSubscriptionsPageProps {
  onNavigate: (page: string) => void;
}

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

interface ClientInvoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  amount_sle: number;
  amount_paid_sle: number;
  status: string;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  auto_pay_attempted_at: string | null;
}

interface Plan {
  id: string;
  name: string;
  subtitle: string | null;
  price_sle: number;
  bin_size_liters: number;
  frequency: string;
}

const INVOICE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-blue-50 text-blue-700 border-blue-200',
  overdue: 'bg-red-50 text-red-600 border-red-200',
  void: 'bg-slate-100 text-slate-400 border-slate-200',
};

const WASTE_LABELS: Record<string, string> = {
  general: 'General Waste',
  recyclables: 'Recyclables',
  organic: 'Organic / Green',
  construction: 'Construction',
  ewaste: 'E-Waste',
  bulk: 'Bulk Items',
};

const WASTE_ICONS: Record<string, typeof Recycle> = {
  general: Trash2,
  recyclables: Recycle,
  organic: Leaf,
  construction: HardHat,
  ewaste: Zap,
  bulk: Package,
};

const FREQ_LABELS: Record<string, string> = {
  'one-time': 'One-Time', daily: 'Daily', 'twice-weekly': 'Twice Weekly',
  weekly: 'Weekly', 'bi-weekly': 'Bi-Weekly', 'three-weeks': 'Every 3 Weeks', monthly: 'Monthly',
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'Morning (7 AM – 11 AM)',
  afternoon: 'Afternoon (12 PM – 4 PM)',
  evening: 'Evening (5 PM – 6:30 PM)',
};

const SUB_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const PICKUP_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  assigned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
};

const ACTION_BTN =
  'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-sm font-medium rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50';

function formatDate(d: string): string {
  return new Date(d + (d.includes('T') ? '' : 'T12:00')).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function WasteGlyph({ type, className = 'w-5 h-5 text-emerald-600' }: { type: string; className?: string }) {
  const Icon = WASTE_ICONS[type] || Recycle;
  return <Icon className={className} aria-hidden="true" />;
}

type Tab = 'upcoming' | 'plan' | 'billing';

export function SmartSortSubscriptionsPage({ onNavigate }: SmartSortSubscriptionsPageProps) {
  const { wallet_enabled } = useFeatureFlags();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [reschedulePickup, setReschedulePickup] = useState<Pickup | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlot, setRescheduleSlot] = useState('morning');
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  const [pauseSub, setPauseSub] = useState<Subscription | null>(null);
  const [pauseUntil, setPauseUntil] = useState('');
  const [pauseBusy, setPauseBusy] = useState(false);

  const [planSub, setPlanSub] = useState<Subscription | null>(null);
  const [planBusy, setPlanBusy] = useState(false);

  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [editAddress, setEditAddress] = useState('');
  const [editLandmark, setEditLandmark] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSlot, setEditSlot] = useState('morning');
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    await supabase.rpc('generate_upcoming_pickups', { p_user_id: user.id });

    const [subsRes, pickupsRes, invRes, plansRes] = await Promise.all([
      supabase
        .from('smart_sort_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('smart_sort_pickups')
        .select('*, subscriptions:smart_sort_subscriptions(waste_type, address, bin_size_liters)')
        .eq('user_id', user.id)
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('smart_sort_invoices')
        .select('id, invoice_number, period_start, period_end, amount_sle, amount_paid_sle, status, due_date, paid_at, created_at, auto_pay_attempted_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('smart_sort_plans')
        .select('id, name, subtitle, price_sle, bin_size_liters, frequency')
        .eq('is_active', true)
        .order('sort_order'),
    ]);

    setSubscriptions((subsRes.data as Subscription[]) || []);
    setPickups((pickupsRes.data as Pickup[]) || []);
    setInvoices((invRes.data as ClientInvoice[]) || []);
    setPlans((plansRes.data as Plan[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const upcomingPickups = pickups.filter(p => ['scheduled', 'assigned', 'in_progress'].includes(p.status));
  const pastPickups = pickups.filter(p => ['completed', 'missed', 'cancelled'].includes(p.status));
  const activeSubs = subscriptions.filter(s => s.status === 'active');
  const unpaidInvoices = invoices.filter(i => i.status === 'pending' || i.status === 'partial' || i.status === 'overdue');
  const failedAutoPay = unpaidInvoices.filter(i => i.auto_pay_attempted_at);
  const totalOutstanding = unpaidInvoices.reduce((s, i) => s + (i.amount_sle - i.amount_paid_sle), 0);
  const totalMonthlyCost = activeSubs.reduce((s, sub) => s + (sub.plan_price_sle || 0), 0);

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
    const { error: err } = await supabase
      .from('smart_sort_pickups')
      .update({ scheduled_date: rescheduleDate, time_slot: rescheduleSlot })
      .eq('id', reschedulePickup.id);
    setRescheduleSubmitting(false);
    if (err) { setRescheduleError(err.message); return; }
    toast.success('Pickup rescheduled');
    setReschedulePickup(null);
    loadData();
  };

  const skipPickup = async (pickup: Pickup) => {
    if (!confirm(`Skip collection on ${formatDate(pickup.scheduled_date)}? The next cadence date will be added.`)) return;
    const { error: err } = await supabase.rpc('skip_smart_sort_pickup', { p_pickup_id: pickup.id });
    if (err) { toast.error(err.message); return; }
    toast.success('Pickup skipped — next collection is on the board');
    loadData();
  };

  const binFull = async (pickup: Pickup) => {
    if (!confirm('Request a priority collection because the bin is full?')) return;
    const { error: err } = await supabase
      .from('smart_sort_pickups')
      .update({ status: 'scheduled', notes: 'Bin full — priority collection requested' })
      .eq('id', pickup.id);
    if (err) { toast.error(err.message); return; }
    toast.success('Priority collection flagged');
    loadData();
  };

  const openPause = (sub: Subscription) => {
    setPauseSub(sub);
    setPauseUntil(isoDate(14));
  };

  const confirmPause = async () => {
    if (!pauseSub || !pauseUntil) return;
    setPauseBusy(true);
    const { error: err } = await supabase.rpc('pause_smart_sort_subscription', {
      p_subscription_id: pauseSub.id,
      p_paused_until: pauseUntil,
    });
    setPauseBusy(false);
    if (err) { toast.error(err.message); return; }
    toast.success(`Paused until ${formatDate(pauseUntil)}`);
    setPauseSub(null);
    loadData();
  };

  const resumeSub = async (sub: Subscription) => {
    const { error: err } = await supabase.rpc('resume_smart_sort_subscription', {
      p_subscription_id: sub.id,
    });
    if (err) { toast.error(err.message); return; }
    toast.success('Subscription resumed');
    loadData();
  };

  const changePlan = async (sub: Subscription, plan: Plan) => {
    setPlanBusy(true);
    const { error: err } = await supabase
      .from('smart_sort_subscriptions')
      .update({
        plan_name: plan.name,
        plan_price_sle: plan.price_sle,
        bin_size_liters: plan.bin_size_liters,
        frequency: plan.frequency,
      })
      .eq('id', sub.id);
    if (err) { setPlanBusy(false); toast.error(err.message); return; }
    const { error: refreshErr } = await supabase.rpc('refresh_smart_sort_schedule', {
      p_subscription_id: sub.id,
    });
    setPlanBusy(false);
    if (refreshErr) toast.error(refreshErr.message);
    else toast.success(`Plan updated to ${plan.name}`);
    setPlanSub(null);
    loadData();
  };

  const openEdit = (sub: Subscription) => {
    setEditSub(sub);
    setEditAddress(sub.address);
    setEditLandmark(sub.landmark || '');
    setEditPhone(sub.contact_phone);
    setEditSlot(sub.time_slot);
    setEditErrors({});
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editSub) return;
    const next = collectErrors({
      address: validateAddress(editAddress),
      phone: validatePhone(editPhone),
      slot: validateRequired(editSlot, 'Time slot'),
    });
    setEditErrors(next);
    if (!applyFieldErrors(next)) {
      setEditError('Please fix the highlighted fields before continuing.');
      return;
    }
    setEditBusy(true);
    setEditError('');
    const slotChanged = editSlot !== editSub.time_slot;
    const { error: err } = await supabase
      .from('smart_sort_subscriptions')
      .update({
        address: editAddress.trim(),
        landmark: editLandmark.trim() || null,
        contact_phone: editPhone.trim(),
        time_slot: editSlot,
      })
      .eq('id', editSub.id);
    if (err) { setEditBusy(false); setEditError(err.message); return; }
    if (slotChanged) {
      await supabase.rpc('refresh_smart_sort_schedule', { p_subscription_id: editSub.id });
    }
    setEditBusy(false);
    toast.success('Service details updated');
    setEditSub(null);
    loadData();
  };

  const toggleAutoPay = async (sub: Subscription) => {
    const newVal = !sub.auto_pay;
    setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, auto_pay: newVal } : s));
    const { error: err } = await supabase
      .from('smart_sort_subscriptions')
      .update({ auto_pay: newVal })
      .eq('id', sub.id);
    if (err) {
      setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, auto_pay: sub.auto_pay } : s));
      toast.error(err.message);
      return;
    }
    if (newVal) {
      await supabase.rpc('process_smart_sort_auto_pay_for_user');
      loadData();
    }
    toast.success(newVal ? 'Auto-pay on — unpaid invoices will charge your wallet.' : 'Auto-pay turned off.');
  };

  const cancelSubscription = async (sub: Subscription) => {
    if (!confirm('Cancel this subscription? Upcoming pickups will be removed.')) return;
    const { error: err } = await supabase
      .from('smart_sort_subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', sub.id);
    if (err) { toast.error(err.message); return; }
    toast.success('Subscription cancelled');
    loadData();
  };

  const handlePayInvoice = async (invoice: ClientInvoice) => {
    const balance = invoice.amount_sle - invoice.amount_paid_sle;
    setPayingInvoice(invoice.id);
    try {
      const result = await startMonimePayment(
        balance,
        'invoice',
        invoice.id,
        invoice.invoice_number,
        { nextPage: 'smart-sort-subs' },
      );
      if (result.redirected) return;
      toast.info('Complete payment in Monime. This page updates when the bank confirms.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to start payment.');
    } finally {
      setPayingInvoice(null);
    }
  };

  const handlePayInvoiceWallet = async (invoice: ClientInvoice) => {
    setPayingInvoice(invoice.id);
    try {
      const { data, error } = await supabase.rpc('pay_invoice_from_wallet', {
        p_invoice_id: invoice.id,
        p_source: 'smart_sort',
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Wallet payment failed');
      }
      toast.success('Invoice paid from your wallet.');
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Wallet payment failed.');
    } finally {
      setPayingInvoice(null);
    }
  };

  const tabConfig: { id: Tab; label: string; count?: number; urgent?: boolean }[] = [
    { id: 'upcoming', label: 'Upcoming', count: upcomingPickups.length },
    { id: 'plan', label: 'Plan', count: subscriptions.filter(s => s.status !== 'cancelled').length },
    { id: 'billing', label: 'Billing', count: unpaidInvoices.length, urgent: unpaidInvoices.length > 0 },
  ];

  return (
    <PortalPage
      title="My Subscriptions"
      subtitle="Manage Smart Sort collections, plan, and billing"
      onBack={() => onNavigate('bookings')}
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('account')}
            className={`${ACTION_BTN} bg-white border-slate-200 text-slate-700 hover:bg-slate-50`}
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            Monthly Impact PDF
          </button>
          <button
            type="button"
            onClick={() => onNavigate('services')}
            className={`${ACTION_BTN} bg-slate-800 border-slate-800 text-white hover:bg-slate-900`}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New plan
          </button>
        </div>
      }
    >
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 motion-safe:animate-[fadeInUp_0.35s_ease]">
          <StatCard icon={<Recycle className="w-4 h-4" />} label="Active Subs" value={activeSubs.length} color="emerald" />
          <StatCard icon={<CalendarClock className="w-4 h-4" />} label="Upcoming" value={upcomingPickups.length} color="blue" />
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Period cost" value={`SLE ${totalMonthlyCost.toLocaleString()}`} color="slate" />
          <StatCard icon={<Receipt className="w-4 h-4" />} label="Outstanding" value={`SLE ${totalOutstanding.toLocaleString()}`} color={totalOutstanding > 0 ? 'amber' : 'slate'} />
        </div>
      )}

      {unpaidInvoices.length > 0 && tab !== 'billing' && (
        <button
          type="button"
          onClick={() => setTab('billing')}
          className="w-full text-left rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 min-h-[44px] flex items-center justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <span className="text-sm font-medium text-amber-900">
            SLE {totalOutstanding.toLocaleString()} outstanding
            {failedAutoPay.length > 0 ? ' · auto-pay could not complete' : ''}
          </span>
          <span className="text-sm font-semibold text-amber-800">Open Billing</span>
        </button>
      )}

      <div
        className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-full sm:w-fit overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
        role="tablist"
        aria-label="Subscription sections"
      >
        {tabConfig.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[44px] px-4 sm:px-5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              tab === t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                tab === t.id ? 'bg-white/20' : t.urgent ? 'bg-red-100 text-red-600' : 'bg-slate-100'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48" aria-busy="true">
          <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
        </div>
      ) : tab === 'upcoming' ? (
        <div className="space-y-3">
          {upcomingPickups.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="w-6 h-6 text-slate-400" />}
              title="No upcoming pickups"
              subtitle="Subscribe to a Smart Sort plan to get scheduled collections automatically."
              actionLabel="Browse Plans"
              onAction={() => onNavigate('services')}
            />
          ) : (
            upcomingPickups.map((pickup) => (
              <div
                key={pickup.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <WasteGlyph type={pickup.subscriptions?.waste_type || 'general'} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 text-sm">
                          {WASTE_LABELS[pickup.subscriptions?.waste_type || ''] || 'Collection'}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {pickup.subscriptions?.bin_size_liters || 25}L bin
                        </p>
                      </div>
                      <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${PICKUP_STATUS_COLORS[pickup.status]}`}>
                        {pickup.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                        {formatDate(pickup.scheduled_date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        {SLOT_LABELS[pickup.time_slot]?.split(' (')[0] || pickup.time_slot}
                      </span>
                      {pickup.subscriptions?.address && (
                        <span className="inline-flex items-center gap-1.5 truncate max-w-[240px]">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                          {pickup.subscriptions.address}
                        </span>
                      )}
                    </div>
                    {pickup.driver_name && (
                      <p className="mt-1.5 text-xs text-indigo-600 inline-flex items-center gap-1.5">
                        <Bell className="w-3 h-3" aria-hidden="true" />
                        Driver assigned: {pickup.driver_name}
                      </p>
                    )}
                  </div>
                  {pickup.status === 'scheduled' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button type="button" onClick={() => openReschedule(pickup)} className={`${ACTION_BTN} text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100`}>
                        <CalendarClock className="w-4 h-4" aria-hidden="true" />
                        Reschedule
                      </button>
                      <button type="button" onClick={() => skipPickup(pickup)} className={`${ACTION_BTN} text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100`}>
                        <X className="w-4 h-4" aria-hidden="true" />
                        Skip
                      </button>
                      <button type="button" onClick={() => binFull(pickup)} className={`${ACTION_BTN} text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100`}>
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                        Bin Full
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {pastPickups.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Past pickups</p>
              <div className="space-y-2">
                {pastPickups.slice(0, 8).map(pickup => (
                  <div key={pickup.id} className="bg-white/60 rounded-lg border border-slate-100 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`w-2 h-2 rounded-full ${
                        pickup.status === 'completed' ? 'bg-emerald-500' :
                        pickup.status === 'missed' ? 'bg-red-500' : 'bg-slate-300'
                      }`} />
                      <span className="text-slate-600">{formatDate(pickup.scheduled_date)}</span>
                      <span className="text-slate-400 capitalize">{pickup.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : tab === 'billing' ? (
        <div className="space-y-4">
          {unpaidInvoices.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5">
              <p className="text-sm font-semibold text-amber-800">Outstanding balance</p>
              <p className="text-2xl font-bold text-amber-900">SLE {totalOutstanding.toLocaleString()}</p>
              {failedAutoPay.length > 0 && (
                <p className="mt-2 text-sm text-amber-800 inline-flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                  Auto-pay could not complete for {failedAutoPay.length} invoice{failedAutoPay.length === 1 ? '' : 's'}. Pay from wallet or Monime.
                </p>
              )}
              <button
                type="button"
                onClick={() => onNavigate('billing')}
                className="mt-3 text-sm font-medium text-amber-900 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
              >
                Also in Billing hub
              </button>
            </div>
          )}

          {invoices.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-6 h-6 text-slate-400" />}
              title="No invoices yet"
              subtitle="Your first period invoice appears as soon as you subscribe."
            />
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => {
                const balance = inv.amount_sle - inv.amount_paid_sle;
                const canPay = balance > 0 && inv.status !== 'void' && inv.status !== 'paid';
                const autoPayFailed = canPay && !!inv.auto_pay_attempted_at;
                return (
                  <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
                    <div className="flex flex-col gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-slate-500" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 text-sm">{inv.invoice_number}</p>
                            <p className="text-xs text-slate-400">
                              {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                            </p>
                          </div>
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${INVOICE_STATUS_COLORS[inv.status] || INVOICE_STATUS_COLORS.pending}`}>
                            {inv.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <span className="text-slate-500">Amount: <span className="font-semibold text-slate-800">SLE {inv.amount_sle.toLocaleString()}</span></span>
                          {inv.amount_paid_sle > 0 && (
                            <span className="text-emerald-600">Paid: <span className="font-semibold">SLE {inv.amount_paid_sle.toLocaleString()}</span></span>
                          )}
                          {balance > 0 && (
                            <span className="text-red-600">Balance: <span className="font-semibold">SLE {balance.toLocaleString()}</span></span>
                          )}
                          <span className="text-slate-400 text-xs">Due: {formatDate(inv.due_date)}</span>
                        </div>
                        {autoPayFailed && (
                          <p className="mt-2 text-xs text-amber-700 inline-flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            Wallet auto-pay failed — add funds or pay below.
                          </p>
                        )}
                      </div>
                      {canPay && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {wallet_enabled && (
                            <button
                              type="button"
                              onClick={() => handlePayInvoiceWallet(inv)}
                              disabled={payingInvoice === inv.id}
                              className={`${ACTION_BTN} bg-slate-800 border-slate-800 text-white hover:bg-slate-900`}
                            >
                              {payingInvoice === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                              Pay with wallet
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePayInvoice(inv)}
                            disabled={payingInvoice === inv.id}
                            className={`${ACTION_BTN} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700`}
                          >
                            {payingInvoice === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                            Pay with Monime
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.length === 0 ? (
            <EmptyState
              icon={<Recycle className="w-6 h-6 text-slate-400" />}
              title="No subscriptions yet"
              subtitle="Subscribe to a Smart Sort plan for regular scheduled waste collection."
              actionLabel="Browse Plans"
              onAction={() => onNavigate('services')}
            />
          ) : (
            subscriptions.map((sub) => (
              <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <WasteGlyph type={sub.waste_type} />
                  </div>
                  <div className="min-w-0 flex-1">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    {SLOT_LABELS[sub.time_slot]?.split(' (')[0] || sub.time_slot}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    {sub.address}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                    {sub.contact_phone}
                  </span>
                  {sub.plan_price_sle != null && (
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                      <Package className="w-3.5 h-3.5" aria-hidden="true" />
                      SLE {sub.plan_price_sle} / period
                    </span>
                  )}
                  {sub.paused_until && (
                    <span className="inline-flex items-center gap-1.5 text-amber-600">
                      <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                      Paused until {formatDate(sub.paused_until)}
                    </span>
                  )}
                </div>

                {sub.status !== 'cancelled' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {wallet_enabled && (
                      <button
                        type="button"
                        onClick={() => toggleAutoPay(sub)}
                        className={`${ACTION_BTN} ${
                          sub.auto_pay
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                            : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <Wallet className="w-4 h-4" aria-hidden="true" />
                        {sub.auto_pay ? 'Auto-pay on' : 'Auto-pay off'}
                      </button>
                    )}
                    <button type="button" onClick={() => setPlanSub(sub)} className={`${ACTION_BTN} text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100`}>
                      <CalendarClock className="w-4 h-4" aria-hidden="true" />
                      Change plan
                    </button>
                    <button type="button" onClick={() => openEdit(sub)} className={`${ACTION_BTN} text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100`}>
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                      Edit address
                    </button>
                    {sub.status === 'active' && (
                      <button type="button" onClick={() => openPause(sub)} className={`${ACTION_BTN} text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100`}>
                        <Pause className="w-4 h-4" aria-hidden="true" />
                        Pause
                      </button>
                    )}
                    {sub.status === 'paused' && (
                      <button type="button" onClick={() => resumeSub(sub)} className={`${ACTION_BTN} text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100`}>
                        <Play className="w-4 h-4" aria-hidden="true" />
                        Resume
                      </button>
                    )}
                    <button type="button" onClick={() => cancelSubscription(sub)} className={`${ACTION_BTN} text-red-600 bg-red-50 border-red-200 hover:bg-red-100`}>
                      <XCircle className="w-4 h-4" aria-hidden="true" />
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {reschedulePickup && (
        <Modal title="Reschedule pickup" onClose={() => setReschedulePickup(null)}>
          {rescheduleError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{rescheduleError}</div>}
          <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-3">
            Currently {formatDate(reschedulePickup.scheduled_date)} ({SLOT_LABELS[reschedulePickup.time_slot]?.split(' (')[0] || reschedulePickup.time_slot})
          </p>
          <Field label="New date" required>
            <input type="date" value={rescheduleDate} min={isoDate()} onChange={e => setRescheduleDate(e.target.value)} className={inputClass()} />
          </Field>
          <Field label="Time slot">
            <div className="relative">
              <select value={rescheduleSlot} onChange={e => setRescheduleSlot(e.target.value)} className={`${inputClass()} appearance-none`}>
                {Object.entries(SLOT_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </Field>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setReschedulePickup(null)} className={`${ACTION_BTN} flex-1 border-slate-200 text-slate-600`}>Cancel</button>
            <button type="button" onClick={confirmReschedule} disabled={rescheduleSubmitting} className={`${ACTION_BTN} flex-1 bg-emerald-600 border-emerald-600 text-white`}>
              {rescheduleSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirm
            </button>
          </div>
        </Modal>
      )}

      {pauseSub && (
        <Modal title="Pause collection" onClose={() => setPauseSub(null)}>
          <p className="text-sm text-slate-500">Pickups in the pause window are cancelled. Resume anytime, or we resume automatically after this date.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPauseUntil(isoDate(14))} className={`${ACTION_BTN} flex-1 ${pauseUntil === isoDate(14) ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200'}`}>2 weeks</button>
            <button type="button" onClick={() => setPauseUntil(isoDate(30))} className={`${ACTION_BTN} flex-1 ${pauseUntil === isoDate(30) ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200'}`}>1 month</button>
          </div>
          <Field label="Pause until" required>
            <input type="date" value={pauseUntil} min={isoDate()} onChange={e => setPauseUntil(e.target.value)} className={inputClass()} />
          </Field>
          <div className="flex gap-3">
            <button type="button" onClick={() => setPauseSub(null)} className={`${ACTION_BTN} flex-1 border-slate-200 text-slate-600`}>Cancel</button>
            <button type="button" onClick={confirmPause} disabled={pauseBusy || !pauseUntil} className={`${ACTION_BTN} flex-1 bg-amber-600 border-amber-600 text-white`}>
              {pauseBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
              Pause
            </button>
          </div>
        </Modal>
      )}

      {planSub && (
        <Modal title="Change plan" onClose={() => setPlanSub(null)}>
          {plans.length === 0 ? (
            <p className="text-sm text-slate-500">No catalog plans are available right now.</p>
          ) : (
            <div className="space-y-2">
              {plans.map(plan => (
                <button
                  key={plan.id}
                  type="button"
                  disabled={planBusy}
                  onClick={() => changePlan(planSub, plan)}
                  className="w-full min-h-[44px] text-left p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{plan.name}</p>
                      {plan.subtitle && <p className="text-xs text-teal-600">{plan.subtitle}</p>}
                      <p className="text-xs text-slate-500 mt-1">{plan.bin_size_liters}L · {FREQ_LABELS[plan.frequency] || plan.frequency}</p>
                    </div>
                    <p className="font-bold text-slate-900">SLE {plan.price_sle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {editSub && (
        <Modal title="Edit service details" onClose={() => setEditSub(null)}>
          <Field name="address" label="Street address" required error={editErrors.address}>
            <LocationAutocomplete
              value={editAddress}
              onChange={(v) => { setEditAddress(v); setEditErrors(p => ({ ...p, address: '' })); }}
              showLocate
              invalid={!!editErrors.address}
              inputClassName={`${inputClass(!!editErrors.address)} pl-9`}
            />
          </Field>
          <Field label="Landmark">
            <input type="text" value={editLandmark} onChange={e => setEditLandmark(e.target.value)} className={inputClass()} />
          </Field>
          <Field name="phone" label="Contact phone" required error={editErrors.phone}>
            <input type="tel" value={editPhone} onChange={e => { setEditPhone(e.target.value); setEditErrors(p => ({ ...p, phone: '' })); }} className={inputClass(!!editErrors.phone)} />
          </Field>
          <Field label="Time slot" required>
            <div className="space-y-2">
              {Object.entries(SLOT_LABELS).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEditSlot(id)}
                  className={`w-full min-h-[44px] flex items-center gap-3 px-4 rounded-xl border text-left ${
                    editSlot === id ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800' : 'border-slate-200'
                  }`}
                >
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </button>
              ))}
            </div>
          </Field>
          {editError && <ErrorBanner message={editError} />}
          <div className="flex gap-3">
            <button type="button" onClick={() => setEditSub(null)} className={`${ACTION_BTN} flex-1 border-slate-200 text-slate-600`}>Cancel</button>
            <button type="button" onClick={saveEdit} disabled={editBusy} className={`${ACTION_BTN} flex-1 bg-emerald-600 border-emerald-600 text-white`}>
              {editBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save
            </button>
          </div>
        </Modal>
      )}
    </PortalPage>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
        style={{ height: '100dvh' }}
        onClick={onClose}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-5 space-y-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-bold text-slate-900">{title}</h2>
            <button type="button" onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] rounded-lg hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Close">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

function StatCard({ icon, label, value, color }: { icon: ReactNode; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2.5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 truncate">{label}</p>
        <p className="text-sm font-bold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle, actionLabel, onAction }: { icon: ReactNode; title: string; subtitle: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-slate-500 text-sm">{subtitle}</p>
      {actionLabel && (
        <button type="button" onClick={onAction} className="mt-5 inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <Plus className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
