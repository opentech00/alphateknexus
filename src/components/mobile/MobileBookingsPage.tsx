import { useCallback, useEffect, useState } from 'react';
import {
  Calendar, MapPin, Clock, AlertCircle, Loader2, Plus,
  MessageSquare, Paperclip, ChevronDown, ChevronUp, Star, RotateCcw,
  Truck, Wallet, Search, Recycle, CheckCircle2, Ban, Trash2, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { MessageThread } from '../MessageThread';
import { DocumentUpload } from '../DocumentUpload';
import { ReviewModal } from '../ReviewModal';
import { BookingTracker } from '../BookingTracker';
import { SubscriptionLifecycle } from '../SubscriptionLifecycle';
import { CancelDeleteBookingModal } from '../CancelDeleteBookingModal';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useHaptics } from '../../hooks/useHaptics';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useServiceBrandingImages, fallbackServiceImage } from '../../lib/media';
import { BookingCardSkeleton } from './Skeleton';
import { SwipeableBookingCard } from './SwipeableBookingCard';

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

interface Props {
  onNavigate: (page: string) => void;
  onRebook?: (booking: Booking) => void;
  initialExpandId?: string | null;
}

const statusConfig: Record<string, { label: string; badge: string; dot: string }> = {
  pending:         { label: 'Pending',     badge: 'text-amber-700 bg-amber-50 border-amber-200',     dot: 'bg-amber-500' },
  pending_review:  { label: 'In Review',   badge: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  approved:         { label: 'Approved',    badge: 'text-teal-700 bg-teal-50 border-teal-200',       dot: 'bg-teal-500' },
  confirmed:        { label: 'Confirmed',   badge: 'text-blue-700 bg-blue-50 border-blue-200',      dot: 'bg-blue-500' },
  in_progress:      { label: 'In Progress', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  completed:        { label: 'Completed',   badge: 'text-slate-600 bg-slate-100 border-slate-200',  dot: 'bg-slate-400' },
  cancelled:        { label: 'Cancelled',   badge: 'text-red-700 bg-red-50 border-red-200',         dot: 'bg-red-500' },
};

const SERVICE_IMAGES: Record<string, string> = {
  'clearing-forwarding': '/service-clearing-forwarding.webp',
  'procurement': '/service-procurement.webp',
  'private-security': '/service-private-security.webp',
  'cleaning-janitorial': '/service-cleaning-janitorial.webp',
  'waste-management': '/service-smart-sort.webp',
  'smart-sort': '/service-smart-sort.webp',
};

type Tab = 'all' | 'active' | 'subscriptions' | 'completed';
const ACTIVE_STATUSES = ['pending', 'pending_review', 'approved', 'confirmed', 'in_progress'];

export function MobileBookingsPage({ onNavigate, onRebook, initialExpandId }: Props) {
  const { wallet_enabled } = useFeatureFlags();
  const { vibrate } = useHaptics();
  const { images: serviceImages } = useServiceBrandingImages();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [expandedBooking, setExpandedBooking] = useState<string | null>(initialExpandId ?? null);
  const [activeSubTab, setActiveSubTab] = useState<'tracker' | 'messages' | 'documents'>('tracker');
  const [reviewModal, setReviewModal] = useState<{ bookingId: string; serviceId: string; serviceName: string } | null>(null);
  const [reviewedBookings, setReviewedBookings] = useState<Set<string>>(new Set());
  const [walletBalance, setWalletBalance] = useState(0);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [fetchError, setFetchError] = useState('');
  const [cancelDeleteModal, setCancelDeleteModal] = useState<{ bookingId: string; status: string; serviceName: string } | null>(null);

  const fetchBookings = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name, icon, slug)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) { setFetchError('Failed to load bookings. Pull down to retry.'); setLoading(false); return; }
    setBookings((data as unknown as Booking[]) || []);
    setLoading(false);
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
      .select('*')
      .order('created_at', { ascending: false });
    setSubscriptions((data as Subscription[]) || []);
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchReviews();
    if (wallet_enabled) fetchWallet();
    fetchSubscriptions();
  }, [fetchBookings, fetchReviews, fetchWallet, fetchSubscriptions]);

  const filteredBookings = bookings.filter((b) => {
    if (tab === 'active' && !ACTIVE_STATUSES.includes(b.status)) return false;
    if (tab === 'completed' && b.status !== 'completed') return false;
    if (tab === 'subscriptions') return false;
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

  const WASTE_LABELS: Record<string, string> = {
    general: 'General Waste', recyclables: 'Recyclables', organic: 'Organic / Green',
    construction: 'Construction', ewaste: 'E-Waste', bulk: 'Bulk Items',
  };

  const filteredSubs = subscriptions.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      return (s.address || '').toLowerCase().includes(q) ||
        (s.plan_name || '').toLowerCase().includes(q) ||
        (WASTE_LABELS[s.waste_type] || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleRefresh = useCallback(async () => {
    vibrate('light');
    await Promise.all([fetchBookings(), fetchReviews(), fetchSubscriptions(), wallet_enabled ? fetchWallet() : Promise.resolve()]);
  }, [fetchBookings, fetchReviews, fetchSubscriptions, fetchWallet, wallet_enabled, vibrate]);

  const { ref: scrollRef, pulling, progress, refreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  const toggleExpand = (id: string) => {
    vibrate('light');
    setExpandedBooking(expandedBooking === id ? null : id);
    setActiveSubTab('tracker');
  };

  const activeCount = bookings.filter(b => ACTIVE_STATUSES.includes(b.status)).length;
  const completedCount = bookings.filter(b => b.status === 'completed').length;
  const subCount = subscriptions.filter(s => s.status !== 'cancelled').length;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: bookings.length },
    { id: 'active', label: 'Active', count: activeCount },
    { id: 'subscriptions', label: 'Subs', count: subCount },
    { id: 'completed', label: 'Done', count: completedCount },
  ];

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">My Bookings</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Loading...</p>
        </div>
        <div className="px-4 pb-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <BookingCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (fetchError && bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-sm text-slate-600 dark:text-slate-300">{fetchError}</p>
        <button onClick={() => { setFetchError(''); setLoading(true); fetchBookings(); }} className="mt-4 px-4 py-2 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg active:scale-95 transition-transform">
          Retry
        </button>
      </div>
    );
  }

  const pullIndicatorHeight = refreshing ? 40 : pulling ? Math.round(progress * 40) : 0;

  return (
    <div ref={scrollRef} className="flex flex-col min-h-full overflow-y-auto mobile-scroll">
      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{ height: `${pullIndicatorHeight}px` }}
      >
        <RefreshCw
          className={`w-5 h-5 text-blue-500 transition-transform ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: `rotate(${progress * 180}deg)`, opacity: refreshing ? 1 : progress }}
        />
      </div>

      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">My Bookings</h1>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          {bookings.length} booking{bookings.length !== 1 ? 's' : ''}{subCount > 0 && ` · ${subCount} subscription${subCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Summary stats */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-2.5 flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">Active</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{activeCount}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-2.5 flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Recycle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">Subs</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{subCount}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-2.5 flex items-center gap-2">
            <div className="w-7 h-7 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">Done</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{completedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bookings..."
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 dark:border-slate-700 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none no-tap-highlight transition-all"
          />
        </div>
      </div>

      {/* Wallet pill */}
      {wallet_enabled && (
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2.5 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3.5 py-2.5 shadow-sm">
          <div className="w-7 h-7 bg-slate-900 dark:bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <Wallet className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              Wallet: Le {walletBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
          </div>
          <button
            onClick={() => onNavigate('account')}
            className="text-xs font-medium text-blue-600 flex items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
          >
            Top up <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
      )}

      {/* Filter chips — sticky */}
      <div className="sticky top-0 z-20 bg-gray-50 dark:bg-slate-950 black:bg-black px-4 pb-3 pt-1">
        <div className="flex gap-2 overflow-x-auto mobile-scroll" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { vibrate('light'); setTab(t.id); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
                tab === t.id
                  ? 'bg-slate-900 dark:bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                tab === t.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'
              }`}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Subscriptions sub-header */}
      {tab === 'subscriptions' && (
        <div className="flex items-center justify-between px-4 pb-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Recurring services you've subscribed to</p>
          <button
            onClick={() => onNavigate('subscriptions')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg active:scale-95 transition-transform"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Manage all
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-4 pb-6">
        {/* Subscriptions tab */}
        {tab === 'subscriptions' && (
          filteredSubs.length === 0 ? (
            <EmptyState
              icon={<Recycle className="w-6 h-6 text-slate-400" />}
              title={search ? 'No results found' : 'No subscriptions yet'}
              subtitle={search ? 'Try a different search term.' : 'Subscribe to a Smart Sort plan for regular scheduled waste collection.'}
              actionLabel={!search ? 'Browse Plans' : undefined}
              onAction={() => onNavigate('services')}
            />
          ) : (
            <div className="space-y-3">
              {filteredSubs.map((sub, i) => (
                <div
                  key={sub.id}
                  className="animate-slide-in-from-bottom"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <SubscriptionLifecycle
                    subscription={sub as any}
                    onUpdated={fetchSubscriptions}
                    onNavigate={onNavigate}
                  />
                </div>
              ))}
            </div>
          )
        )}

        {/* Bookings list (All / Active / Completed) */}
        {tab !== 'subscriptions' && (
          filteredBookings.length === 0 ? (
            <EmptyState
              icon={<AlertCircle className="w-6 h-6 text-slate-400" />}
              title={search ? 'No results found' : tab === 'all' ? 'No bookings yet' : `No ${tab} bookings`}
              subtitle={search ? 'Try a different search term.' : tab === 'all' ? 'Browse our services and place your first booking to get started.' : 'Try switching to a different tab to see more results.'}
              actionLabel={tab === 'all' && !search ? 'Browse Services' : undefined}
              onAction={() => onNavigate('services')}
            />
          ) : (
            <div className="space-y-3">
              {filteredBookings.map((booking, i) => {
                const sc = statusConfig[booking.status] || statusConfig.pending;
                const isCompleted = booking.status === 'completed';
                const hasReview = reviewedBookings.has(booking.id);
                const isExpanded = expandedBooking === booking.id;
                const serviceImage = serviceImages[booking.services?.slug] || fallbackServiceImage(booking.services?.slug || 'smart-sort');
                const canRebook = isCompleted || booking.status === 'cancelled';
                const canCancel = !isCompleted && booking.status !== 'cancelled';

                return (
                  <SwipeableBookingCard
                    key={booking.id}
                    onRebook={() => onRebook?.(booking)}
                    onCancel={() => setCancelDeleteModal({ bookingId: booking.id, status: booking.status, serviceName: booking.services.name })}
                    showRebook={canRebook}
                    showCancel={canCancel}
                  >
                  <div
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden transition-all"
                    style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.06}s both` }}
                  >
                    {/* Image banner */}
                    <div className="relative h-16 overflow-hidden">
                      <img
                        src={serviceImage}
                        alt={booking.services.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <div className="absolute top-2 right-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${sc.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </span>
                      </div>
                      <h3 className="absolute bottom-1.5 left-3 text-sm font-bold text-white drop-shadow">{booking.services.name}</h3>
                    </div>

                    {/* Body */}
                    <div className="p-3.5">
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(booking.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {booking.scheduled_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {booking.scheduled_time}
                          </span>
                        )}
                      </div>
                      {booking.location && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-2">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{booking.location}</span>
                        </div>
                      )}
                      {booking.notes && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1 mb-2">{booking.notes}</p>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          Le {booking.details?.price_sle?.toLocaleString() || '—'}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(isCompleted || booking.status === 'cancelled') && (
                            <button
                              onClick={() => onRebook?.(booking)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 active:scale-95 transition-transform dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400"
                            >
                              <RotateCcw className="w-3 h-3" /> Rebook
                            </button>
                          )}
                          {!isCompleted && booking.status !== 'cancelled' && (
                            <button
                              onClick={() => setCancelDeleteModal({ bookingId: booking.id, status: booking.status, serviceName: booking.services.name })}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 rounded-lg border border-amber-200 active:scale-95 transition-transform dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400"
                            >
                              <Ban className="w-3 h-3" /> Cancel
                            </button>
                          )}
                          {(isCompleted || booking.status === 'cancelled') && (
                            <button
                              onClick={() => setCancelDeleteModal({ bookingId: booking.id, status: booking.status, serviceName: booking.services.name })}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-red-700 bg-red-50 rounded-lg border border-red-200 active:scale-95 transition-transform dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          )}
                          {isCompleted && !hasReview && (
                            <button
                              onClick={() => setReviewModal({
                                bookingId: booking.id,
                                serviceId: booking.service_id,
                                serviceName: booking.services.name,
                              })}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 rounded-lg border border-amber-200 active:scale-95 transition-transform dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400"
                            >
                              <Star className="w-3 h-3" /> Review
                            </button>
                          )}
                          {isCompleted && hasReview && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-600 bg-emerald-50 rounded-full dark:bg-emerald-900/30 dark:text-emerald-400">
                              <Star className="w-3 h-3 fill-emerald-500" /> Reviewed
                            </span>
                          )}
                          <button
                            onClick={() => toggleExpand(booking.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 bg-slate-50 rounded-lg active:scale-95 transition-transform dark:bg-slate-700 dark:text-slate-300"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <Paperclip className="w-3 h-3" />
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded section */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-700">
                        <div className="flex">
                          {(['tracker', 'messages', 'documents'] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => { vibrate('light'); setActiveSubTab(t); }}
                              className={`flex-1 py-2.5 text-[11px] font-medium capitalize transition-colors ${
                                activeSubTab === t
                                  ? 'text-blue-700 border-b-2 border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 dark:text-blue-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {t === 'tracker' && <Truck className="w-3 h-3 inline mr-1" />}
                              {t === 'messages' && <MessageSquare className="w-3 h-3 inline mr-1" />}
                              {t === 'documents' && <Paperclip className="w-3 h-3 inline mr-1" />}
                              {t}
                            </button>
                          ))}
                        </div>
                        <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50">
                          {activeSubTab === 'tracker' ? (
                            <BookingTracker bookingId={booking.id} currentStatus={booking.status} />
                          ) : activeSubTab === 'messages' ? (
                            <MessageThread bookingId={booking.id} />
                          ) : (
                            <DocumentUpload bookingId={booking.id} serviceSlug={booking.services?.slug} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  </SwipeableBookingCard>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => onNavigate('services')}
        className="fixed bottom-24 right-5 w-14 h-14 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl shadow-xl flex items-center justify-center active:scale-90 transition-transform z-30"
      >
        <Plus className="w-6 h-6" />
      </button>

      {reviewModal && (
        <ReviewModal
          bookingId={reviewModal.bookingId}
          serviceId={reviewModal.serviceId}
          serviceName={reviewModal.serviceName}
          onClose={() => setReviewModal(null)}
          onSuccess={() => {
            setReviewModal(null);
            fetchReviews();
          }}
        />
      )}

      {cancelDeleteModal && (
        <CancelDeleteBookingModal
          bookingId={cancelDeleteModal.bookingId}
          bookingStatus={cancelDeleteModal.status}
          serviceName={cancelDeleteModal.serviceName}
          onClose={() => setCancelDeleteModal(null)}
          onSuccess={() => {
            setCancelDeleteModal(null);
            fetchBookings();
          }}
        />
      )}
    </div>
  );
}

function EmptyState({
  icon, title, subtitle, actionLabel, onAction,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-10 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-full mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">{subtitle}</p>
      {actionLabel && (
        <button
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-blue-600 text-white font-semibold rounded-xl active:scale-95 transition-transform text-sm"
        >
          <Plus className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
