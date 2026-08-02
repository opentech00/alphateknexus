import { useState, useEffect } from 'react';
import {
  User, Mail, Phone, Save, Shield, Key, CheckCircle2, LogOut,
  Wallet, CreditCard, Receipt, Clock, Gift, Bell, Palette,
  HelpCircle, Pencil, X, Heart, Calendar, ChevronRight,
  Star, Loader2, CalendarDays, Package, CheckCheck, AlertCircle,
  MapPin, Monitor, Activity, Plus, Smartphone, Trash2, Lock, BarChart3,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { FavoritesPage } from './FavoritesPage';
import { SchedulingCalendar } from '../components/SchedulingCalendar';
import { WalletPanel } from '../components/WalletPanel';
import { ReferralPanel, ReferralModal } from '../components/ReferralPanel';
import { AppearancePanel } from '../components/AppearancePanel';
import { NotificationPreferencesPanel } from '../components/NotificationPreferencesPanel';
import { TwoFactorPanel } from '../components/TwoFactorPanel';
import { SessionManagerPanel } from '../components/SessionManagerPanel';
import { LoginActivityPanel } from '../components/LoginActivityPanel';
import { AddressPage } from '../components/AddressPage';
import { PremiumBenefitsPage } from './PremiumBenefitsPage';
import { SpendingDashboard } from '../components/SpendingDashboard';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

interface AccountPageProps {
  onNavigate: (page: string) => void;
  onQuickBook: (serviceId: string, preset: any) => void;
}

type AccountTab = 'overview' | 'wallet' | 'favorites' | 'calendar' | 'spending';
type ModalKind =
  | 'edit-profile' | 'change-password' | 'service-history'
  | 'notifications' | 'help' | 'referral' | 'appearance'
  | 'security' | 'address' | 'benefits' | 'payment' | 'receipts'
  | 'wallet' | 'spending' | null;

const MODULE_GRID = [
  { id: 'wallet',          label: 'Wallet',           sub: 'Credits balance & history',          icon: Wallet,       color: 'text-blue-600',    bg: 'bg-blue-50' },
  { id: 'spending',        label: 'Spending Insights', sub: 'Visualize your payment history',    icon: BarChart3,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'payment',         label: 'Payment Methods',  sub: 'Saved cards & mobile money',         icon: CreditCard,   color: 'text-violet-600',  bg: 'bg-violet-50' },
  { id: 'receipts',        label: 'Receipts',         sub: 'Download proof of payment',          icon: Receipt,      color: 'text-orange-600',  bg: 'bg-orange-50' },
  { id: 'service-history', label: 'Service History', sub: 'View past bookings',                 icon: Clock,        color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'address',         label: 'Address Book',    sub: 'Save home & office addresses',       icon: MapPin,       color: 'text-teal-600',    bg: 'bg-teal-50' },
  { id: 'security',        label: 'Security',         sub: '2FA, sessions & login activity',     icon: Shield,       color: 'text-blue-600',    bg: 'bg-blue-50' },
  { id: 'referral',        label: 'Referral Credits', sub: 'Earn rewards for referrals',         icon: Gift,         color: 'text-rose-600',    bg: 'bg-rose-50' },
  { id: 'notifications',   label: 'Notifications',    sub: 'Alerts & preferences',               icon: Bell,         color: 'text-amber-600',   bg: 'bg-amber-50' },
  { id: 'appearance',      label: 'Appearance',       sub: 'Theme & display',                    icon: Palette,      color: 'text-cyan-600',    bg: 'bg-cyan-50' },
  { id: 'help',            label: 'Help & Support',   sub: 'Contact our team by email or ticket', icon: HelpCircle,   color: 'text-slate-600',   bg: 'bg-slate-100' },
] as const;

const statusColors: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-700',
  confirmed:   'bg-blue-50 text-blue-700',
  in_progress: 'bg-emerald-50 text-emerald-700',
  completed:   'bg-slate-100 text-slate-600',
  cancelled:   'bg-red-50 text-red-600',
};

/* ───────────────────────── Modal shell ───────────────────────── */

function Modal({
  open, onClose, title, icon: Icon, iconColor, iconBg, children, maxWidth = 'max-w-lg',
}: {
  open: boolean; onClose: () => void; title: string;
  icon?: any; iconColor?: string; iconBg?: string;
  children: React.ReactNode; maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${maxWidth} bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl
          max-h-[92vh] flex flex-col overflow-hidden
          animate-[slideUp_0.2s_ease-out]`}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className={`w-9 h-9 ${iconBg || 'bg-slate-100'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4.5 h-4.5 ${iconColor || 'text-slate-600'}`} />
              </div>
            )}
            <h3 className="font-semibold text-slate-800 truncate">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 sm:px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Security hub ───────────────────────── */

type SecurityTab = '2fa' | 'sessions' | 'activity';

function SecurityHub() {
  const [secTab, setSecTab] = useState<SecurityTab>('2fa');
  const tabs = [
    { id: '2fa' as const,      label: '2FA',           icon: Shield },
    { id: 'sessions' as const, label: 'Sessions',      icon: Monitor },
    { id: 'activity' as const, label: 'Login Activity', icon: Activity },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
        {tabs.map(({ id, label, icon: I }) => (
          <button
            key={id}
            onClick={() => setSecTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              secTab === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <I className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">{label}</span>
          </button>
        ))}
      </div>
      {secTab === '2fa' && <TwoFactorPanel />}
      {secTab === 'sessions' && <SessionManagerPanel />}
      {secTab === 'activity' && <LoginActivityPanel />}
    </div>
  );
}

/* ───────────────────────── Payment Methods ───────────────────────── */

type PayTab = 'mobile' | 'cards';

const MOBILE_PROVIDERS = [
  { id: 'orange',   name: 'Orange Money',   color: 'bg-orange-500',  initials: 'OM' },
  { id: 'afrimoney', name: 'Afrimoney',     color: 'bg-rose-500',    initials: 'AF' },
  { id: 'qmoney',   name: 'QMoney',         color: 'bg-blue-500',    initials: 'QM' },
];

function PaymentMethods() {
  const [tab, setTab] = useState<PayTab>('mobile');
  const [methods, setMethods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState('');
  const [provider, setProvider] = useState('orange');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('payment_methods')
        .select('*')
        .order('created_at', { ascending: false });
      if (active) { setMethods(data || []); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const resetForm = () => {
    setNumber(''); setCardName(''); setCardNumber(''); setCardExp(''); setCardCvc('');
    setError(''); setProvider('orange');
  };

  const handleAddMobile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!number.trim() || number.replace(/\D/g, '').length < 8) {
      setError('Enter a valid mobile money number'); return;
    }
    setAdding(true);
    const { data: u } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('payment_methods').insert({
      user_id: u.user?.id,
      type: 'mobile',
      provider,
      label: MOBILE_PROVIDERS.find(p => p.id === provider)?.name || provider,
      detail: number.trim(),
      is_default: methods.length === 0,
    });
    setAdding(false);
    if (err) { setError(err.message); return; }
    const { data } = await supabase.from('payment_methods').select('*').order('created_at', { ascending: false });
    setMethods(data || []);
    resetForm(); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const digits = cardNumber.replace(/\s/g, '');
    if (digits.length < 13 || digits.length > 19) { setError('Enter a valid card number'); return; }
    if (!cardName.trim()) { setError('Name on card is required'); return; }
    if (!/^\d{2}\/\d{2}$/.test(cardExp)) { setError('Expiry must be MM/YY'); return; }
    if (cardCvc.length < 3) { setError('CVC must be 3+ digits'); return; }
    setAdding(true);
    const { data: u } = await supabase.auth.getUser();
    const last4 = digits.slice(-4);
    const brand = digits.startsWith('4') ? 'visa' : digits.startsWith('5') ? 'mastercard' : 'card';
    const { error: err } = await supabase.from('payment_methods').insert({
      user_id: u.user?.id,
      type: 'card',
      provider: brand,
      label: `${brand.toUpperCase()} •••• ${last4}`,
      detail: last4,
      exp_month: parseInt(cardExp.split('/')[0]),
      exp_year: 2000 + parseInt(cardExp.split('/')[1]),
      holder_name: cardName.trim(),
      is_default: methods.length === 0,
    });
    setAdding(false);
    if (err) { setError(err.message); return; }
    const { data } = await supabase.from('payment_methods').select('*').order('created_at', { ascending: false });
    setMethods(data || []);
    resetForm(); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const handleSetDefault = async (id: string) => {
    await supabase.from('payment_methods').update({ is_default: false }).neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('payment_methods').update({ is_default: true }).eq('id', id);
    const { data } = await supabase.from('payment_methods').select('*').order('created_at', { ascending: false });
    setMethods(data || []);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('payment_methods').delete().eq('id', id);
    setMethods(m => m.filter(x => x.id !== id));
  };

  const mobileMethods = methods.filter(m => m.type === 'mobile');
  const cardMethods = methods.filter(m => m.type === 'card');

  return (
    <div className="space-y-5">
      {/* Tab switch */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
        {[
          { id: 'mobile' as const, label: 'Mobile Money', icon: Smartphone },
          { id: 'cards' as const, label: 'Cards', icon: CreditCard },
        ].map(({ id, label, icon: I }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <I className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> Payment method saved
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
      ) : (
        <>
          {/* ── Mobile Money ── */}
          {tab === 'mobile' && (
            <div className="space-y-5">
              {mobileMethods.length > 0 && (
                <div className="space-y-2.5">
                  {mobileMethods.map(m => {
                    const prov = MOBILE_PROVIDERS.find(p => p.id === m.provider) || MOBILE_PROVIDERS[0];
                    return (
                      <div key={m.id} className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                        <div className={`w-10 h-10 ${prov.color} rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                          {prov.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{prov.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{m.detail}</p>
                        </div>
                        {m.is_default && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold flex-shrink-0">Default</span>
                        )}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!m.is_default && (
                            <button onClick={() => handleSetDefault(m.id)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors" title="Set default">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Remove">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <form onSubmit={handleAddMobile} className="space-y-4 p-4 bg-violet-50/40 rounded-xl border border-violet-100">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Plus className="w-4 h-4 text-violet-600" />
                  Add Mobile Money
                </div>
                {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Provider</label>
                  <div className="grid grid-cols-3 gap-2">
                    {MOBILE_PROVIDERS.map(p => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setProvider(p.id)}
                        className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border-2 transition-all ${
                          provider === p.id ? 'border-violet-500 bg-white shadow-sm' : 'border-transparent bg-white/60 hover:bg-white'
                        }`}
                      >
                        <div className={`w-8 h-8 ${p.color} rounded-lg flex items-center justify-center text-white text-[10px] font-bold`}>
                          {p.initials}
                        </div>
                        <span className="text-[10px] font-medium text-slate-600 text-center leading-tight">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="tel"
                      value={number}
                      onChange={e => setNumber(e.target.value)}
                      placeholder="e.g. 076 123 456"
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <button type="submit" disabled={adding} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 text-sm">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {adding ? 'Saving…' : 'Save Method'}
                </button>
              </form>
            </div>
          )}

          {/* ── Cards ── */}
          {tab === 'cards' && (
            <div className="space-y-5">
              {cardMethods.length > 0 && (
                <div className="space-y-2.5">
                  {cardMethods.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                        <CreditCard className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{m.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {m.holder_name}
                          {m.exp_month && m.exp_year ? ` · Exp ${String(m.exp_month).padStart(2, '0')}/${String(m.exp_year).slice(-2)}` : ''}
                        </p>
                      </div>
                      {m.is_default && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold flex-shrink-0">Default</span>
                      )}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!m.is_default && (
                          <button onClick={() => handleSetDefault(m.id)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors" title="Set default">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAddCard} className="space-y-4 p-4 bg-violet-50/40 rounded-xl border border-violet-100">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Plus className="w-4 h-4 text-violet-600" />
                  Add Card
                </div>
                {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Name on Card</label>
                  <input
                    type="text"
                    value={cardName}
                    onChange={e => setCardName(e.target.value)}
                    placeholder="Cardholder name"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Card Number</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardNumber}
                      onChange={e => setCardNumber(e.target.value.replace(/(.{4})/g, '$1 ').trim())}
                      placeholder="0000 0000 0000 0000"
                      maxLength={23}
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Expiry</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardExp}
                      onChange={e => {
                        let v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
                        setCardExp(v);
                      }}
                      placeholder="MM/YY"
                      maxLength={5}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">CVC</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardCvc}
                      onChange={e => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="123"
                      maxLength={4}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Lock className="w-3 h-3" />
                  Your card details are encrypted and never stored in full.
                </div>
                <button type="submit" disabled={adding} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 text-sm">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {adding ? 'Saving…' : 'Save Card'}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Service History ───────────────────────── */

function ServiceHistory({ history, loading }: { history: any[]; loading: boolean }) {
  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>;
  }
  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">No service history yet</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {history.map(b => (
        <div key={b.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
          <div className="w-9 h-9 bg-white rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0">
            {b.status === 'completed'
              ? <CheckCheck className="w-4 h-4 text-emerald-500" />
              : <X className="w-4 h-4 text-red-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{b.services?.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {new Date(b.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${statusColors[b.status]}`}>
            {b.status.replace('_', ' ')}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Notifications ───────────────────────── */

function NotificationsList({ notifications, loading }: { notifications: any[]; loading: boolean }) {
  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-amber-500 animate-spin" /></div>;
  }
  if (notifications.length === 0) {
    return (
      <div className="text-center py-12">
        <Bell className="w-12 h-12 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">No notifications yet</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {notifications.map(n => (
        <div key={n.id} className={`flex items-start gap-3 p-4 rounded-xl border ${n.read ? 'bg-white border-slate-100' : 'bg-amber-50 border-amber-100'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${n.read ? 'bg-slate-100' : 'bg-amber-100'}`}>
            {n.type === 'booking_update'
              ? <CalendarDays className={`w-4 h-4 ${n.read ? 'text-slate-400' : 'text-amber-600'}`} />
              : <Bell className={`w-4 h-4 ${n.read ? 'text-slate-400' : 'text-amber-600'}`} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">{n.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>
            <p className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
          </div>
          {!n.read && <div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0 mt-1.5" />}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Help & Support ───────────────────────── */

function HelpSupport() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Reach our support team directly — we're here to help.</p>
      <div className="space-y-3">
        <a
          href="mailto:support@alphateknexus.com"
          className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition-all group"
        >
          <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Email Support</p>
            <p className="text-xs text-slate-400">support@alphateknexus.com</p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 ml-auto group-hover:text-slate-500 transition-colors" />
        </a>
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Submit a Ticket</p>
            <p className="text-xs text-amber-600 font-medium mt-0.5">Coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <Package className="w-7 h-7 text-slate-300" />
      </div>
      <p className="font-semibold text-slate-700">{label}</p>
      <p className="text-sm text-slate-400 mt-1">This feature is coming soon</p>
    </div>
  );
}

/* ───────────────────────── Main page ───────────────────────── */

export function AccountPage({ onNavigate, onQuickBook }: AccountPageProps) {
  const { profile, user, signOut } = useAuth();
  const { referral_enabled, wallet_enabled } = useFeatureFlags();
  const [tab, setTab] = useState<AccountTab>('overview');
  const [modal, setModal] = useState<ModalKind>(null);
  const [referralOpen, setReferralOpen] = useState(false);

  // Profile edit
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editError, setEditError] = useState('');

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');

  // Service history
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const memberYear = user?.created_at
    ? new Date(user.created_at).getFullYear()
    : new Date().getFullYear();

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setEditError(''); setSaved(false);
    const { error } = await supabase.from('profiles').update({ full_name: fullName.trim(), phone: phone.trim() || null }).eq('id', user!.id);
    if (error) setEditError(error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(''); setPwSaved(false);
    if (newPassword.length < 10) { setPwError('Password must be at least 10 characters'); return; }
    if (!/[A-Z]/.test(newPassword)) { setPwError('Password must include an uppercase letter'); return; }
    if (!/[0-9]/.test(newPassword)) { setPwError('Password must include a number'); return; }
    if (!/[^A-Za-z0-9]/.test(newPassword)) { setPwError('Password must include a special character'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return; }
    setPwSaving(true);
    const { data, error: fnError } = await supabase.functions.invoke('manage-password', {
      body: { action: 'change', newPassword },
    });
    if (fnError || (data && !data.success)) {
      setPwError(fnError?.message || data?.error || 'Failed to update password');
    } else {
      setPwSaved(true); setNewPassword(''); setConfirmPassword(''); setTimeout(() => setPwSaved(false), 3000);
    }
    setPwSaving(false);
  };

  const openModal = async (id: string) => {
    if (id === 'referral' && referral_enabled) { setReferralOpen(true); return; }
    if ((id === 'wallet' || id === 'referral') && !wallet_enabled && id === 'wallet') { return; }
    if (id === 'service-history') {
      setModal('service-history');
      setHistoryLoading(true);
      const { data } = await supabase
        .from('bookings')
        .select('*, services(name, icon)')
        .in('status', ['completed', 'cancelled'])
        .order('scheduled_date', { ascending: false });
      setHistory(data || []);
      setHistoryLoading(false);
    } else if (id === 'notifications') {
      setModal('notifications');
      setNotifLoading(true);
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      setNotifications(data || []);
      setNotifLoading(false);
      await supabase.from('notifications').update({ read: true }).eq('read', false);
    } else {
      setModal(id as ModalKind);
    }
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  const moduleMeta = (id: string) => MODULE_GRID.find(m => m.id === id);

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── Profile Header Card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-700 font-bold text-xl">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900 truncate">{profile?.full_name || 'Your Name'}</h2>
            <p className="text-sm text-slate-500 truncate">{profile?.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                Premium Client
              </span>
              <button
                onClick={() => setModal('benefits')}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors"
              >
                <Star className="w-3 h-3" />
                View Benefits
              </button>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500 text-xs">
                <CalendarDays className="w-3 h-3" />
                Member since {memberYear}
              </span>
            </div>
          </div>
          <button
            onClick={() => setModal('edit-profile')}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Profile
          </button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex items-center gap-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-1.5 mb-4">
        {[
          { id: 'overview',  label: 'Overview',  icon: User },
          ...(wallet_enabled ? [{ id: 'wallet' as const, label: 'Wallet', icon: Wallet }] : []),
          { id: 'spending',  label: 'Spending',   icon: BarChart3 },
          { id: 'favorites', label: 'Favorites', icon: Heart },
          { id: 'calendar',  label: 'Calendar',  icon: Calendar },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as AccountTab)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              tab === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2">
              {MODULE_GRID.filter(m => (m.id !== 'wallet' || wallet_enabled) && (m.id !== 'referral' || referral_enabled)).map((mod, i) => {
                const Icon = mod.icon;
                const isLast = i === MODULE_GRID.length - 1;
                const isSecondLast = i === MODULE_GRID.length - 2;
                const isRightCol = i % 2 === 1;
                return (
                  <button
                    key={mod.id}
                    onClick={() => openModal(mod.id)}
                    className={`group flex items-center gap-4 px-6 py-5 hover:bg-slate-50/70 transition-colors text-left w-full
                      ${!isLast && !isSecondLast ? 'border-b border-slate-100' : ''}
                      ${isSecondLast && !isRightCol ? 'border-b border-slate-100 sm:border-b-0' : ''}
                      ${isSecondLast && isRightCol ? 'border-b border-slate-100' : ''}
                      ${!isRightCol ? 'sm:border-r sm:border-slate-100' : ''}
                    `}
                  >
                    <div className={`w-10 h-10 ${mod.bg} rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105`}>
                      <Icon className={`w-5 h-5 ${mod.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{mod.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{mod.sub}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sign Out */}
          <div className="flex justify-end">
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </>
      )}

      {/* ── Spending Tab ── */}
      {tab === 'spending' && <SpendingDashboard />}

      {/* ── Wallet Tab ── */}
      {tab === 'wallet' && wallet_enabled && <WalletPanel onChooseService={() => onNavigate('services')} />}

      {/* ── Favorites Tab ── */}
      {tab === 'favorites' && (
        <FavoritesPage onNavigate={onNavigate} onQuickBook={onQuickBook} />
      )}

      {/* ── Calendar Tab ── */}
      {tab === 'calendar' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            Scheduling Calendar
          </h2>
          <SchedulingCalendar mode="view" />
        </div>
      )}

      {/* ═══════════════ Modals ═══════════════ */}

      {/* Edit Profile */}
      <Modal
        open={modal === 'edit-profile'}
        onClose={() => setModal(null)}
        title="Edit Profile"
        icon={Pencil}
        iconColor="text-emerald-600"
        iconBg="bg-emerald-50"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          {editError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{editError}</div>}
          {saved && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Profile updated
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white outline-none transition-all"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input type="email" disabled value={profile?.email || ''} className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400 cursor-not-allowed" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 text-sm">
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
          </div>
          <div className="pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModal('change-password')}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
            >
              <Key className="w-4 h-4" />
              Change Password
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </Modal>

      {/* Change Password */}
      <Modal
        open={modal === 'change-password'}
        onClose={() => setModal(null)}
        title="Change Password"
        icon={Shield}
        iconColor="text-slate-600"
        iconBg="bg-slate-100"
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{pwError}</div>}
          {pwSaved && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Password updated</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">New Password</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 10 characters" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all" />
              </div>
            </div>
          </div>
          <button type="submit" disabled={pwSaving} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors disabled:opacity-50 text-sm">
            <Shield className="w-4 h-4" />
            {pwSaving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </Modal>

      {/* Wallet */}
      {wallet_enabled && (
      <Modal
        open={modal === 'wallet'}
        onClose={() => setModal(null)}
        title="Wallet"
        icon={Wallet}
        iconColor="text-blue-600"
        iconBg="bg-blue-50"
        maxWidth="max-w-2xl"
      >
        <WalletPanel onChooseService={() => { setModal(null); onNavigate('services'); }} />
      </Modal>
      )}

      {/* Payment Methods */}
      <Modal
        open={modal === 'payment'}
        onClose={() => setModal(null)}
        title="Payment Methods"
        icon={CreditCard}
        iconColor="text-violet-600"
        iconBg="bg-violet-50"
        maxWidth="max-w-lg"
      >
        <PaymentMethods />
      </Modal>

      {/* Receipts */}
      <Modal
        open={modal === 'receipts'}
        onClose={() => setModal(null)}
        title="Receipts"
        icon={Receipt}
        iconColor="text-orange-600"
        iconBg="bg-orange-50"
      >
        <ComingSoon label="Receipts" />
      </Modal>

      {/* Service History */}
      <Modal
        open={modal === 'service-history'}
        onClose={() => setModal(null)}
        title="Service History"
        icon={Clock}
        iconColor="text-emerald-600"
        iconBg="bg-emerald-50"
        maxWidth="max-w-xl"
      >
        <ServiceHistory history={history} loading={historyLoading} />
      </Modal>

      {/* Address Book */}
      <Modal
        open={modal === 'address'}
        onClose={() => setModal(null)}
        title="Address Book"
        icon={MapPin}
        iconColor="text-teal-600"
        iconBg="bg-teal-50"
        maxWidth="max-w-lg"
      >
        <AddressPage />
      </Modal>

      {/* Security */}
      <Modal
        open={modal === 'security'}
        onClose={() => setModal(null)}
        title="Security"
        icon={Shield}
        iconColor="text-blue-600"
        iconBg="bg-blue-50"
        maxWidth="max-w-xl"
      >
        <SecurityHub />
      </Modal>

      {/* Notifications */}
      <Modal
        open={modal === 'notifications'}
        onClose={() => setModal(null)}
        title="Notifications"
        icon={Bell}
        iconColor="text-amber-600"
        iconBg="bg-amber-50"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <NotificationPreferencesPanel />
          <div className="pt-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recent Notifications</h4>
            <NotificationsList notifications={notifications} loading={notifLoading} />
          </div>
        </div>
      </Modal>

      {/* Appearance */}
      <Modal
        open={modal === 'appearance'}
        onClose={() => setModal(null)}
        title="Appearance"
        icon={Palette}
        iconColor="text-cyan-600"
        iconBg="bg-cyan-50"
      >
        <AppearancePanel />
      </Modal>

      {/* Help & Support */}
      <Modal
        open={modal === 'help'}
        onClose={() => setModal(null)}
        title="Help & Support"
        icon={HelpCircle}
        iconColor="text-slate-600"
        iconBg="bg-slate-100"
      >
        <HelpSupport />
      </Modal>

      {/* Spending Insights */}
      <Modal
        open={modal === 'spending'}
        onClose={() => setModal(null)}
        title="Spending Insights"
        icon={BarChart3}
        iconColor="text-emerald-600"
        iconBg="bg-emerald-50"
        maxWidth="max-w-2xl"
      >
        <SpendingDashboard />
      </Modal>

      {/* Premium Benefits */}
      <Modal
        open={modal === 'benefits'}
        onClose={() => setModal(null)}
        title="Premium Benefits"
        icon={Star}
        iconColor="text-emerald-600"
        iconBg="bg-emerald-50"
        maxWidth="max-w-lg"
      >
        <PremiumBenefitsPage onBack={() => setModal(null)} />
      </Modal>

      {/* Referral Modal (existing) */}
      {referral_enabled && <ReferralModal open={referralOpen} onClose={() => setReferralOpen(false)} />}
    </div>
  );
}
