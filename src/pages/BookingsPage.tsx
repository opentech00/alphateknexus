import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Calendar, MapPin, Clock, AlertCircle, Loader2, Plus,
  MessageSquare, Paperclip, ChevronDown, ChevronUp, Star, RotateCcw,
  Truck, Wallet, Search, CalendarDays, Recycle, ChevronRight, Ban, Trash2,
  CheckCircle2, X, FileText, Receipt, CreditCard, TrendingUp, Package,
  Filter, ArrowUpDown, Inbox, Bell, Phone, Mail, User, Zap, RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MessageThread } from '../components/MessageThread';
import { DocumentUpload } from '../components/DocumentUpload';
import { ReviewModal } from '../components/ReviewModal';
import { BookingTracker } from '../components/BookingTracker';
import { SubscriptionLifecycle } from '../components/SubscriptionLifecycle';
import { UnifiedCalendar } from '../components/UnifiedCalendar';
import { BookingTrackingPage } from '../components/BookingTrackingPage';
import { CancelDeleteBookingModal } from '../components/CancelDeleteBookingModal';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useServiceBrandingImages, fallbackServiceImage } from '../lib/media';

interface Booking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  service_id: string;
  details: Record<string, any> | null;
  deleted_at: string | null;
  cancellation_reason: string | null;
  services: { name: string; icon: string; slug: string };
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
  created_at: string;
}

interface BookingsPageProps {
  onNavigate: (page: string) => void;
  onRebook?: (booking: Booking) => void;
  initialExpandId?: string | null;
}

const statusConfig: Record<string, { label: string; badge: string; dot: string; accent: string }> = {
  pending:        { label: 'Pending',     badge: 'text-amber-700 bg-amber-50 border-amber-200',     dot: 'bg-amber-500',   accent: 'border-l-amber-400' },
  pending_review: { label: 'In Review',   badge: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500',  accent: 'border-l-orange-400' },
  approved:       { label: 'Approved',     badge: 'text-teal-700 bg-teal-50 border-teal-200',      dot: 'bg-teal-500',   accent: 'border-l-teal-400' },
  confirmed:      { label: 'Confirmed',   badge: 'text-blue-700 bg-blue-50 border-blue-200',      dot: 'bg-blue-500',   accent: 'border-l-blue-400' },
  in_progress:    { label: 'In Progress', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', accent: 'border-l-emerald-400' },
  completed:      { label: 'Completed',   badge: 'text-slate-600 bg-slate-100 border-slate-200',  dot: 'bg-slate-400',  accent: 'border-l-slate-300' },
  cancelled:      { label: 'Cancelled',   badge: 'text-red-700 bg-red-50 border-red-200',         dot: 'bg-red-500',    accent: 'border-l-red-400' },
};

const SERVICE_IMAGES: Record<string, string> = {
  'clearing-forwarding': '/service-clearing-forwarding.webp',
  'procurement': '/service-procurement.webp',
  'private-security': '/service-private-security.webp',
  'cleaning-janitorial': '/service-cleaning-janitorial.webp',
  'waste-management': '/service-smart-sort.webp',
  'smart-sort': '/service-smart-sort.webp',
};

type Tab = 'all' | 'active' | 'subscriptions' | 'completed' | 'calendar';
type SortBy = 'date_desc' | 'date_asc' | 'status' | 'service';
const ACTIVE_STATUSES = ['pending', 'pending_review', 'approved', 'confirmed', 'in_progress'];

export function BookingsPage({ onNavigate, onRebook, initialExpandId }: BookingsPageProps) {
  const { wallet_enabled } = useFeatureFlags();
  const { images: serviceImages } = useServiceBrandingImages();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date_desc');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(initialExpandId ?? null);
  const [detailTab, setDetailTab] = useState<'overview' | 'tracker' | 'messages' | 'documents'>('overview');
  const [reviewModal, setReviewModal] = useState<{ bookingId: string; serviceId: string; serviceName: string } | null>(null);
  const [reviewedBookings, setReviewedBookings] = useState<Set<string>>(new Set());
  const [walletBalance, setWalletBalance] = useState(0);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [trackingBookingId, setTrackingBookingId] = useState<string | null>(null);
  const [cancelDeleteModal, setCancelDeleteModal] = useState<{ bookingId: string; status: string; serviceName: string } | null>(null);
  const [animateIn, setAnimateIn] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchBookings = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, scheduled_date, scheduled_time, location, contact_name, contact_phone, contact_email, notes, created_at, service_id, details, deleted_at, cancellation_reason, services(name, icon, slug)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { setFetchError('Failed to load bookings. Please try again.'); setLoading(false); return; }
    setBookings((data as unknown as Booking[]) || []);
    setLoading(false);
    setFetchError('');
    setTimeout(() => setAnimateIn(true), 50);
  }, []);

  const fetchReviews = useCallback(async () => {
    const { data } = await supabase.from('reviews').select('booking_id');
    if (data) setReviewedBookings(new Set(data.map((r) => r.booking_id)));
  }, []);

  const fetchWallet = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('wallet_transactions')
      .select('amount_sle')
      .eq('user_id', user.id)
      .eq('status', 'completed');
    const bal = (data || []).reduce((s, t: any) => s + Number(t.amount_sle), 0);
    setWalletBalance(bal);
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    const { data } = await supabase
      .from('smart_sort_subscriptions')
      .select('id, waste_type, bin_size_liters, frequency, time_slot, address, landmark, contact_phone, plan_name, plan_price_sle, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    setSubscriptions((data as Subscription[]) || []);
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchReviews();
    if (wallet_enabled) fetchWallet();
    fetchSubscriptions();
  }, [fetchBookings, fetchReviews, fetchWallet, fetchSubscriptions]);

  const activeCount = bookings.filter(b => ACTIVE_STATUSES.includes(b.status)).length;
  const completedCount = bookings.filter(b => b.status === 'completed').length;
  const subCount = subscriptions.filter(s => s.status !== 'cancelled').length;

  const filteredBookings = useMemo(() => {
    let list = bookings.filter((b) => {
      if (tab === 'active' && !ACTIVE_STATUSES.includes(b.status)) return false;
      if (tab === 'completed' && b.status !== 'completed') return false;
      if (tab === 'subscriptions' || tab === 'calendar') return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          b.services?.name.toLowerCase().includes(q) ||
          (b.location || '').toLowerCase().includes(q) ||
          (b.contact_name || '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'date_asc': return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime();
        case 'date_desc': return new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime();
        case 'status': return a.status.localeCompare(b.status);
        case 'service': return (a.services?.name || '').localeCompare(b.services?.name || '');
        default: return 0;
      }
    });
    return list;
  }, [bookings, tab, search, sortBy]);

  const selectedBooking = bookings.find(b => b.id === selectedBookingId);

  const tabs: { id: Tab; label: string; count: number; icon: typeof Inbox }[] = [
    { id: 'all',           label: 'All Bookings',    count: bookings.length,    icon: Inbox },
    { id: 'active',        label: 'Active',          count: activeCount,         icon: Truck },
    { id: 'subscriptions', label: 'Subscriptions',  count: subCount,            icon: Recycle },
    { id: 'calendar',      label: 'Calendar',        count: 0,                   icon: Calendar },
    { id: 'completed',      label: 'Completed',       count: completedCount,      icon: CheckCircle2 },
  ];

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-8" aria-live="polite" aria-busy="true">
        <div className="relative w-full max-w-[760px] overflow-hidden rounded-[22px] border border-slate-100 bg-white px-6 py-12 text-center shadow-sm sm:px-12 sm:py-16">
          <span className="absolute left-[44%] top-16 h-2 w-2 rounded-full bg-indigo-300" />
          <span className="absolute right-[43%] top-24 h-2.5 w-2.5 rounded-full bg-amber-200" />
          <span className="absolute right-[34%] top-32 h-2.5 w-2.5 rounded-full bg-blue-400" />
          <span className="absolute left-[32%] top-36 h-1.5 w-1.5 rounded-full bg-indigo-300" />
          <span className="absolute right-[29%] top-48 h-2 w-2 rounded-full bg-emerald-300" />
          <div className="relative mx-auto mb-8 h-32 w-40">
            <div className="absolute left-5 top-5 h-24 w-32 rotate-3 rounded-xl bg-indigo-200 shadow-[0_14px_24px_rgba(99,102,241,0.18)]" />
            <div className="absolute left-8 top-8 h-24 w-32 -rotate-2 rounded-xl bg-indigo-300 shadow-[0_14px_24px_rgba(99,102,241,0.2)]" />
            <div className="absolute bottom-0 left-2 h-24 w-36 rounded-xl border border-indigo-200 bg-indigo-300 shadow-[0_18px_30px_rgba(99,102,241,0.2)]">
              <div className="absolute -top-7 left-12 h-20 w-16 rotate-6 rounded-md border border-slate-100 bg-white p-2 shadow-sm">
                <div className="space-y-1.5">
                  <span className="block h-1 w-10 rounded bg-slate-200" />
                  <span className="block h-1 w-8 rounded bg-slate-200" />
                  <span className="block h-1 w-11 rounded bg-slate-200" />
                  <span className="block h-1 w-6 rounded bg-slate-200" />
                </div>
              </div>
              <div className="absolute left-12 top-9 h-9 w-9 rounded-full border-[3px] border-indigo-100 border-t-blue-600 animate-spin" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Loading <span className="text-blue-600">your data</span></h1>
          <p className="mt-3 text-sm text-slate-400 sm:text-base">Please wait while we fetch the latest information for you.</p>
          <div className="mx-auto mt-8 flex max-w-[410px] items-center gap-4">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-blue-600 to-sky-400 animate-pulse" />
            </div>
            <span className="text-sm font-medium text-slate-400">62%</span>
          </div>
          <p className="mt-7 text-sm text-slate-400"><span className="mr-1">&#128161;</span> Tip: This usually takes a few seconds</p>
        </div>
      </div>
    );
  }

  if (fetchError && bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-sm text-slate-600">{fetchError}</p>
        <button onClick={() => { setFetchError(''); setLoading(true); fetchBookings(); }} className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (trackingBookingId) {
    return <BookingTrackingPage bookingId={trackingBookingId} onBack={() => setTrackingBookingId(null)} />;
  }

  // ── Calendar Tab (full-width, no split) ──
  if (tab === 'calendar') {
    return (
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
            <p className="text-sm text-slate-400 mt-0.5">All your bookings and subscriptions in one timeline</p>
          </div>
          <button onClick={() => setTab('all')} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1.5">
            <ChevronRight className="w-4 h-4 rotate-180" /> Back to list
          </button>
        </div>
        <UnifiedCalendar onNavigate={onNavigate} />
      </div>
    );
  }

  // ── Subscriptions Tab (full-width, no split) ──
  if (tab === 'subscriptions') {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Subscriptions</h1>
            <p className="text-sm text-slate-400 mt-0.5">Recurring services you've subscribed to</p>
          </div>
          <button onClick={() => onNavigate('subscriptions')} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <RotateCcw className="w-4 h-4" /> Manage all
          </button>
        </div>
        {subscriptions.filter(s => s.status !== 'cancelled').length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
              <Recycle className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No subscriptions yet</h3>
            <p className="mt-2 text-slate-500 text-sm">Subscribe to a Smart Sort plan for regular scheduled waste collection.</p>
            <button onClick={() => onNavigate('services')} className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-colors text-sm">
              <Recycle className="w-4 h-4" /> Browse Plans
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {subscriptions.filter(s => s.status !== 'cancelled').map((sub, i) => (
              <div key={sub.id} className={`transition-all duration-500 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: `${i * 50}ms` }}>
                <SubscriptionLifecycle subscription={sub as any} onUpdated={fetchSubscriptions} onNavigate={onNavigate} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Main Split Layout (All / Active / Completed tabs) ──
  return (
    <div className={`max-w-6xl mx-auto transition-all duration-500 ${animateIn ? 'opacity-100' : 'opacity-0'}`}>
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Bookings</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {bookings.length} total booking{bookings.length !== 1 ? 's' : ''}
            {subCount > 0 && ` · ${subCount} active subscription${subCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => onNavigate('services')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-colors text-sm whitespace-nowrap"
        >
          <CalendarDays className="w-4 h-4" />
          New Booking
        </button>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={<Truck className="w-4 h-4" />} label="Active" value={activeCount} color="blue" />
        <StatCard icon={<Recycle className="w-4 h-4" />} label="Subscriptions" value={subCount} color="emerald" />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Completed" value={completedCount} color="slate" />
        {wallet_enabled && (
          <StatCard
            icon={<Wallet className="w-4 h-4" />}
            label="Wallet Balance"
            value={`Le ${walletBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            color="amber"
            onClick={() => onNavigate('account')}
          />
        )}
      </div>

      {/* ── Sidebar Tabs + Content ── */}
      <div className="flex gap-5">
        {/* Left sidebar */}
        <div className="w-52 flex-shrink-0 hidden lg:block">
          <div className="bg-white border border-slate-200 rounded-2xl p-2 sticky top-20">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="flex-1 text-left">{t.label}</span>
                  {t.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile/tablet tab bar */}
        <div className="lg:hidden mb-4">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  tab === t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20' : 'bg-slate-100'}`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Search + Sort bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bookings..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-400 focus:border-slate-400 outline-none transition-all"
              />
            </div>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="appearance-none pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 focus:ring-2 focus:ring-slate-400 outline-none cursor-pointer"
              >
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="status">By status</option>
                <option value="service">By service</option>
              </select>
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Split: list + detail */}
          <div className="flex gap-4">
            {/* Booking list */}
            <div className={`${selectedBooking ? 'hidden xl:block w-[340px] flex-shrink-0' : 'flex-1'}`}>
              {filteredBookings.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
                    <AlertCircle className="w-6 h-6 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {search ? 'No results found' : tab === 'all' ? 'No bookings yet' : `No ${tab} bookings`}
                  </h3>
                  <p className="mt-2 text-slate-500 text-sm">
                    {search ? 'Try a different search term.' : 'Browse our services and place your first booking to get started.'}
                  </p>
                  {tab === 'all' && !search && (
                    <button onClick={() => onNavigate('services')} className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-colors text-sm">
                      <Plus className="w-4 h-4" /> Browse Services
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredBookings.map((booking, i) => {
                    const sc = statusConfig[booking.status] || statusConfig.pending;
                    const isSelected = selectedBookingId === booking.id;
                    const hasReview = reviewedBookings.has(booking.id);
                    const serviceImage = serviceImages[booking.services?.slug] || fallbackServiceImage(booking.services?.slug || 'smart-sort');
                    return (
                      <button
                        key={booking.id}
                        onClick={() => { setSelectedBookingId(booking.id); setDetailTab('overview'); }}
                        className={`w-full text-left bg-white rounded-xl border overflow-hidden hover:shadow-md transition-all duration-300 border-l-4 ${sc.accent} ${
                          isSelected ? 'ring-2 ring-slate-800 ring-offset-1 shadow-md' : 'border-y-slate-200 border-r-slate-200'
                        } ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                        style={{ transitionDelay: `${i * 40}ms` }}
                      >
                        <div className="flex items-stretch">
                          {/* Thumbnail */}
                          <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 relative overflow-hidden">
                            <img src={serviceImage} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0 p-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h3 className="font-semibold text-slate-900 text-sm truncate">{booking.services.name}</h3>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${sc.badge} flex-shrink-0`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                                {sc.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(booking.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              {booking.scheduled_time && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {booking.scheduled_time}
                                </span>
                              )}
                              {booking.location && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 flex-shrink-0" /> {booking.location}
                                </span>
                              )}
                            </div>
                            {hasReview && (
                              <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-emerald-600">
                                <Star className="w-2.5 h-2.5 fill-emerald-500" /> Reviewed
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Detail panel (desktop only) */}
            {selectedBooking && (
              <div className="hidden xl:block flex-1 min-w-0">
                <BookingDetailPanel
                  booking={selectedBooking}
                  onBack={() => setSelectedBookingId(null)}
                  onRebook={onRebook}
                  onCancelDelete={(b) => setCancelDeleteModal({ bookingId: b.id, status: b.status, serviceName: b.services.name })}
                  onReview={(b) => setReviewModal({ bookingId: b.id, serviceId: b.service_id, serviceName: b.services.name })}
                  onTrack={(id) => setTrackingBookingId(id)}
                  hasReview={reviewedBookings.has(selectedBooking.id)}
                  detailTab={detailTab}
                  setDetailTab={setDetailTab}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {reviewModal && (
        <ReviewModal
          bookingId={reviewModal.bookingId}
          serviceId={reviewModal.serviceId}
          serviceName={reviewModal.serviceName}
          onClose={() => setReviewModal(null)}
          onSuccess={() => { setReviewModal(null); fetchReviews(); }}
        />
      )}

      {cancelDeleteModal && (
        <CancelDeleteBookingModal
          bookingId={cancelDeleteModal.bookingId}
          bookingStatus={cancelDeleteModal.status}
          serviceName={cancelDeleteModal.serviceName}
          onClose={() => setCancelDeleteModal(null)}
          onSuccess={() => { setCancelDeleteModal(null); fetchBookings(); }}
        />
      )}
    </div>
  );
}

// ── Booking Detail Panel (right side of split layout) ──
function BookingDetailPanel({
  booking, onBack, onRebook, onCancelDelete, onReview, onTrack, hasReview, detailTab, setDetailTab,
}: {
  booking: Booking;
  onBack: () => void;
  onRebook?: (b: Booking) => void;
  onCancelDelete: (b: Booking) => void;
  onReview: (b: Booking) => void;
  onTrack: (id: string) => void;
  hasReview: boolean;
  detailTab: 'overview' | 'tracker' | 'messages' | 'documents';
  setDetailTab: (t: 'overview' | 'tracker' | 'messages' | 'documents') => void;
}) {
  const sc = statusConfig[booking.status] || statusConfig.pending;
  const isCompleted = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';
  const { images: svcImages } = useServiceBrandingImages();
  const serviceImage = svcImages[booking.services?.slug] || fallbackServiceImage(booking.services?.slug || 'smart-sort');

  const detailTabs = [
    { id: 'overview' as const, label: 'Overview', icon: FileText },
    { id: 'tracker' as const, label: 'Tracker', icon: Truck },
    { id: 'messages' as const, label: 'Messages', icon: MessageSquare },
    { id: 'documents' as const, label: 'Documents', icon: Paperclip },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden sticky top-20 max-h-[calc(100vh-6rem)] flex flex-col">
      {/* Hero image */}
      <div className="relative h-28 overflow-hidden flex-shrink-0">
        <img src={serviceImage} alt={booking.services.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <button onClick={onBack} className="absolute top-3 left-3 w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center hover:bg-white transition-colors">
          <X className="w-4 h-4 text-slate-700" />
        </button>
        <div className="absolute bottom-3 left-4 right-4">
          <h2 className="text-lg font-bold text-white drop-shadow">{booking.services.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${sc.badge} bg-white/90`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
              {sc.label}
            </span>
          </div>
        </div>
      </div>

      {/* Detail tabs */}
      <div className="flex border-b border-slate-100 flex-shrink-0">
        {detailTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setDetailTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                detailTab === t.id
                  ? 'text-emerald-700 border-b-2 border-emerald-500 bg-emerald-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {detailTab === 'overview' && (
          <div className="space-y-4">
            {/* Key info grid */}
            <div className="grid grid-cols-2 gap-3">
              <InfoTile icon={<Calendar className="w-4 h-4" />} label="Date" value={new Date(booking.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} />
              <InfoTile icon={<Clock className="w-4 h-4" />} label="Time" value={booking.scheduled_time || 'Flexible'} />
              <InfoTile icon={<MapPin className="w-4 h-4" />} label="Location" value={booking.location || 'Not specified'} />
              <InfoTile icon={<User className="w-4 h-4" />} label="Contact" value={booking.contact_name} />
              <InfoTile icon={<Phone className="w-4 h-4" />} label="Phone" value={booking.contact_phone} />
              {booking.contact_email && <InfoTile icon={<Mail className="w-4 h-4" />} label="Email" value={booking.contact_email} />}
            </div>

            {/* Notes */}
            {booking.notes && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
                <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">{booking.notes}</div>
              </div>
            )}

            {/* Details from booking */}
            {booking.details && Object.keys(booking.details).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Booking Details</p>
                <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                  {Object.entries(booking.details).slice(0, 8).map(([key, val]) => (
                    val != null && typeof val !== 'object' && (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-slate-400 capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-slate-700">{String(val)}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              {!isCompleted && !isCancelled && (
                <button onClick={() => onTrack(booking.id)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors">
                  <Truck className="w-3.5 h-3.5" /> Track
                </button>
              )}
              {(isCompleted || isCancelled) && (
                <button onClick={() => onRebook?.(booking)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> Rebook
                </button>
              )}
              {!isCompleted && !isCancelled && (
                <button onClick={() => onCancelDelete(booking)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors">
                  <Ban className="w-3.5 h-3.5" /> Cancel
                </button>
              )}
              {(isCompleted || isCancelled) && (
                <button onClick={() => onCancelDelete(booking)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 border border-red-200 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
              {isCompleted && !hasReview && (
                <button onClick={() => onReview(booking)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors">
                  <Star className="w-3.5 h-3.5" /> Review
                </button>
              )}
              {isCompleted && hasReview && (
                <span className="inline-flex items-center gap-1 px-3 py-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg">
                  <Star className="w-3.5 h-3.5 fill-emerald-500" /> Reviewed
                </span>
              )}
            </div>
          </div>
        )}

        {detailTab === 'tracker' && <BookingTracker bookingId={booking.id} currentStatus={booking.status} />}
        {detailTab === 'messages' && <MessageThread bookingId={booking.id} />}
        {detailTab === 'documents' && <DocumentUpload bookingId={booking.id} serviceSlug={booking.services?.slug} />}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, onClick }: { icon: React.ReactNode; label: string; value: string | number; color: string; onClick?: () => void }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2.5 text-left ${onClick ? 'hover:shadow-sm transition-shadow cursor-pointer' : ''}`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 truncate">{label}</p>
        <p className="text-sm font-bold text-slate-800 truncate">{value}</p>
      </div>
    </button>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-slate-400 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="text-sm font-medium text-slate-700 truncate">{value}</p>
    </div>
  );
}
