import { useState, useEffect } from 'react';
import {
  ArrowLeft, Recycle, FileText, MapPin, Wallet, Plus, X,
  Pause, Trash2, Zap, Package, Leaf, HardHat, CalendarCheck,
  AlertTriangle, CreditCard, ChevronDown, CheckCircle2, Crosshair, Clock,
  Pencil, Receipt, TrendingUp, History,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SmartSortImpactDashboard } from './SmartSortImpactDashboard';

interface Service {
  id: string; name: string; slug: string; description: string; icon: string; price_range: string;
}

interface SmartSortSubscribeFormProps {
  service: Service;
  onCancel: () => void;
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
  plan_name: string | null;
  plan_price_sle: number | null;
  status: string;
  auto_pay: boolean;
  paused_until: string | null;
  created_at: string;
}

interface UpcomingPickup {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  details: {
    waste_type?: string;
    bin_size_liters?: number;
  } | null;
  status: string;
}

interface PickupHistoryItem {
  id: string;
  scheduled_date: string;
  time_slot: string;
  status: string;
  driver_name: string | null;
  waste_kg: number | null;
  diverted_kg: number | null;
  completed_at: string | null;
  smart_sort_subscriptions: { waste_type: string; bin_size_liters: number } | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  amount_sle: number;
  amount_paid_sle: number;
  status: string;
  due_date: string;
  paid_at: string | null;
}

interface Plan {
  id: string;
  name: string;
  subtitle: string | null;
  price_sle: number;
  bin_size_liters: number;
  frequency: string;
  features: string[] | null;
  is_active: boolean;
  sort_order: number;
}

const FALLBACK_PLANS = [
  { id: 'basic', name: 'Basic weekly', subtitle: 'Basic weekly offer', price_sle: 100, bin_size_liters: 25, frequency: 'weekly', features: null, is_active: true, sort_order: 1 },
  { id: 'pro', name: 'Pro Bi-weekly', subtitle: 'Pro BI-weekly offer', price_sle: 200, bin_size_liters: 50, frequency: 'bi-weekly', features: null, is_active: true, sort_order: 2 },
] as const;

const WASTE_TYPES = [
  { id: 'general', label: 'General Waste', subtitle: 'Household & office waste', Icon: Trash2 },
  { id: 'recyclables', label: 'Recyclables', subtitle: 'Paper, plastic, glass, metal', Icon: Recycle as any },
  { id: 'organic', label: 'Organic / Green', subtitle: 'Food waste, garden trimmings', Icon: Leaf },
  { id: 'construction', label: 'Construction', subtitle: 'Rubble, timber, fixtures', Icon: HardHat },
  { id: 'ewaste', label: 'E-Waste', subtitle: 'Electronics & appliances', Icon: Zap },
  { id: 'bulk', label: 'Bulk Items', subtitle: 'Furniture, mattresses, large items', Icon: Package },
];

const BIN_SIZES = [
  { value: '25', label: '25 L — Le 15' },
  { value: '50', label: '50 L — Le 25' },
  { value: '120', label: '120 L — Le 50' },
  { value: '250', label: '250 L — Le 90' },
  { value: '350', label: '350 L — Le 120' },
  { value: '600', label: '600 L — Le 250' },
  { value: '1000', label: '1,000 L — Le 350' },
  { value: '1000+', label: 'Above 1,000 L — Negotiable' },
];

const FREQUENCIES = [
  { id: 'daily', label: 'Daily' },
  { id: 'twice-weekly', label: 'Twice Weekly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'bi-weekly', label: 'Bi-Weekly' },
  { id: 'three-weeks', label: 'Every Three Weeks' },
  { id: 'monthly', label: 'Monthly' },
];

const TIME_SLOTS = [
  { id: 'morning', label: 'Morning (7 AM – 11 AM)' },
  { id: 'afternoon', label: 'Afternoon (12 PM – 4 PM)' },
  { id: 'evening', label: 'Evening (5 PM – 6:30 PM)' },
];

const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600' },
  paid: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700' },
  partial: { label: 'Partial', cls: 'bg-blue-50 text-blue-700' },
  overdue: { label: 'Overdue', cls: 'bg-red-50 text-red-600' },
  void: { label: 'Void', cls: 'bg-slate-100 text-slate-400' },
};

const PICKUP_STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Scheduled', cls: 'bg-slate-100 text-slate-600' },
  assigned: { label: 'Assigned', cls: 'bg-blue-50 text-blue-700' },
  in_progress: { label: 'In Progress', cls: 'bg-indigo-50 text-indigo-700' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700' },
  missed: { label: 'Missed', cls: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-600' },
};

function wasteLabel(id: string) {
  return WASTE_TYPES.find(w => w.id === id)?.label ?? id;
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateLong(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number) {
  return `SLE ${n.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    paused: 'bg-amber-50 text-amber-700 border border-amber-200',
    cancelled: 'bg-red-50 text-red-600 border border-red-200',
    scheduled: 'bg-sky-50 text-sky-700 border border-sky-200',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

type Tab = 'upcoming' | 'subs' | 'history' | 'invoices' | 'impact';

export function SmartSortSubscribeForm({ service, onCancel }: SmartSortSubscribeFormProps) {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [pickups, setPickups] = useState<UpcomingPickup[]>([]);
  const [pickupHistory, setPickupHistory] = useState<PickupHistoryItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [plans, setPlans] = useState<(typeof FALLBACK_PLANS)[number][] | Plan[]>(FALLBACK_PLANS as any);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | (typeof FALLBACK_PLANS)[number] | null>(null);
  const [showSubForm, setShowSubForm] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);

  // Sub form state
  const [subWasteType, setSubWasteType] = useState('');
  const [subBinSize, setSubBinSize] = useState('25');
  const [subFrequency, setSubFrequency] = useState('monthly');
  const [subTimeSlot, setSubTimeSlot] = useState('');
  const [subAddress, setSubAddress] = useState('');
  const [subLandmark, setSubLandmark] = useState('');
  const [subPhone, setSubPhone] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState('');

  useEffect(() => {
    loadData();
    loadPlans();
  }, []);

  const loadPlans = async () => {
    const { data } = await supabase
      .from('smart_sort_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (data && data.length > 0) setPlans(data as Plan[]);
  };

  const loadData = async () => {
    setLoadingSubs(true);
    const [subsRes, pickupsRes] = await Promise.all([
      supabase.from('smart_sort_subscriptions').select('*').order('created_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('id, scheduled_date, scheduled_time, location, details, status')
        .eq('service_id', service.id)
        .gte('scheduled_date', new Date().toISOString().split('T')[0])
        .order('scheduled_date'),
    ]);
    setSubs((subsRes.data as Subscription[]) || []);
    setPickups((pickupsRes.data as UpcomingPickup[]) || []);
    setLoadingSubs(false);
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('smart_sort_pickups')
      .select('id, scheduled_date, time_slot, status, driver_name, waste_kg, diverted_kg, completed_at, smart_sort_subscriptions(waste_type, bin_size_liters)')
      .order('scheduled_date', { ascending: false })
      .limit(50);
    setPickupHistory((data as unknown as PickupHistoryItem[]) || []);
    setLoadingHistory(false);
  };

  const loadInvoices = async () => {
    setLoadingInvoices(true);
    const { data } = await supabase
      .from('smart_sort_invoices')
      .select('id, invoice_number, period_start, period_end, amount_sle, amount_paid_sle, status, due_date, paid_at')
      .order('created_at', { ascending: false });
    setInvoices((data as Invoice[]) || []);
    setLoadingInvoices(false);
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    if (t === 'history' && pickupHistory.length === 0) loadHistory();
    if (t === 'invoices' && invoices.length === 0) loadInvoices();
  };

  const handleToggleAutoPay = async (sub: Subscription) => {
    const newVal = !sub.auto_pay;
    setSubs(prev => prev.map(s => s.id === sub.id ? { ...s, auto_pay: newVal } : s));
    await supabase.from('smart_sort_subscriptions').update({ auto_pay: newVal }).eq('id', sub.id);
  };

  const handlePause = async (sub: Subscription, months: number) => {
    const until = new Date();
    until.setMonth(until.getMonth() + months);
    const pausedUntil = until.toISOString().split('T')[0];
    setSubs(prev => prev.map(s => s.id === sub.id ? { ...s, status: 'paused', paused_until: pausedUntil } as any : s));
    await supabase.from('smart_sort_subscriptions').update({ status: 'paused', paused_until: pausedUntil }).eq('id', sub.id);
  };

  const handleResume = async (sub: Subscription) => {
    setSubs(prev => prev.map(s => s.id === sub.id ? { ...s, status: 'active', paused_until: null } as any : s));
    await supabase.from('smart_sort_subscriptions').update({ status: 'active', paused_until: null }).eq('id', sub.id);
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this subscription?')) return;
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status: 'cancelled' } : s));
    await supabase.from('smart_sort_subscriptions').update({ status: 'cancelled' }).eq('id', id);
  };

  const handleSkipPickup = async (id: string) => {
    setPickups(prev => prev.filter(p => p.id !== id));
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
  };

  const openSubForm = (plan: Plan | (typeof FALLBACK_PLANS)[number] | null) => {
    if (plan) {
      setSubFrequency(plan.frequency);
      setSubBinSize(String(plan.bin_size_liters));
    }
    setSelectedPlan(plan);
    setShowPlanModal(false);
    setShowSubForm(true);
  };

  const openEditSub = (sub: Subscription) => {
    setEditingSub(sub);
    setSubWasteType(sub.waste_type);
    setSubBinSize(String(sub.bin_size_liters));
    setSubFrequency(sub.frequency);
    setSubTimeSlot(sub.time_slot);
    setSubAddress(sub.address);
    setSubLandmark(sub.landmark || '');
    setSubPhone(sub.contact_phone);
    setSelectedPlan(null);
    setSubError('');
    setShowSubForm(true);
  };

  const handleCreateSub = async () => {
    if (!subWasteType || !subTimeSlot || !subAddress || !subPhone) {
      setSubError('Please fill all required fields.');
      return;
    }
    setSubError('');
    setSubLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('smart_sort_subscriptions').insert({
      user_id: user?.id,
      waste_type: subWasteType,
      bin_size_liters: parseInt(subBinSize),
      frequency: subFrequency,
      time_slot: subTimeSlot,
      address: subAddress,
      landmark: subLandmark || null,
      contact_phone: subPhone,
      plan_name: selectedPlan?.name || null,
      plan_price_sle: (selectedPlan as any)?.price_sle ?? (selectedPlan as any)?.price ?? null,
      status: 'active',
      auto_pay: true,
    });
    setSubLoading(false);
    if (err) { setSubError(err.message); return; }
    setShowSubForm(false);
    resetSubForm();
    loadData();
  };

  const handleUpdateSub = async () => {
    if (!editingSub) return;
    if (!subWasteType || !subTimeSlot || !subAddress || !subPhone) {
      setSubError('Please fill all required fields.');
      return;
    }
    setSubError('');
    setSubLoading(true);
    const payload = {
      waste_type: subWasteType,
      bin_size_liters: parseInt(subBinSize),
      frequency: subFrequency,
      time_slot: subTimeSlot,
      address: subAddress,
      landmark: subLandmark || null,
      contact_phone: subPhone,
    };
    const { error: err } = await supabase.from('smart_sort_subscriptions').update(payload).eq('id', editingSub.id);
    setSubLoading(false);
    if (err) { setSubError(err.message); return; }
    setSubs(prev => prev.map(s => s.id === editingSub.id ? { ...s, ...payload } as Subscription : s));
    setShowSubForm(false);
    setEditingSub(null);
    resetSubForm();
  };

  const resetSubForm = () => {
    setSubWasteType(''); setSubBinSize('25'); setSubFrequency('monthly');
    setSubTimeSlot(''); setSubAddress(''); setSubLandmark(''); setSubPhone('');
    setSubError(''); setSelectedPlan(null);
  };

  const closeSubForm = () => {
    setShowSubForm(false);
    setEditingSub(null);
    resetSubForm();
  };

  const tabs: { id: Tab; label: string; icon: typeof Recycle }[] = [
    { id: 'upcoming', label: 'Upcoming', icon: CalendarCheck },
    { id: 'subs', label: 'Subscriptions', icon: Recycle },
    { id: 'history', label: 'History', icon: History },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'impact', label: 'My Impact', icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Wallet Banner */}
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">Wallet balance: SLE 0</p>
              <p className="text-xs text-slate-500">Use your wallet to pay for any service across all divisions.</p>
            </div>
          </div>
          <button className="flex items-center gap-1.5 px-4 py-2 bg-[#1e293b] text-white font-medium rounded-xl hover:bg-[#0f172a] transition-colors text-sm">
            <Plus className="w-4 h-4" /> Top up
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="max-w-3xl mx-auto px-4 mt-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <Recycle className="w-5 h-5 text-emerald-600" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">Smart Sort</h1>
              <p className="text-xs text-slate-500">Recurring pickups, billing &amp; impact reports</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-3xl mx-auto px-4 mt-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-1 flex shadow-sm overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                tab === id ? 'bg-[#1e293b] text-white shadow' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 mt-5 pb-20 space-y-4">
        {/* ─── Upcoming Pickups ─── */}
        {tab === 'upcoming' && (
          loadingSubs ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : pickups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
              <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">No upcoming pickups</p>
              <p className="text-sm text-slate-400 mt-1">Schedule a one-off pickup or create a subscription.</p>
            </div>
          ) : (
            pickups.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-slate-500" />
                    <span className="font-bold text-slate-900">{formatDate(p.scheduled_date)}</span>
                  </div>
                  <StatusBadge status={p.status || 'scheduled'} />
                </div>
                <p className="text-sm text-slate-500 ml-6">
                  {p.details?.waste_type ? wasteLabel(p.details.waste_type) : 'Waste'}
                  {p.details?.bin_size_liters ? ` · ${p.details.bin_size_liters}L` : ''}
                  {p.scheduled_time ? ` · ${p.scheduled_time}` : ''}
                </p>
                {p.location && (
                  <div className="flex items-center gap-1.5 mt-1 ml-6">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm text-slate-500">{p.location}</span>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <button className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    <CalendarCheck className="w-4 h-4" /> Reschedule
                  </button>
                  <button
                    onClick={() => handleSkipPickup(p.id)}
                    className="px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Skip this one
                  </button>
                  <button className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors">
                    <AlertTriangle className="w-4 h-4" /> Bin Full
                  </button>
                </div>
              </div>
            ))
          )
        )}

        {/* ─── Subscriptions ─── */}
        {tab === 'subs' && (
          <>
            <div className="flex justify-end">
              <button
                onClick={() => setShowPlanModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1e293b] text-white font-semibold rounded-xl hover:bg-[#0f172a] transition-colors text-sm"
              >
                <Plus className="w-4 h-4" /> New Subscription
              </button>
            </div>
            {loadingSubs ? (
              <div className="flex justify-center py-16">
                <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
              </div>
            ) : subs.filter(s => s.status !== 'cancelled').length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
                <Recycle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700">No active subscriptions</p>
                <p className="text-sm text-slate-400 mt-1">Click "+ New Subscription" to get started.</p>
              </div>
            ) : (
              subs.filter(s => s.status !== 'cancelled').map(sub => (
                <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-bold text-slate-900">
                      {wasteLabel(sub.waste_type)} · {sub.bin_size_liters}L
                    </h3>
                    <StatusBadge status={sub.status} />
                  </div>
                  <p className="text-sm text-slate-500">
                    {sub.frequency} · {sub.time_slot} · since{' '}
                    {new Date(sub.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  {sub.plan_name && (
                    <p className="text-sm text-teal-600 font-medium mt-0.5">
                      {sub.plan_name} · {fmtMoney(sub.plan_price_sle || 0)}/mo
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm text-slate-500">{sub.address}</span>
                  </div>

                  {/* Auto-pay toggle */}
                  <div className="mt-4 flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <CreditCard className="w-4 h-4 text-slate-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">Auto-pay from wallet</p>
                        <p className="text-xs text-slate-400">Recurring invoices pay automatically.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleAutoPay(sub)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                        sub.auto_pay ? 'bg-[#1e293b]' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${sub.auto_pay ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      onClick={() => openEditSub(sub)}
                      className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" /> Edit
                    </button>
                    {sub.status === 'paused' ? (
                      <button
                        onClick={() => handleResume(sub)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Resume
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handlePause(sub, 1)}
                          className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Pause className="w-4 h-4" /> 1mo
                        </button>
                        <button
                          onClick={() => handlePause(sub, 2)}
                          className="px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          2mo
                        </button>
                        <button
                          onClick={() => handlePause(sub, 3)}
                          className="px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          3mo
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleCancel(sub.id)}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-rose-600 rounded-xl text-sm font-medium hover:bg-rose-50 transition-colors"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ─── Pickup History ─── */}
        {tab === 'history' && (
          loadingHistory ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : pickupHistory.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
              <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">No pickup history yet</p>
              <p className="text-sm text-slate-400 mt-1">Completed and past pickups will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pickupHistory.map(p => {
                const sm = PICKUP_STATUS[p.status] ?? PICKUP_STATUS.scheduled;
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CalendarCheck className="w-4 h-4 text-slate-500" />
                        <span className="font-bold text-slate-900 text-sm">{formatDateLong(p.scheduled_date)}</span>
                        <span className="text-xs text-slate-400">· {p.time_slot}</span>
                      </div>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${sm.cls}`}>
                        {sm.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 ml-6">
                      <span>{wasteLabel(p.smart_sort_subscriptions?.waste_type || 'general')} · {p.smart_sort_subscriptions?.bin_size_liters || '?'}L</span>
                      {p.driver_name && <span className="text-blue-600">· {p.driver_name}</span>}
                      {p.waste_kg != null && <span className="text-emerald-600 font-medium">· {p.waste_kg} kg collected</span>}
                      {p.diverted_kg != null && <span className="text-teal-600 font-medium">· {p.diverted_kg} kg diverted</span>}
                    </div>
                    {p.completed_at && (
                      <p className="text-xs text-slate-400 ml-6 mt-1">
                        Completed {new Date(p.completed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ─── Invoices ─── */}
        {tab === 'invoices' && (
          loadingInvoices ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">No invoices yet</p>
              <p className="text-sm text-slate-400 mt-1">Invoices for your subscriptions will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map(inv => {
                const balance = inv.amount_sle - inv.amount_paid_sle;
                const sm = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.pending;
                return (
                  <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-mono font-bold text-slate-900 text-sm">{inv.invoice_number}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatDateLong(inv.period_start)} – {formatDateLong(inv.period_end)}
                        </p>
                      </div>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${sm.cls}`}>
                        {sm.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="bg-slate-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-slate-400">Amount</p>
                        <p className="text-sm font-bold text-slate-800">{fmtMoney(inv.amount_sle)}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-emerald-500">Paid</p>
                        <p className="text-sm font-bold text-emerald-700">{fmtMoney(inv.amount_paid_sle)}</p>
                      </div>
                      <div className={`rounded-lg p-2 text-center ${balance > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <p className={`text-xs ${balance > 0 ? 'text-red-500' : 'text-slate-400'}`}>Balance</p>
                        <p className={`text-sm font-bold ${balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmtMoney(balance)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-slate-400">Due {formatDateLong(inv.due_date)}</span>
                      {inv.paid_at && <span className="text-xs text-emerald-600">Paid {formatDateLong(inv.paid_at)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ─── Impact Dashboard ─── */}
        {tab === 'impact' && <SmartSortImpactDashboard />}
      </div>

      {/* ─── Choose a Plan Modal ─── */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-slate-900">Choose a Plan</h2>
              <button onClick={() => setShowPlanModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              {plans.map(plan => {
                const price = (plan as any).price_sle ?? (plan as any).price;
                const capacity = (plan as any).bin_size_liters ?? (plan as any).capacity;
                const features = (plan as any).features as string[] | null;
                return (
                  <button
                    key={(plan as any).id}
                    onClick={() => openSubForm(plan)}
                    className="w-full flex items-center justify-between p-4 border-2 border-slate-200 rounded-xl hover:border-[#1e293b] hover:bg-slate-50 transition-all text-left group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-[#1e293b] transition-colors">
                        <Recycle className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{plan.name}</p>
                        <p className="text-xs text-teal-600 mb-2">{plan.subtitle}</p>
                        <div className="flex gap-1.5">
                          <span className="px-2 py-0.5 border border-slate-200 rounded-full text-xs text-slate-600">{capacity}L bin</span>
                          <span className="px-2 py-0.5 border border-slate-200 rounded-full text-xs text-slate-600">{plan.frequency}</span>
                        </div>
                        {features && features.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 max-w-[200px]">
                            {features.slice(0, 3).map((f, i) => (
                              <span key={i} className="text-xs text-slate-500">• {f}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-xl font-bold text-slate-900">SLE {price}</p>
                      <p className="text-xs text-slate-400">/month</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => openSubForm(null)}
              className="w-full py-3 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Continue without a plan (custom)
            </button>
          </div>
        </div>
      )}

      {/* ─── New / Edit Subscription Form Modal ─── */}
      {showSubForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{editingSub ? 'Edit Subscription' : 'New Subscription'}</h2>
                {selectedPlan && !editingSub && (
                  <p className="text-xs text-teal-600 mt-0.5">{selectedPlan.name} · SLE {(selectedPlan as any).price_sle ?? (selectedPlan as any).price}/mo</p>
                )}
                {editingSub && (
                  <p className="text-xs text-slate-400 mt-0.5">{wasteLabel(editingSub.waste_type)} · {editingSub.bin_size_liters}L</p>
                )}
              </div>
              <button onClick={closeSubForm} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
              {/* Waste Type */}
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-2.5">Waste Type <span className="text-rose-500">*</span></p>
                <div className="grid grid-cols-3 gap-2">
                  {WASTE_TYPES.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => setSubWasteType(id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                        subWasteType === id ? 'border-[#1e293b] bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${subWasteType === id ? 'text-[#1e293b]' : 'text-slate-400'}`} />
                      <span className={`text-xs font-semibold leading-tight ${subWasteType === id ? 'text-slate-900' : 'text-slate-600'}`}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bin size (custom only or editing) */}
              {(!selectedPlan || editingSub) && (
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Bin Size</label>
                  <div className="relative">
                    <select
                      value={subBinSize}
                      onChange={e => setSubBinSize(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm appearance-none bg-white focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                    >
                      {BIN_SIZES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Frequency (custom only or editing) */}
              {(!selectedPlan || editingSub) && (
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Pickup Frequency</label>
                  <div className="relative">
                    <select
                      value={subFrequency}
                      onChange={e => setSubFrequency(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm appearance-none bg-white focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                    >
                      {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Time slot */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <label className="text-sm font-semibold text-slate-800">Preferred Time Slot <span className="text-rose-500">*</span></label>
                </div>
                <div className="space-y-2">
                  {TIME_SLOTS.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setSubTimeSlot(id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                        subTimeSlot === id ? 'border-[#1e293b] bg-slate-50 ring-1 ring-[#1e293b]' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${subTimeSlot === id ? 'border-[#1e293b]' : 'border-slate-300'}`}>
                        {subTimeSlot === id && <div className="w-2 h-2 rounded-full bg-[#1e293b]" />}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Street Address <span className="text-rose-500">*</span></label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={subAddress}
                      onChange={e => setSubAddress(e.target.value)}
                      placeholder="e.g. 15 Siaka Stevens Street"
                      className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                    />
                  </div>
                  <button type="button" className="px-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex-shrink-0">
                    <Crosshair className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Nearest Landmark</label>
                <input
                  type="text"
                  value={subLandmark}
                  onChange={e => setSubLandmark(e.target.value)}
                  placeholder="e.g. Opposite National Stadium"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Contact Phone <span className="text-rose-500">*</span></label>
                <input
                  type="tel"
                  value={subPhone}
                  onChange={e => setSubPhone(e.target.value)}
                  placeholder="+232 76 000 000"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none"
                />
              </div>

              {subError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{subError}</div>
              )}
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex-shrink-0">
              <button
                onClick={editingSub ? handleUpdateSub : handleCreateSub}
                disabled={subLoading}
                className="w-full py-3.5 bg-teal-500 text-white font-semibold rounded-xl hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {subLoading ? (editingSub ? 'Updating…' : 'Creating…') : (editingSub ? 'Save Changes' : 'Confirm Subscription')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
