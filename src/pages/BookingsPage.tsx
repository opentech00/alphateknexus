import { useEffect, useState, useCallback } from 'react';
import {
  Calendar, MapPin, Clock, AlertCircle, Loader2, Plus,
  MessageSquare, Paperclip, ChevronDown, ChevronUp, Star, RotateCcw,
  Truck, Wallet, Search, CalendarDays, Recycle, ChevronRight, Ban, Trash2,
  Package, CheckCircle2, X,
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

const statusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_review: 'bg-orange-50 text-orange-700 border-orange-200',
  approved: 'bg-teal-50 text-teal-700 border-teal-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-slate-50 text-slate-600 border-slate-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  pending_review: 'Awaiting Review',
  approved: 'Approved',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusDots: Record<string, string> = {
  pending: 'bg-amber-500',
  pending_review: 'bg-orange-500',
  approved: 'bg-teal-500',
  confirmed: 'bg-blue-500',
  in_progress: 'bg-emerald-500',
  completed: 'bg-slate-400',
  cancelled: 'bg-red-500',
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

const ACTIVE_STATUSES = ['pending', 'pending_review', 'approved', 'confirmed', 'in_progress'];

export function BookingsPage({ onNavigate, onRebook, initialExpandId }: BookingsPageProps) {
  const { wallet_enabled } = useFeatureFlags();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [animateIn, setAnimateIn] = useState(false);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(initialExpandId ?? null);
  const [activeSubTab, setActiveSubTab] = useState<'tracker' | 'messages' | 'documents'>('tracker');
  const [reviewModal, setReviewModal] = useState<{ bookingId: string; serviceId: string; serviceName: string } | null>(null);
  const [reviewedBookings, setReviewedBookings] = useState<Set<string>>(new Set());
  const [walletBalance, setWalletBalance] = useState(0);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [trackingBookingId, setTrackingBookingId] = useState<string | null>(null);
  const [cancelDeleteModal, setCancelDeleteModal] = useState<{ bookingId: string; status: string; serviceName: string } | null>(null);

  const fetchBookings = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select('*, services(name, icon, slug)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setBookings((data as unknown as Booking[]) || []);
    setLoading(false);
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

  const WASTE_LABELS: Record<string, string> = {
    general: 'General Waste', recyclables: 'Recyclables', organic: 'Organic / Green',
    construction: 'Construction', ewaste: 'E-Waste', bulk: 'Bulk Items',
  };
  const FREQ_LABELS: Record<string, string> = {
    'one-time': 'One-Time', daily: 'Daily', 'twice-weekly': 'Twice Weekly',
    weekly: 'Weekly', 'three-weeks': 'Every 3 Weeks', monthly: 'Monthly',
  };
  const SLOT_LABELS: Record<string, string> = {
    morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening',
  };
  const SUB_STATUS_COLORS: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    paused: 'bg-amber-50 text-amber-700 border-amber-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
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

  const toggleExpand = (id: string) => {
    setExpandedBooking(expandedBooking === id ? null : id);
    setActiveSubTab('tracker');
  };

  const activeCount = bookings.filter(b => ACTIVE_STATUSES.includes(b.status)).length;
  const completedCount = bookings.filter(b => b.status === 'completed').length;
  const subCount = subscriptions.filter(s => s.status !== 'cancelled').length;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: bookings.length },
    { id: 'active', label: 'Active', count: activeCount },
    { id: 'subscriptions', label: 'Subscriptions', count: subCount },
    { id: 'calendar', label: 'Calendar', count: 0 },
    { id: 'completed', label: 'Completed', count: completedCount },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (trackingBookingId) {
    return <BookingTrackingPage bookingId={trackingBookingId} onBack={() => setTrackingBookingId(null)} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-5">
      {/* Wallet Banner */}
      {wallet_enabled && (
      <div
        className={`flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm transition-all duration-500 ${
          animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Wallet className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">
              Wallet balance: Le {walletBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Use your wallet to pay for any service across all divisions.</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('account')}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors text-sm whitespace-nowrap flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Top up
        </button>
      </div>
      )}

      {/* Header */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-500 delay-75 ${
          animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Bookings</h1>
          <p className="mt-0.5 text-slate-400 text-sm">
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

      {/* Summary stats - visible on all screens */}
      <div className={`grid grid-cols-3 gap-3 transition-all duration-500 delay-75 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Truck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Active</p>
            <p className="text-sm font-bold text-slate-800">{activeCount}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Recycle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Subscriptions</p>
            <p className="text-sm font-bold text-slate-800">{subCount}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2.5">
          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Completed</p>
            <p className="text-sm font-bold text-slate-800">{completedCount}</p>
          </div>
        </div>
      </div>

      {/* Tab Filters + Search */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center gap-3 transition-all duration-500 delay-100 ${
          animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Tabs - scrollable on mobile */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 flex-shrink-0 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                tab === t.id
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  tab === t.id ? 'bg-white/20' : 'bg-slate-100'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bookings..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-400 focus:border-slate-400 outline-none"
          />
        </div>
      </div>

      {/* Subscriptions sub-header */}
      {tab === 'subscriptions' && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Recurring services you've subscribed to</p>
          <button
            onClick={() => onNavigate('subscriptions')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Manage all
          </button>
        </div>
      )}

      {/* Subscriptions Tab Content */}
      {tab === 'subscriptions' && (
        filteredSubs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
              <Recycle className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              {search ? 'No results found' : 'No subscriptions yet'}
            </h3>
            <p className="mt-2 text-slate-500 text-sm">
              {search
                ? 'Try a different search term.'
                : 'Subscribe to a Smart Sort plan for regular scheduled waste collection.'}
            </p>
            {!search && (
              <button
                onClick={() => onNavigate('services')}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-colors text-sm"
              >
                <Recycle className="w-4 h-4" />
                Browse Plans
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSubs.map((sub, index) => (
              <div
                key={sub.id}
                className={`transition-all duration-500 ${
                  animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: `${150 + index * 50}ms` }}
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

      {/* Calendar Tab Content */}
      {tab === 'calendar' && (
        <UnifiedCalendar onNavigate={onNavigate} />
      )}

      {/* Bookings List (All / Active / Completed tabs) */}
      {tab !== 'subscriptions' && tab !== 'calendar' && (
        filteredBookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
              <AlertCircle className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              {search ? 'No results found' : tab === 'all' ? 'No bookings yet' : `No ${tab} bookings`}
            </h3>
            <p className="mt-2 text-slate-500 text-sm">
              {search
                ? 'Try a different search term.'
                : tab === 'all'
                ? 'Browse our services and place your first booking to get started.'
                : 'Try switching to a different tab to see more results.'}
            </p>
            {tab === 'all' && !search && (
              <button
                onClick={() => onNavigate('services')}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Browse Services
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((booking, index) => {
              const isCompleted = booking.status === 'completed';
              const hasReview = reviewedBookings.has(booking.id);
              const serviceImage = SERVICE_IMAGES[booking.services?.slug] || '/service-smart-sort.webp';
              const sc = statusColors[booking.status];
              const sd = statusDots[booking.status];
              return (
                <div
                  key={booking.id}
                  className={`bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-all duration-500 ${
                    animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  }`}
                  style={{ transitionDelay: `${150 + index * 50}ms` }}
                >
                  {/* Service image banner */}
                  <div className="relative h-14 sm:h-16 overflow-hidden">
                    <img
                      src={serviceImage}
                      alt={booking.services.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute top-2 right-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded-full border ${sc}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sd}`} />
                        {statusLabels[booking.status]}
                      </span>
                    </div>
                    <h3 className="absolute bottom-1.5 left-3 text-sm sm:text-base font-bold text-white drop-shadow">{booking.services.name}</h3>
                  </div>

                  {/* Body */}
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(booking.scheduled_date).toLocaleDateString('en-US', {
                              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                            })}
                          </span>
                          {booking.scheduled_time && (
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              {booking.scheduled_time}
                            </span>
                          )}
                          {booking.location && (
                            <span className="inline-flex items-center gap-1.5 truncate max-w-[200px]">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                              {booking.location}
                            </span>
                          )}
                        </div>
                        {booking.notes && (
                          <p className="mt-2 text-sm text-slate-400 line-clamp-1">{booking.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {(isCompleted || booking.status === 'cancelled') && (
                          <button
                            onClick={() => onRebook?.(booking)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Rebook
                          </button>
                        )}
                        {!isCompleted && booking.status !== 'cancelled' && (
                          <button
                            onClick={() => setCancelDeleteModal({ bookingId: booking.id, status: booking.status, serviceName: booking.services.name })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}
                        {(isCompleted || booking.status === 'cancelled') && (
                          <button
                            onClick={() => setCancelDeleteModal({ bookingId: booking.id, status: booking.status, serviceName: booking.services.name })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 border border-red-200 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                        {isCompleted && !hasReview && (
                          <button
                            onClick={() => setReviewModal({
                              bookingId: booking.id,
                              serviceId: booking.service_id,
                              serviceName: booking.services.name,
                            })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors"
                          >
                            <Star className="w-3.5 h-3.5" />
                            Review
                          </button>
                        )}
                        {isCompleted && hasReview && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-emerald-600 bg-emerald-50 rounded-full">
                            <Star className="w-3 h-3 fill-emerald-500" />
                            Reviewed
                          </span>
                        )}
                        <button
                          onClick={() => setTrackingBookingId(booking.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          Track
                        </button>
                        <button
                          onClick={() => toggleExpand(booking.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <Paperclip className="w-3.5 h-3.5" />
                          {expandedBooking === booking.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {expandedBooking === booking.id && (
                    <div className="border-t border-slate-100">
                      <div className="flex border-b border-slate-100">
                        {(['tracker', 'messages', 'documents'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setActiveSubTab(t)}
                            className={`flex-1 py-3 text-xs font-medium text-center transition-colors capitalize ${
                              activeSubTab === t
                                ? 'text-emerald-700 border-b-2 border-emerald-500 bg-emerald-50/50'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {t === 'tracker' && <Truck className="w-3.5 h-3.5 inline mr-1.5" />}
                            {t === 'messages' && <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />}
                            {t === 'documents' && <Paperclip className="w-3.5 h-3.5 inline mr-1.5" />}
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>
                      <div className="p-4">
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
              );
            })}
          </div>
        )
      )}

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
