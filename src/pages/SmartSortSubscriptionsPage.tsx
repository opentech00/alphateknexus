import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Recycle, Calendar, Clock, MapPin, Loader2, AlertCircle,
  ChevronRight, FileText, Trash2, Pause, Play, XCircle, CalendarClock,
  CheckCircle2, X, ChevronDown, Bell, Receipt, CreditCard,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createMonimeCheckout, pollPaymentStatus } from '../lib/monime';

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
  smart_sort_subscriptions: { plan_name: string | null } | null;
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

const FREQ_LABELS: Record<string, string> = {
  'one-time': 'One-Time',
  daily: 'Daily',
  'twice-weekly': 'Twice Weekly',
  weekly: 'Weekly',
  'three-weeks': 'Every 3 Weeks',
  monthly: 'Monthly',
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'Morning (7 AM – 11 AM)',
  afternoon: 'Afternoon (12 PM – 4 PM)',
  evening: 'Evening (5 PM – 6:30 PM)',
};

const PICKUP_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  assigned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
};

const SUB_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Tab = 'pickups' | 'subscriptions' | 'billing';

export function SmartSortSubscriptionsPage({ onNavigate }: SmartSortSubscriptionsPageProps) {
  const [tab, setTab] = useState<Tab>('pickups');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [animateIn, setAnimateIn] = useState(false);

  // Reschedule modal
  const [reschedulePickup, setReschedulePickup] = useState<Pickup | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlot, setRescheduleSlot] = useState('morning');
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  // Action feedback
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Auto-generate upcoming pickups from active subscriptions
    await supabase.rpc('generate_upcoming_pickups', { p_user_id: user.id });

    const [subsRes, pickupsRes, invRes] = await Promise.all([
      supabase
        .from('smart_sort_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('smart_sort_pickups')
        .select('*, subscriptions:smart_sort_subscriptions(waste_type, address, bin_size_liters)')
        .eq('user_id', user.id)
        .order('scheduled_date', { ascending: true })
        .limit(50),
      supabase
        .from('smart_sort_invoices')
        .select('*, smart_sort_subscriptions(plan_name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ]);

    setSubscriptions((subsRes.data as Subscription[]) || []);
    setPickups((pickupsRes.data as Pickup[]) || []);
    setInvoices((invRes.data as ClientInvoice[]) || []);
    setLoading(false);
    setTimeout(() => setAnimateIn(true), 50);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-dismiss action message
  useEffect(() => {
    if (!actionMsg) return;
    const t = setTimeout(() => setActionMsg(null), 3500);
    return () => clearTimeout(t);
  }, [actionMsg]);

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
    setActionMsg({ type: 'success', text: 'Pickup rescheduled successfully' });
    setReschedulePickup(null);
    loadData();
  };

  const skipPickup = async (pickup: Pickup) => {
    const { error: err } = await supabase
      .from('smart_sort_pickups')
      .update({ status: 'cancelled' })
      .eq('id', pickup.id);
    if (err) { setActionMsg({ type: 'error', text: err.message }); return; }
    setActionMsg({ type: 'success', text: 'Pickup skipped' });
    loadData();
  };

  const binFull = async (pickup: Pickup) => {
    const { error: err } = await supabase
      .from('smart_sort_pickups')
      .update({ status: 'scheduled', notes: 'Bin full — priority collection requested' })
      .eq('id', pickup.id);
    if (err) { setActionMsg({ type: 'error', text: err.message }); return; }
    setActionMsg({ type: 'success', text: 'Priority collection flagged — driver will be notified' });
    loadData();
  };

  const toggleSubscriptionStatus = async (sub: Subscription) => {
    if (sub.status === 'active') {
      const pausedUntil = new Date();
      pausedUntil.setDate(pausedUntil.getDate() + 30);
      const { error: err } = await supabase
        .from('smart_sort_subscriptions')
        .update({ status: 'paused', paused_until: pausedUntil.toISOString().split('T')[0] })
        .eq('id', sub.id);
      if (err) { setActionMsg({ type: 'error', text: err.message }); return; }
      setActionMsg({ type: 'success', text: 'Subscription paused for 30 days' });
    } else if (sub.status === 'paused') {
      const { error: err } = await supabase
        .from('smart_sort_subscriptions')
        .update({ status: 'active', paused_until: null })
        .eq('id', sub.id);
      if (err) { setActionMsg({ type: 'error', text: err.message }); return; }
      setActionMsg({ type: 'success', text: 'Subscription resumed' });
    }
    loadData();
  };

  const cancelSubscription = async (sub: Subscription) => {
    if (!confirm('Cancel this subscription? This cannot be undone.')) return;
    const { error: err } = await supabase
      .from('smart_sort_subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', sub.id);
    if (err) { setActionMsg({ type: 'error', text: err.message }); return; }
    setActionMsg({ type: 'success', text: 'Subscription cancelled' });
    loadData();
  };

  const upcomingPickups = pickups.filter(p =>
    ['scheduled', 'assigned', 'in_progress'].includes(p.status)
  );
  const pastPickups = pickups.filter(p =>
    ['completed', 'missed', 'cancelled'].includes(p.status)
  );

  const activeSubs = subscriptions.filter(s => s.status === 'active');
  const pausedSubs = subscriptions.filter(s => s.status === 'paused');
  const cancelledSubs = subscriptions.filter(s => s.status === 'cancelled');

  const unpaidInvoices = invoices.filter(i => i.status === 'pending' || i.status === 'partial' || i.status === 'overdue');
  const totalOutstanding = unpaidInvoices.reduce((s, i) => s + (i.amount_sle - i.amount_paid_sle), 0);

  const handlePayInvoice = async (invoice: ClientInvoice) => {
    const balance = invoice.amount_sle - invoice.amount_paid_sle;
    setPayingInvoice(invoice.id);
    try {
      const result = await createMonimeCheckout(balance, 'invoice', invoice.id, invoice.invoice_number);
      const popup = window.open(result.checkoutUrl, '_blank', 'width=500,height=700,scrollbars=yes');
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      setActionMsg({ type: 'success', text: 'Complete your payment in the Monime window. We\'ll update your invoice automatically once confirmed.' });
      const pollResult = await pollPaymentStatus(result.reference);
      if (pollResult.status === 'completed') {
        setActionMsg({ type: 'success', text: 'Payment confirmed! Invoice updated.' });
        loadData();
      } else if (pollResult.status === 'failed' || pollResult.status === 'cancelled') {
        setActionMsg({ type: 'error', text: 'Payment was not completed.' });
      } else {
        setActionMsg({ type: 'error', text: 'Payment is still pending. Please check again later.' });
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || 'Failed to start payment. Please try again.' });
    } finally {
      setPayingInvoice(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Back button */}
      <button
        onClick={() => onNavigate('bookings')}
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Bookings
      </button>

      {/* Header */}
      <div className={`flex items-center justify-between gap-4 transition-all duration-500 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Subscriptions</h1>
          <p className="mt-0.5 text-slate-400 text-sm">Manage your Smart Sort recurring collections</p>
        </div>
        <button
          onClick={() => onNavigate('account')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap"
        >
          <FileText className="w-4 h-4" />
          Monthly Impact PDF
        </button>
      </div>

      {/* Action message toast */}
      {actionMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
          actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {actionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* Tabs */}
      <div className={`flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit transition-all duration-500 delay-75 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <button
          onClick={() => setTab('pickups')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'pickups' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Upcoming Pickups
          {upcomingPickups.length > 0 && (
            <span className={`ml-2 px-1.5 py-0.5 text-[10px] rounded-full ${tab === 'pickups' ? 'bg-white/20' : 'bg-slate-100'}`}>
              {upcomingPickups.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('subscriptions')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'subscriptions' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          My Subscriptions
          {subscriptions.filter(s => s.status !== 'cancelled').length > 0 && (
            <span className={`ml-2 px-1.5 py-0.5 text-[10px] rounded-full ${tab === 'subscriptions' ? 'bg-white/20' : 'bg-slate-100'}`}>
              {subscriptions.filter(s => s.status !== 'cancelled').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('billing')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'billing' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Billing
          {unpaidInvoices.length > 0 && (
            <span className={`ml-2 px-1.5 py-0.5 text-[10px] rounded-full ${tab === 'billing' ? 'bg-white/20' : 'bg-red-100 text-red-600'}`}>
              {unpaidInvoices.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
        </div>
      ) : tab === 'pickups' ? (
        /* ── Upcoming Pickups Tab ── */
        <div className="space-y-3">
          {upcomingPickups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
                <CalendarClock className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">No upcoming pickups</h3>
              <p className="mt-2 text-slate-500 text-sm">
                Subscribe to a Smart Sort plan to get scheduled pickups automatically.
              </p>
              <button
                onClick={() => onNavigate('services')}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-colors text-sm"
              >
                <Recycle className="w-4 h-4" />
                Browse Plans
              </button>
            </div>
          ) : (
            upcomingPickups.map((pickup, index) => (
              <div
                key={pickup.id}
                className={`bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all duration-500 ${
                  animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: `${100 + index * 50}ms` }}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Recycle className="w-4.5 h-4.5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm">
                          {WASTE_LABELS[pickup.subscriptions?.waste_type || pickup.time_slot] || 'Collection'}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {pickup.subscriptions?.bin_size_liters || 25}L bin
                        </p>
                      </div>
                      <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${PICKUP_STATUS_COLORS[pickup.status]}`}>
                        {pickup.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 ml-12">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(pickup.scheduled_date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {SLOT_LABELS[pickup.time_slot]?.split(' (')[0] || pickup.time_slot}
                      </span>
                      {pickup.subscriptions?.address && (
                        <span className="inline-flex items-center gap-1.5 truncate max-w-[200px]">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          {pickup.subscriptions.address}
                        </span>
                      )}
                    </div>
                    {pickup.driver_name && (
                      <p className="ml-12 mt-1.5 text-xs text-indigo-600 inline-flex items-center gap-1.5">
                        <Bell className="w-3 h-3" />
                        Driver assigned: {pickup.driver_name}
                      </p>
                    )}
                  </div>
                  {/* Actions */}
                  {pickup.status === 'scheduled' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => openReschedule(pickup)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        Reschedule
                      </button>
                      <button
                        onClick={() => skipPickup(pickup)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Skip
                      </button>
                      <button
                        onClick={() => binFull(pickup)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Bin Full
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Past pickups summary */}
          {pastPickups.length > 0 && (
            <div className="pt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Past Pickups</p>
              <div className="space-y-2">
                {pastPickups.slice(0, 5).map(pickup => (
                  <div key={pickup.id} className="bg-white/60 rounded-lg border border-slate-100 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`w-2 h-2 rounded-full ${
                        pickup.status === 'completed' ? 'bg-emerald-500' :
                        pickup.status === 'missed' ? 'bg-red-500' : 'bg-slate-300'
                      }`} />
                      <span className="text-slate-600">{formatDate(pickup.scheduled_date)}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-400 capitalize">{pickup.status}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : tab === 'billing' ? (
        /* ── Billing Tab ── */
        <div className="space-y-4">
          {unpaidInvoices.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Outstanding Balance</p>
                  <p className="text-2xl font-bold text-amber-900">SLE {totalOutstanding.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          {invoices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
                <Receipt className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">No invoices yet</h3>
              <p className="mt-2 text-slate-500 text-sm">
                Your Smart Sort invoices will appear here when they are generated.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv, index) => {
                const balance = inv.amount_sle - inv.amount_paid_sle;
                const canPay = balance > 0 && inv.status !== 'void' && inv.status !== 'paid';
                return (
                  <div
                    key={inv.id}
                    className={`bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all duration-500 ${
                      animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    }`}
                    style={{ transitionDelay: `${100 + index * 50}ms` }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-slate-500" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 text-sm">{inv.invoice_number}</p>
                            <p className="text-xs text-slate-400">
                              {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                            </p>
                          </div>
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${INVOICE_STATUS_COLORS[inv.status] || INVOICE_STATUS_COLORS.pending}`}>
                            {inv.status}
                          </span>
                        </div>
                        <div className="ml-12 flex flex-wrap gap-4 text-sm">
                          <span className="text-slate-500">Amount: <span className="font-semibold text-slate-800">SLE {inv.amount_sle.toLocaleString()}</span></span>
                          {inv.amount_paid_sle > 0 && (
                            <span className="text-emerald-600">Paid: <span className="font-semibold">SLE {inv.amount_paid_sle.toLocaleString()}</span></span>
                          )}
                          {balance > 0 && (
                            <span className="text-red-600">Balance: <span className="font-semibold">SLE {balance.toLocaleString()}</span></span>
                          )}
                          <span className="text-slate-400 text-xs">Due: {formatDate(inv.due_date)}</span>
                        </div>
                      </div>
                      {canPay && (
                        <button
                          onClick={() => handlePayInvoice(inv)}
                          disabled={payingInvoice === inv.id}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 text-sm flex-shrink-0"
                        >
                          {payingInvoice === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                          {payingInvoice === inv.id ? 'Redirecting…' : 'Pay Now'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── My Subscriptions Tab ── */
        <div className="space-y-3">
          {subscriptions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
                <Recycle className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">No subscriptions yet</h3>
              <p className="mt-2 text-slate-500 text-sm">
                Subscribe to a Smart Sort plan for regular scheduled waste collection.
              </p>
              <button
                onClick={() => onNavigate('services')}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-colors text-sm"
              >
                <Recycle className="w-4 h-4" />
                Browse Plans
              </button>
            </div>
          ) : (
            subscriptions.map((sub, index) => (
              <div
                key={sub.id}
                className={`bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all duration-500 ${
                  animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: `${100 + index * 50}ms` }}
              >
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
                          SLE {sub.plan_price_sle} / period
                        </span>
                      )}
                      {sub.paused_until && (
                        <span className="inline-flex items-center gap-1.5 text-amber-600">
                          <Pause className="w-3.5 h-3.5" />
                          Paused until {formatTime(sub.paused_until)}
                        </span>
                      )}
                    </div>

                    {sub.special_instructions && (
                      <p className="ml-13 mt-2 text-xs text-slate-400 italic">"{sub.special_instructions}"</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {sub.status === 'active' && (
                      <button
                        onClick={() => toggleSubscriptionStatus(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    )}
                    {sub.status === 'paused' && (
                      <button
                        onClick={() => toggleSubscriptionStatus(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Resume
                      </button>
                    )}
                    {sub.status !== 'cancelled' && (
                      <button
                        onClick={() => cancelSubscription(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 border border-red-200 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
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
                Currently scheduled for <span className="font-medium text-slate-700">{formatDate(reschedulePickup.scheduled_date)}</span>
                {' '}({SLOT_LABELS[reschedulePickup.time_slot]?.split(' (')[0] || reschedulePickup.time_slot})
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">New Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setRescheduleDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Time Slot</label>
                <div className="relative">
                  <select
                    value={rescheduleSlot}
                    onChange={e => setRescheduleSlot(e.target.value)}
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
