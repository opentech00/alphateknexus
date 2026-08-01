import { useEffect, useState } from 'react';
import {
  ArrowRight, Wallet, CalendarDays, Briefcase, Sparkles,
  Clock, CheckCircle2, AlertCircle, Plus,
  Shield, Ship, Trash2, ShoppingCart,
  HelpCircle, ChevronRight, Loader2, X,
  Phone, Mail, MapPin, FileText, ExternalLink, RefreshCw,
  Zap, Star,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Service } from '../types';
import { QuickBookModal } from '../components/QuickBookModal';
import { AppReviewModal } from '../components/AppReviewModal';

interface DashboardPageProps {
  onNavigate?: (page: string) => void;
  onSelectService?: (service: Service, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => void;
  onQuickBook?: (serviceId: string, preset: any) => void;
}

interface BookingRow {
  id: string;
  status: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  location: string | null;
  notes: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  services: { name: string; slug: string } | null;
}

const iconMap: Record<string, React.ReactNode> = {
  Trash2: <Trash2 className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Ship: <Ship className="w-5 h-5" />,
  Sparkles: <Sparkles className="w-5 h-5" />,
  ShoppingCart: <ShoppingCart className="w-5 h-5" />,
};

const serviceLinks: {
  slug: string; label: string; icon: string;
  gradient: string; mode?: 'hire' | 'quote' | 'pickup' | 'subscribe';
}[] = [
  { slug: 'clearing-forwarding', label: 'Clearing & Forwarding', icon: 'Ship',         gradient: 'from-blue-500 to-blue-600',     mode: 'hire' },
  { slug: 'waste-management',    label: 'Smart Sort Waste',       icon: 'Trash2',       gradient: 'from-emerald-500 to-teal-600', mode: 'pickup' },
  { slug: 'private-security',    label: 'Private Security',       icon: 'Shield',       gradient: 'from-slate-700 to-slate-900',  mode: 'hire' },
  { slug: 'cleaning-janitorial', label: 'Cleaning & Janitorial',  icon: 'Sparkles',     gradient: 'from-cyan-500 to-blue-500',    mode: 'hire' },
  { slug: 'procurement',         label: 'Procurement',            icon: 'ShoppingCart', gradient: 'from-amber-500 to-orange-600', mode: 'quote' },
];

function statusMeta(status: string) {
  switch (status) {
    case 'completed':  return { label: 'Completed',  icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' };
    case 'confirmed':  return { label: 'Confirmed',  icon: CheckCircle2, color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-500' };
    case 'in_progress':return { label: 'In Progress',icon: Clock,        color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200',  dot: 'bg-violet-500' };
    case 'pending':    return { label: 'Pending',    icon: Clock,        color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500' };
    case 'cancelled':  return { label: 'Cancelled',  icon: AlertCircle,  color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-400' };
    default:           return { label: status,       icon: Clock,        color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200',   dot: 'bg-slate-400' };
  }
}

function fmtDate(d: string | null) {
  if (!d) return 'Not scheduled';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Booking detail drawer ────────────────────────────────── */
function BookingDrawer({
  booking,
  onClose,
  onViewAll,
}: {
  booking: BookingRow;
  onClose: () => void;
  onViewAll: () => void;
}) {
  const meta = statusMeta(booking.status);
  const StatusIcon = meta.icon;

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Booking Detail</p>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">{booking.services?.name || 'Service'}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* status badge */}
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${meta.bg} ${meta.color} ${meta.border}`}>
            <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </div>

          {/* info rows */}
          <div className="bg-slate-50 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            <InfoRow icon={<CalendarDays className="w-4 h-4 text-slate-400" />} label="Scheduled" value={fmtDate(booking.scheduled_date)} />
            {booking.scheduled_time && (
              <InfoRow icon={<Clock className="w-4 h-4 text-slate-400" />} label="Time" value={booking.scheduled_time} />
            )}
            {booking.location && (
              <InfoRow icon={<MapPin className="w-4 h-4 text-slate-400" />} label="Location" value={booking.location} />
            )}
            {booking.contact_name && (
              <InfoRow icon={<Phone className="w-4 h-4 text-slate-400" />} label="Contact" value={booking.contact_name} />
            )}
            {booking.contact_phone && (
              <InfoRow icon={<Phone className="w-4 h-4 text-slate-400" />} label="Phone" value={booking.contact_phone} />
            )}
          </div>

          {/* notes */}
          {booking.notes && (
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Notes</p>
              </div>
              <p className="text-sm text-amber-800 leading-relaxed">{booking.notes}</p>
            </div>
          )}

          {/* status timeline strip */}
          <StatusTimeline status={booking.status} />
        </div>

        {/* footer */}
        <div className="p-5 border-t border-slate-100">
          <button
            onClick={onViewAll}
            className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors active:scale-[0.98]"
          >
            <ExternalLink className="w-4 h-4" /> View Full Details
          </button>
        </div>
      </div>
    </>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

const TIMELINE_STEPS = ['pending', 'confirmed', 'in_progress', 'completed'];
function StatusTimeline({ status }: { status: string }) {
  const idx = TIMELINE_STEPS.indexOf(status);
  if (status === 'cancelled') return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Progress</p>
      <div className="flex items-center gap-0">
        {TIMELINE_STEPS.map((step, i) => {
          const done = i <= idx;
          const active = i === idx;
          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                active ? 'bg-emerald-600 border-emerald-600' :
                done   ? 'bg-emerald-100 border-emerald-400' :
                         'bg-white border-slate-200'
              }`}>
                {done && <span className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-white' : 'bg-emerald-500'}`} />}
              </div>
              {i < TIMELINE_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 ${i < idx ? 'bg-emerald-400' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5">
        {TIMELINE_STEPS.map(s => (
          <p key={s} className="text-[10px] text-slate-400 capitalize">{s.replace('_', ' ')}</p>
        ))}
      </div>
    </div>
  );
}

/* ── Main dashboard ───────────────────────────────────────── */
export function DashboardPage({ onNavigate, onSelectService, onQuickBook }: DashboardPageProps) {
  const { profile } = useAuth();
  const [services, setServices]         = useState<Service[]>([]);
  const [bookings, setBookings]         = useState<BookingRow[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [animateIn, setAnimateIn]       = useState(false);
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [showQuickBook, setShowQuickBook] = useState(false);
  const [showAppReview, setShowAppReview] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(() => {
    try { return localStorage.getItem('atn-app-review-dismissed') === '1'; } catch { return false; }
  });

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError(null);

    const { data: { user } } = await supabase.auth.getUser();

    const results = await Promise.allSettled([
      supabase.from('services').select('*').eq('is_active', true).order('created_at'),
      supabase.from('bookings')
        .select('id, status, scheduled_date, scheduled_time, location, notes, contact_name, contact_phone, services(name, slug)')
        .order('created_at', { ascending: false })
        .limit(5),
      user
        ? supabase.from('wallet_transactions').select('amount_sle').eq('user_id', user.id).eq('status', 'completed')
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    const svcRes = results[0];
    const bkRes = results[1];
    const txnRes = results[2];

    const svc = svcRes.status === 'fulfilled' ? (svcRes.value.data ?? []) : [];
    const bk = bkRes.status === 'fulfilled' ? ((bkRes.value.data as unknown as BookingRow[]) ?? []) : [];
    const txns = txnRes.status === 'fulfilled' ? (txnRes.value.data ?? []) : [];

    setServices(svc as Service[]);
    setBookings(bk);
    const bal = txns.reduce((s: number, t: any) => s + Number(t.amount_sle), 0);
    setWalletBalance(bal);

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length === results.length) {
      setLoadError("We couldn't load your dashboard data. Check your connection and try again.");
    } else if (failed.length > 0) {
      setLoadError('Some sections failed to load. Showing partial data — tap retry to try again.');
    }

    setLoading(false);
    setTimeout(() => setAnimateIn(true), 80);
  };

  useEffect(() => {
    loadDashboard();

    const channel = supabase
      .channel('dashboard-wallet-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions' },
        () => loadDashboard(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const firstName      = profile?.full_name?.split(' ')[0] || 'there';
  const activeBookings = bookings.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status)).length;
  const completedCount = bookings.filter(b => b.status === 'completed').length;

  const handleServiceClick = (slug: string, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => {
    const svc = services.find(s => s.slug === slug);
    if (svc && onSelectService) { onSelectService(svc, mode); }
    else onNavigate?.('services');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      {loadError && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="flex-1 text-sm font-medium text-amber-800">{loadError}</p>
            <button
              onClick={loadDashboard}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 transition-all duration-700 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl overflow-hidden shadow-xl">
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-28 -left-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-sm text-emerald-400 font-semibold uppercase tracking-widest">Welcome back</p>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mt-2">{firstName}</h1>
              <p className="text-slate-400 mt-3 max-w-md text-sm leading-relaxed">
                Manage your services, track bookings, and access your account — all from one place.
              </p>
              <div className="flex flex-wrap gap-3 mt-6">
                <button
                  onClick={() => setShowQuickBook(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors active:scale-[0.98] shadow-lg shadow-emerald-900/30"
                >
                  <Zap className="w-4 h-4" /> Quick Book
                </button>
                <button
                  onClick={() => onNavigate?.('services')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 border border-white/15 backdrop-blur-sm text-white text-sm font-semibold rounded-xl hover:bg-white/20 transition-colors active:scale-[0.98]"
                >
                  <Briefcase className="w-4 h-4" /> Browse Services
                </button>
                <button
                  onClick={() => onNavigate?.('bookings')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 border border-white/15 backdrop-blur-sm text-white text-sm font-semibold rounded-xl hover:bg-white/20 transition-colors active:scale-[0.98]"
                >
                  <CalendarDays className="w-4 h-4" /> My Bookings
                </button>
              </div>
            </div>
            <div className="hidden sm:flex flex-shrink-0 items-center justify-center w-36 h-36 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 rounded-2xl border border-white/10 backdrop-blur-sm">
              <Sparkles className="w-16 h-16 text-emerald-400" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────── */}
      <section className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-5 transition-all duration-700 delay-100 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: 'Wallet Balance', value: `SLE ${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Wallet,       color: 'emerald', page: 'account' },
            { label: 'Active Bookings', value: String(activeBookings),  icon: Clock,         color: 'blue',    page: 'bookings' },
            { label: 'Completed',       value: String(completedCount),  icon: CheckCircle2,  color: 'teal',    page: 'bookings' },
            { label: 'Services',        value: String(services.length), icon: Briefcase,     color: 'amber',   page: 'services' },
          ].map(({ label, value, icon: Icon, color, page }) => (
            <button
              key={label}
              onClick={() => onNavigate?.(page)}
              className={`group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-${color}-200 transition-all text-left`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 bg-${color}-50 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-5 h-5 text-${color}-600`} />
                </div>
                <ArrowRight className={`w-4 h-4 text-slate-300 group-hover:text-${color}-500 group-hover:translate-x-0.5 transition-all`} />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-3 truncate">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Quick Actions ─────────────────────────────────── */}
      <section className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 transition-all duration-700 delay-150 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Quick Actions</h2>
          <button
            onClick={() => onNavigate?.('services')}
            className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            View all <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {serviceLinks.map((s, i) => (
            <button
              key={s.slug}
              onClick={() => handleServiceClick(s.slug, s.mode)}
              style={{ transitionDelay: `${160 + i * 55}ms` }}
              className={`group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all text-left ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
              <div className={`w-11 h-11 bg-gradient-to-br ${s.gradient} rounded-xl flex items-center justify-center text-white mb-3 group-hover:scale-110 transition-transform shadow-sm`}>
                {iconMap[s.icon]}
              </div>
              <p className="text-sm font-semibold text-slate-900 leading-snug">{s.label}</p>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 group-hover:text-emerald-600 transition-colors">
                Book now <ArrowRight className="w-3 h-3" />
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Bottom section ────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 pb-16">

        {/* Recent Bookings */}
        <section className={`lg:col-span-2 transition-all duration-700 delay-300 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-800 text-sm">Recent Bookings</h3>
              </div>
              <button
                onClick={() => onNavigate?.('bookings')}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                See all <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {bookings.length === 0 ? (
              <div className="text-center py-12 px-5">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <CalendarDays className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No bookings yet</p>
                <p className="text-xs text-slate-400 mt-1">Browse services to make your first booking.</p>
                <button
                  onClick={() => onNavigate?.('services')}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Browse Services
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {bookings.map((b) => {
                  const meta = statusMeta(b.status);
                  const StatusIcon = meta.icon;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setActiveBooking(b)}
                      className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors group text-left"
                    >
                      <div className={`w-10 h-10 ${meta.bg} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                        <StatusIcon className={`w-5 h-5 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{b.services?.name || 'Service'}</p>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {fmtDate(b.scheduled_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${meta.bg} ${meta.color} border ${meta.border} text-xs font-semibold rounded-full`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Side column */}
        <section className={`space-y-5 transition-all duration-700 delay-[400ms] ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

          {/* App review prompt */}
          {!reviewDismissed && (
            <div className="relative bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg overflow-hidden">
              <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center border border-white/20">
                    <Star className="w-5 h-5 text-white fill-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Enjoying the app?</h3>
                    <p className="text-amber-100 text-xs">Rate your experience with AlphaTek Nexus</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setShowAppReview(true)}
                    className="flex-1 py-2.5 bg-white text-amber-700 text-xs font-bold rounded-lg hover:bg-amber-50 transition-colors active:scale-[0.98]"
                  >
                    Rate Now
                  </button>
                  <button
                    onClick={() => {
                      setReviewDismissed(true);
                      try { localStorage.setItem('atn-app-review-dismissed', '1'); } catch {}
                    }}
                    className="px-4 py-2.5 bg-white/15 text-white text-xs font-medium rounded-lg hover:bg-white/25 transition-colors border border-white/20"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reliable services card */}
          <div className="relative bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 rounded-2xl p-6 text-white shadow-lg overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full" />
            <div className="absolute -bottom-8 -right-4 w-28 h-28 bg-white/5 rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-lg font-bold leading-snug">Reliable services.<br/>Trusted by many.</h3>
                  <p className="text-emerald-200 text-xs mt-2 leading-relaxed">
                    From waste management to logistics, we've got you covered.
                  </p>
                </div>
                <div className="flex-shrink-0 w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/15">
                  <Shield className="w-8 h-8 text-emerald-300" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                {[Ship, Trash2, Sparkles, ShoppingCart].map((Icon, i) => (
                  <div key={i} className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center border border-white/10">
                    <Icon className="w-3.5 h-3.5 text-emerald-200" />
                  </div>
                ))}
              </div>
              <button
                onClick={() => onNavigate?.('services')}
                className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors active:scale-[0.98]"
              >
                Explore Services <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Wallet + Need Help — side by side */}
          <div className="grid grid-cols-2 gap-3">
            {/* Wallet CTA */}
            <div className="relative bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-800 rounded-2xl shadow-lg shadow-emerald-900/20 p-4 flex flex-col overflow-hidden">
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-black/10 rounded-full pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/20">
                    <Wallet className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-emerald-100 font-semibold uppercase tracking-wide">Wallet</p>
                    <p className="text-sm font-bold text-white truncate">SLE {walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-100/80 leading-relaxed flex-1">Pay for any service with your wallet balance.</p>
                <button
                  onClick={() => onNavigate?.('account')}
                  className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 bg-white/15 border border-white/25 text-white text-xs font-semibold rounded-xl hover:bg-white/25 transition-colors active:scale-[0.98] backdrop-blur-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Top Up
                </button>
              </div>
            </div>

            {/* Need Help */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <HelpCircle className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Support</p>
                  <p className="text-sm font-bold text-slate-900">Need help?</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed flex-1">Our team is ready to assist you anytime.</p>
              <div className="mt-3 space-y-2">
                <a
                  href="tel:+23230123456"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 transition-colors group"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-700 group-hover:text-emerald-700 truncate">+232 30 123 456</span>
                </a>
                <a
                  href="mailto:support@alphateknexus.com"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 transition-colors group"
                >
                  <Mail className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-700 group-hover:text-emerald-700 truncate">support@alphateknexus.com</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Booking detail drawer */}
      {activeBooking && (
        <BookingDrawer
          booking={activeBooking}
          onClose={() => setActiveBooking(null)}
          onViewAll={() => { setActiveBooking(null); onNavigate?.('bookings'); }}
        />
      )}

      {showQuickBook && (
        <QuickBookModal
          onClose={() => setShowQuickBook(false)}
          onBook={(serviceId, preset) => {
            setShowQuickBook(false);
            const svc = services.find(s => s.id === serviceId);
            if (svc && onSelectService) {
              onSelectService(svc, 'hire');
            }
            if (onQuickBook) {
              onQuickBook(serviceId, preset);
            }
          }}
        />
      )}

      {showAppReview && (
        <AppReviewModal
          onClose={() => setShowAppReview(false)}
          onSubmitted={() => {
            setShowAppReview(false);
            setReviewDismissed(true);
            try { localStorage.setItem('atn-app-review-dismissed', '1'); } catch {}
          }}
        />
      )}
    </div>
  );
}
