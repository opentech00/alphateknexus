import { useCallback, useEffect, useState } from 'react';
import {
  Calendar, MapPin, Clock, AlertCircle, Plus,
  ChevronDown, Star, RotateCcw,
  Search, Ban, Trash2, RefreshCw, Eye, ChevronRight, CalendarClock, UserCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { MessageThread } from '../MessageThread';
import { DocumentUpload } from '../DocumentUpload';
import { ReviewModal } from '../ReviewModal';
import { BookingTracker } from '../BookingTracker';
import { CancelDeleteBookingModal } from '../CancelDeleteBookingModal';
import { useHaptics } from '../../hooks/useHaptics';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useAppLogo, useServiceBrandingImages, fallbackServiceImage } from '../../lib/media';
import { BookingCardSkeleton } from './Skeleton';
import { SwipeableBookingCard } from './SwipeableBookingCard';
import { NotificationsPanel } from '../NotificationsPanel';
import { useAuth } from '../../contexts/AuthContext';

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

interface Props {
  onNavigate: (page: string) => void;
  onRebook?: (booking: Booking) => void;
  initialExpandId?: string | null;
}

const statusConfig: Record<string, { label: string; badge: string; dot: string }> = {
  pending:         { label: 'Pending',     badge: 'text-amber-700 bg-amber-50 border-amber-200',     dot: 'bg-amber-500' },
  pending_review:  { label: 'Upcoming',    badge: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  approved:        { label: 'Upcoming',    badge: 'text-teal-700 bg-teal-50 border-teal-200',       dot: 'bg-teal-500' },
  confirmed:       { label: 'Confirmed',   badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  in_progress:     { label: 'Upcoming',    badge: 'text-blue-700 bg-blue-50 border-blue-200',       dot: 'bg-blue-500' },
  completed:       { label: 'Completed',   badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled:       { label: 'Cancelled',   badge: 'text-violet-700 bg-violet-50 border-violet-200', dot: 'bg-violet-500' },
};

type Tab = 'all' | 'upcoming' | 'completed' | 'cancelled';
const ACTIVE_STATUSES = ['pending', 'pending_review', 'approved', 'confirmed', 'in_progress'];

export function MobileBookingsPage({ onNavigate, onRebook, initialExpandId }: Props) {
  const { profile } = useAuth();
  const { vibrate } = useHaptics();
  const { images: serviceImages } = useServiceBrandingImages();
  const { url: logoUrl } = useAppLogo();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [expandedBooking, setExpandedBooking] = useState<string | null>(initialExpandId ?? null);
  const [activeSubTab, setActiveSubTab] = useState<'tracker' | 'messages' | 'documents'>('tracker');
  const [reviewModal, setReviewModal] = useState<{ bookingId: string; serviceId: string; serviceName: string } | null>(null);
  const [reviewedBookings, setReviewedBookings] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState('');
  const [cancelDeleteModal, setCancelDeleteModal] = useState<{ bookingId: string; status: string; serviceName: string } | null>(null);
  const profileInitial = (profile?.full_name || profile?.email || 'U').trim().charAt(0).toUpperCase();

  const fetchBookings = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, scheduled_date, scheduled_time, location, contact_name, contact_phone, contact_email, notes, created_at, service_id, details, deleted_at, cancellation_reason, services(name, icon, slug)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { setFetchError('Failed to load bookings. Pull down to retry.'); setLoading(false); return; }
    setBookings((data as unknown as Booking[]) || []);
    setLoading(false);
  }, []);

  const fetchReviews = useCallback(async () => {
    const { data } = await supabase.from('reviews').select('booking_id');
    if (data) setReviewedBookings(new Set(data.map((r) => r.booking_id)));
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchReviews();
  }, [fetchBookings, fetchReviews]);

  const filteredBookings = bookings.filter((b) => {
    if (tab === 'upcoming' && !ACTIVE_STATUSES.includes(b.status)) return false;
    if (tab === 'completed' && b.status !== 'completed') return false;
    if (tab === 'cancelled' && b.status !== 'cancelled') return false;
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

  const handleRefresh = useCallback(async () => {
    vibrate('light');
    await Promise.all([fetchBookings(), fetchReviews()]);
  }, [fetchBookings, fetchReviews, vibrate]);

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
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'All Bookings', count: bookings.length },
    { id: 'upcoming', label: 'Upcoming', count: activeCount },
    { id: 'completed', label: 'Completed', count: completedCount },
    { id: 'cancelled', label: 'Cancelled', count: cancelledCount },
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
    <div ref={scrollRef} className="flex flex-col min-h-full pb-8">
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
      <div className="px-4 pt-3 pb-2 safe-area-pt">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <img src={logoUrl} alt="Alphatek Nexus" className="h-9 w-auto object-contain" />
            <div>
              <p className="text-lg leading-5 font-bold text-[#173362] tracking-tight">Alphatek <span className="text-emerald-500">Nexus</span></p>
              <p className="text-[11px] text-slate-500">Smart Solutions. A Safer Tomorrow.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationsPanel />
            <button
              onClick={() => onNavigate('account')}
              className="h-9 pl-1 pr-0.5 rounded-full border border-slate-200 bg-white inline-flex items-center gap-1 shadow-sm active:scale-95 transition-transform"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold inline-flex items-center justify-center">
                  {profileInitial || <UserCircle className="w-4 h-4" />}
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-[#173362]">My Bookings</h1>
            <p className="text-base text-slate-500 mt-0.5">View and manage your service bookings</p>
          </div>
          <button
            onClick={() => onNavigate('services')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-white border border-slate-200 text-[13px] font-semibold text-[#173362] shadow-sm active:scale-95"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            All Services
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
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

      {/* Filter chips */}
      <div className="px-4 pb-3">
        <div className="flex gap-2 overflow-x-auto mobile-scroll" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { vibrate('light'); setTab(t.id); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
                tab === t.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                tab === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700'
              }`}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pb-6">
        {filteredBookings.length === 0 ? (
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
              const serviceTag = booking.services?.slug
                ?.split('-')
                .map((s) => s[0].toUpperCase() + s.slice(1))
                .join(' ') || 'Service Request';
              const priceValue = booking.details?.price_sle ? `SLE ${Number(booking.details.price_sle).toLocaleString()}` : 'SLE —';
              const priceUnit = booking.status === 'confirmed' ? '(Monthly)' : '(One-time)';

              return (
                <SwipeableBookingCard
                  key={booking.id}
                  onRebook={() => onRebook?.(booking)}
                  onCancel={() => setCancelDeleteModal({ bookingId: booking.id, status: booking.status, serviceName: booking.services.name })}
                  showRebook={canRebook}
                  showCancel={canCancel}
                >
                  <div
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-2.5 transition-all"
                    style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.06}s both` }}
                  >
                    <div className="flex gap-2.5">
                      <img
                        src={serviceImage}
                        alt={booking.services.name}
                        className="w-24 h-20 rounded-xl object-cover flex-shrink-0"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-bold text-[#173362] leading-tight truncate">{booking.services.name}</h3>
                            <p className="text-xs text-slate-500 truncate">{serviceTag}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${sc.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                        </div>

                        <div className="mt-1.5 grid gap-0.5">
                          <p className="text-xs text-slate-600 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {new Date(booking.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <p className="text-xs text-slate-600 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {booking.scheduled_time || 'Time not set'}
                          </p>
                          <p className="text-xs text-slate-600 flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{booking.location || 'Location not set'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 min-w-[92px]">
                        <ChevronRight className="w-4 h-4 text-slate-300 ml-auto mb-2" />
                        <p className="text-xl font-bold text-[#173362] leading-none">{priceValue}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{priceUnit}</p>
                      </div>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => toggleExpand(booking.id)}
                        className="h-8 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 transition-transform"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Details
                      </button>

                      {canRebook ? (
                        <button
                          onClick={() => onRebook?.(booking)}
                          className="h-8 rounded-lg bg-white text-blue-700 border border-blue-200 text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Book Again
                        </button>
                      ) : canCancel ? (
                        <button
                          onClick={() => setCancelDeleteModal({ bookingId: booking.id, status: booking.status, serviceName: booking.services.name })}
                          className="h-8 rounded-lg bg-white text-red-600 border border-red-200 text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Cancel Booking
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleExpand(booking.id)}
                          className="h-8 rounded-lg bg-white text-blue-700 border border-blue-200 text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          Reschedule
                        </button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="mt-2.5 border-t border-slate-100 dark:border-slate-700 pt-2.5">
                        <div className="flex gap-1 rounded-lg bg-slate-50 dark:bg-slate-700/30 p-1">
                          {(['tracker', 'messages', 'documents'] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => { vibrate('light'); setActiveSubTab(t); }}
                              className={`flex-1 py-2 text-[11px] font-semibold rounded-md capitalize transition-colors ${
                                activeSubTab === t
                                  ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-sm'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/50">
                          {activeSubTab === 'tracker' ? (
                            <BookingTracker bookingId={booking.id} currentStatus={booking.status} />
                          ) : activeSubTab === 'messages' ? (
                            <MessageThread bookingId={booking.id} />
                          ) : (
                            <DocumentUpload bookingId={booking.id} serviceSlug={booking.services?.slug} />
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-end gap-2">
                          {isCompleted && !hasReview && (
                            <button
                              onClick={() => setReviewModal({
                                bookingId: booking.id,
                                serviceId: booking.service_id,
                                serviceName: booking.services.name,
                              })}
                              className="h-8 px-3 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold inline-flex items-center gap-1 active:scale-95 transition-transform"
                            >
                              <Star className="w-3.5 h-3.5" />
                              Add Review
                            </button>
                          )}
                          {(isCompleted || booking.status === 'cancelled') && (
                            <button
                              onClick={() => setCancelDeleteModal({ bookingId: booking.id, status: booking.status, serviceName: booking.services.name })}
                              className="h-8 px-3 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold inline-flex items-center gap-1 active:scale-95 transition-transform"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </SwipeableBookingCard>
              );
            })}
          </div>
        )}

        <button
          onClick={() => onNavigate('services')}
          className="mt-4 w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600 px-4 py-3 text-white shadow-md active:scale-[0.99] transition-transform"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-left">
              <span className="block text-sm font-bold">Need a new booking?</span>
              <span className="block text-xs text-white/90">Easily book any service in a few taps.</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-700">
              Book Now <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </span>
        </button>
      </div>

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
