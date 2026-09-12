import { useCallback, useEffect, useState } from 'react';
import {
  Search, ChevronRight, Ship, Trash2, Shield, Sparkles, ShoppingCart,
  ArrowRight, RefreshCw, UserCircle, ChevronDown, MapPin, Calendar,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Service } from '../../types';
import { ServiceDetailModal } from '../ServiceDetailModal';
import { useAppLogo, useServiceBrandingImages, fallbackServiceImage } from '../../lib/media';
import { useHaptics } from '../../hooks/useHaptics';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { ServiceCardSkeleton, BookingMiniSkeleton } from './Skeleton';
import { NotificationsPanel } from '../NotificationsPanel';
import { useDisplayCurrency } from '../../hooks/useDisplayCurrency';
import { ExploreServicesCarousel } from '../ExploreServicesCarousel';

interface Props {
  onNavigate: (page: string) => void;
  onSelectService: (svc: Service, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => void;
  onOpenBooking: (bookingId: string) => void;
}

type ServiceMode = 'hire' | 'quote' | 'pickup' | 'subscribe';

interface ServiceMeta {
  slug: string;
  label: string;
  icon: React.ReactNode;
  image: string;
  blurb: string;
  priceHint: string;
  special?: 'waste';
}

const SERVICE_META: ServiceMeta[] = [
  { slug: 'waste-management',    label: 'Waste Management',      icon: <Trash2 className="w-5 h-5" />,        image: fallbackServiceImage('waste-management'),    blurb: 'Smart, clean and sustainable waste solutions for a greener city.', priceHint: 'From SLE 300,000', special: 'waste' },
  { slug: 'private-security',    label: 'Private Security',      icon: <Shield className="w-5 h-5" />,       image: fallbackServiceImage('private-security'),    blurb: 'Trained professionals for your safety and peace of mind.', priceHint: 'From SLE 250,000' },
  { slug: 'clearing-forwarding', label: 'Clearing & Forwarding', icon: <Ship className="w-5 h-5" />,        image: fallbackServiceImage('clearing-forwarding'), blurb: 'Fast, reliable and global logistics solutions.', priceHint: 'From SLE 500,000' },
  { slug: 'cleaning-janitorial', label: 'Cleaning & Janitorial', icon: <Sparkles className="w-5 h-5" />,      image: fallbackServiceImage('cleaning-janitorial'), blurb: 'Spotless spaces for a healthier environment.', priceHint: 'From SLE 120,000' },
  { slug: 'procurement',         label: 'Procurement',            icon: <ShoppingCart className="w-5 h-5" />, image: fallbackServiceImage('procurement'),         blurb: 'Quality products and services when you need them.', priceHint: 'From SLE 100,000' },
];

const SERVICE_COLORS: Record<string, { chip: string; text: string; price: string; ring: string }> = {
  'clearing-forwarding': { chip: 'bg-indigo-100', text: 'text-indigo-600', price: 'text-indigo-600', ring: 'ring-indigo-200' },
  'procurement':         { chip: 'bg-amber-100',  text: 'text-amber-600',  price: 'text-amber-600',  ring: 'ring-amber-200' },
  'private-security':    { chip: 'bg-blue-100',   text: 'text-blue-600',   price: 'text-blue-600',   ring: 'ring-blue-200' },
  'cleaning-janitorial': { chip: 'bg-teal-100',   text: 'text-teal-600',   price: 'text-teal-600',   ring: 'ring-teal-200' },
  'waste-management':    { chip: 'bg-emerald-100', text: 'text-emerald-600', price: 'text-emerald-600', ring: 'ring-emerald-200' },
};

interface HomeBooking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  location: string | null;
  created_at: string;
  services: { name: string; icon: string; slug: string };
}

const statusColors: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-700',
  confirmed:   'bg-blue-50 text-blue-700',
  in_progress: 'bg-emerald-50 text-emerald-700',
  completed:   'bg-slate-100 text-slate-600',
  cancelled:   'bg-red-50 text-red-600',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function ServiceGridCard({
  meta,
  service,
  index,
  wide = false,
  onViewDetails,
  priceText,
}: {
  meta: ServiceMeta;
  service?: Service;
  index: number;
  wide?: boolean;
  onViewDetails: (svc: Service) => void;
  priceText: string;
}) {
  const { vibrate } = useHaptics();
  const colors = SERVICE_COLORS[meta.slug] || { chip: 'bg-slate-100', text: 'text-slate-600', price: 'text-slate-600', ring: 'ring-slate-200' };

  return (
    <div
      className={`bg-white dark:bg-slate-800 dark:border-slate-700 rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300 active:scale-[0.98] hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600 ${wide ? 'col-span-2' : ''}`}
      style={{ animation: `fadeInUp 0.4s ease-out ${index * 0.08}s both` }}
    >
      <div className="relative h-24 overflow-hidden">
        <img
          src={meta.image}
          alt={meta.label}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
        <div className={`absolute left-3 bottom-3 w-9 h-9 rounded-xl bg-white/95 shadow-sm ring-1 ${colors.ring} flex items-center justify-center ${colors.text}`}>
          {meta.icon}
        </div>
      </div>

      <button
        onClick={() => {
          vibrate('light');
          if (service) onViewDetails(service);
        }}
        className="w-full text-left p-3.5 no-select"
      >
        <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 leading-tight">{meta.label}</h3>
        <p className={`mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400 ${wide ? 'line-clamp-1' : 'line-clamp-2 min-h-8'}`}>{meta.blurb}</p>
        <div className="mt-2.5 flex items-center justify-between">
          <p className={`text-[13px] font-bold ${colors.price}`}>{priceText}</p>
          <span className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 inline-flex items-center justify-center">
            <ArrowRight className={`w-4 h-4 ${colors.text}`} />
          </span>
        </div>
      </button>
    </div>
  );
}

function BookingMiniCard({
  booking,
  index,
  onOpenBooking,
}: {
  booking: HomeBooking;
  index: number;
  onOpenBooking: (bookingId: string) => void;
}) {
  const dateLabel = booking.scheduled_date
    ? new Date(booking.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';

  return (
    <button
      onClick={() => onOpenBooking(booking.id)}
      className="flex-shrink-0 w-56 bg-white dark:bg-slate-800 dark:border-slate-700 rounded-2xl border border-slate-100 shadow-sm p-3.5 text-left active:scale-[0.98] hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600 transition-all no-select"
      style={{ animation: `fadeInUp 0.4s ease-out ${0.3 + index * 0.08}s both` }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{booking.services?.name || 'Service'}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{dateLabel}{booking.scheduled_time ? ` · ${booking.scheduled_time}` : ''}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColors[booking.status] || 'bg-slate-100 text-slate-600'}`}>
          {statusLabels[booking.status] || booking.status}
        </span>
      </div>
      {booking.location && (
        <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 truncate">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{booking.location}</span>
        </div>
      )}
    </button>
  );
}

export function MobileHome({ onNavigate, onSelectService, onOpenBooking }: Props) {
  const { images: serviceImages } = useServiceBrandingImages();
  const { url: logoUrl } = useAppLogo();
  const { profile } = useAuth();
  const { vibrate } = useHaptics();
  const { format } = useDisplayCurrency();
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<HomeBooking[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailService, setDetailService] = useState<Service | null>(null);
  const [showFloatHeader, setShowFloatHeader] = useState(false);

  const fetchServices = useCallback(async () => {
    const { data } = await supabase.from('services').select('*').eq('is_active', true).order('created_at');
    setServices((data as Service[]) || []);
    setLoading(false);
  }, []);

  const fetchBookings = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select('id, status, scheduled_date, scheduled_time, location, created_at, services(name, icon, slug)')
      .order('created_at', { ascending: false })
      .limit(10);
    setBookings((data as unknown as HomeBooking[]) || []);
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);
  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleRefresh = useCallback(async () => {
    vibrate('light');
    await Promise.all([fetchServices(), fetchBookings()]);
  }, [fetchServices, fetchBookings, vibrate]);

  const { ref: scrollRef, pulling, progress, refreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  useEffect(() => {
    const scroller = (scrollRef.current?.closest('main') as HTMLElement | null) || scrollRef.current;
    if (!scroller) return;
    let lastY = scroller.scrollTop;
    const onScroll = () => {
      const y = scroller.scrollTop;
      const goingUp = y < lastY - 4;
      setShowFloatHeader(y > 72 && goingUp);
      lastY = y;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const initials = (profile?.full_name || profile?.email || 'U').trim().charAt(0).toUpperCase();

  const filtered = SERVICE_META.filter(m =>
    search === '' || m.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (svc: Service, mode: ServiceMode) => {
    onSelectService(svc, mode);
  };

  const handleViewDetails = (svc: Service) => {
    setDetailService(svc);
  };

  const activeBookings = bookings.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status));
  const recentBookings = bookings.slice(0, 5);

  const pullIndicatorHeight = refreshing ? 40 : pulling ? Math.round(progress * 40) : 0;

  const priceLabel = (raw: string) => {
    const match = raw.match(/([\d,]+(?:\.\d+)?)/);
    if (!match) return raw;
    return `From ${format(Number(match[1].replace(/,/g, '')), { compact: true })}`;
  };

  const exploreSlides = SERVICE_META.map((meta) => {
    const svc = services.find(s => s.slug === meta.slug);
    return {
      slug: meta.slug,
      title: meta.label,
      blurb: meta.blurb,
      image: serviceImages[meta.slug] || meta.image,
      priceLabel: priceLabel(svc?.price_range?.trim() || meta.priceHint),
      cta: 'Explore',
    };
  });

  return (
    <div ref={scrollRef} className="flex flex-col min-h-full bg-[#f5f8ff] dark:bg-slate-950 black:bg-black no-tap-highlight pb-8">
      <div className="home-float-wrap">
      <div className={`home-float-header ${showFloatHeader ? 'is-visible' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img src={logoUrl} alt="Alphatek Nexus" className="h-7 w-auto object-contain flex-shrink-0" />
            <p className="text-sm font-bold text-[#173362] dark:text-slate-100 truncate">Hello, {firstName}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationsPanel />
          </div>
        </div>
      </div>
      </div>

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

      <div className="home-safe-header pb-3" style={{ animation: 'fadeInUp 0.4s ease-out both' }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={logoUrl} alt="Alphatek Nexus" className="h-9 w-auto object-contain flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-lg leading-5 font-bold text-[#173362] tracking-tight truncate">
                Alphatek <span className="text-emerald-500">Nexus</span>
              </p>
              <p className="text-[11px] text-slate-500 truncate">Smart Solutions. A Safer Tomorrow.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationsPanel />
            <button
              onClick={() => onNavigate('account')}
              className="h-9 pl-1 pr-0.5 rounded-full border border-slate-200 bg-white inline-flex items-center gap-1 shadow-sm active:scale-95 transition-transform"
              aria-label="Open profile"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold inline-flex items-center justify-center">
                  {initials || <UserCircle className="w-4 h-4" />}
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>
        <h1 className="text-4xl leading-tight font-bold text-[#173362] dark:text-slate-100 tracking-tight">
          Hello, {firstName} <span className="align-middle text-2xl">👋</span>
        </h1>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-1">What service do you need today?</p>
      </div>

      {/* Search */}
      <div className="px-5 mb-4" style={{ animation: 'fadeInUp 0.4s ease-out 0.08s both' }}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search for a service..."
            className="w-full pl-11 pr-4 py-3.5 bg-white/95 dark:bg-slate-800 dark:border-slate-700 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm no-tap-highlight transition-all dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
      </div>

      {search === '' && (
        <div className="mx-5 mb-5" style={{ animation: 'fadeInUp 0.5s ease-out 0.15s both' }}>
          <ExploreServicesCarousel
            slides={exploreSlides}
            onViewAll={() => onNavigate('services')}
            onSelect={(slug) => {
              const svc = services.find(s => s.slug === slug);
              if (svc) handleViewDetails(svc);
              else onNavigate('services');
            }}
          />
        </div>
      )}

      {/* Services Grid */}
      <div className="px-5 pb-4" style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-2xl font-bold text-[#173362] dark:text-slate-100">Our Services</h2>
            <p className="text-xs text-slate-500 mt-0.5">Choose a service and get it done, fast!</p>
          </div>
          <button
            onClick={() => onNavigate('services')}
            className="text-sm text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 active:scale-95 transition-transform no-select"
          >
            View All <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <ServiceCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((meta, idx) => {
              const svc = services.find(s => s.slug === meta.slug);
              return (
                <ServiceGridCard
                  key={meta.slug}
                  meta={meta}
                  service={svc}
                  index={idx}
                  wide={meta.slug === 'procurement'}
                  onViewDetails={handleViewDetails}
                  priceText={priceLabel(svc?.price_range?.trim() || meta.priceHint)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Previous bookings section */}
      <div className="px-5 pb-5" style={{ animation: 'fadeInUp 0.5s ease-out 0.3s both' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-[#173362] dark:text-slate-100">Previous Bookings</h2>
            {activeBookings.length > 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{activeBookings.length} active request{activeBookings.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          {bookings.length > 0 && (
            <button
              onClick={() => onNavigate('bookings')}
              className="text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-0.5 active:scale-95 transition-transform no-select"
            >
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex gap-3 overflow-hidden pb-2 -mx-5 px-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <BookingMiniSkeleton key={i} />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <button
            onClick={() => { vibrate('light'); onNavigate('services'); }}
            className="w-full bg-white dark:bg-slate-800 dark:border-slate-700 rounded-2xl border border-dashed border-slate-200 p-6 text-center active:scale-[0.99] transition-transform no-select hover:border-blue-300 hover:bg-blue-50/30 dark:hover:border-blue-700 dark:hover:bg-blue-900/20"
            style={{ animation: 'fadeInUp 0.4s ease-out 0.4s both' }}
          >
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-xl mb-3">
              <Calendar className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No bookings yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Browse our services and make your first booking.</p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-blue-600 dark:text-blue-400">
              Browse Services <ArrowRight className="w-3 h-3" />
            </span>
          </button>
        ) : (
          <div className="flex gap-3 overflow-x-auto mobile-scroll pb-2 -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
            {recentBookings.map((booking, idx) => (
              <BookingMiniCard
                key={booking.id}
                booking={booking}
                index={idx}
                onOpenBooking={onOpenBooking}
              />
            ))}
          </div>
        )}
      </div>

      {/* Service Detail Modal */}
      {detailService && (
        <ServiceDetailModal
          service={detailService}
          onClose={() => setDetailService(null)}
          onHireNow={(svc) => { setDetailService(null); handleSelect(svc as unknown as Service, 'hire'); }}
          onRequestQuote={(svc) => { setDetailService(null); handleSelect(svc as unknown as Service, 'quote'); }}
        />
      )}
    </div>
  );
}
