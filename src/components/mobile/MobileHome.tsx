import { useCallback, useEffect, useState } from 'react';
import {
  Search, ChevronRight,
  ArrowRight, RefreshCw, UserCircle, ChevronDown, MapPin, Calendar,
  Wallet, FileText, Inbox, Clock,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Service } from '../../types';
import { ServiceDetailModal } from '../ServiceDetailModal';
import { useAppLogo } from '../../lib/media';
import { BrandLogo } from '../BrandLogo';
import { useHaptics } from '../../hooks/useHaptics';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { ServiceCardSkeleton, BookingMiniSkeleton } from './Skeleton';
import { NotificationsPanel } from '../NotificationsPanel';
import { ExploreServicesCarousel } from '../ExploreServicesCarousel';
import { CampaignPromoBanner } from '../CampaignPromoBanner';
import { DueInvoicesBanner } from '../portal/DueInvoicesBanner';
import { SmartSortHomeCard } from '../SubscriptionLifecycle';
import { useServiceCatalog } from '../../hooks/useServiceCatalog';
import { CATALOG_ICONS } from '../../lib/catalogIcons';
import { CATALOG_CATEGORIES, type CatalogItem } from '../../lib/serviceCatalog';
import { JobProgress } from '../client/JobProgress';

interface Props {
  onNavigate: (page: string) => void;
  onSelectService: (svc: Service, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => void;
  onOpenBooking: (bookingId: string) => void;
}

type ServiceMode = 'hire' | 'quote' | 'pickup' | 'subscribe';

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
  item,
  index,
  wide = false,
  onViewDetails,
}: {
  item: CatalogItem;
  index: number;
  wide?: boolean;
  onViewDetails: (svc: Service) => void;
}) {
  const { vibrate } = useHaptics();
  const colors = item.meta.colors;
  const Icon = CATALOG_ICONS[item.meta.icon];

  return (
    <button
      type="button"
      onClick={() => {
        vibrate('light');
        onViewDetails(item.service);
      }}
      className={`group bg-white dark:bg-slate-800 dark:border-slate-700 rounded-3xl border border-slate-100 shadow-sm overflow-hidden text-left transition-all duration-300 active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-200 dark:hover:border-slate-600 motion-safe:animate-[fadeInUp_0.45s_ease-out_both] no-select ${wide ? 'col-span-2 flex' : ''}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className={`relative overflow-hidden bg-gradient-to-br ${colors.gradient} ${wide ? 'w-[42%] min-h-[8.5rem] flex-shrink-0' : 'h-32'}`}>
        <img
          src={item.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover media-photo transition-transform duration-500 group-active:scale-105"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">
          <Clock className="w-3 h-3" />
          {item.meta.responseTime}
        </span>
        <div className={`absolute left-2.5 bottom-2.5 w-9 h-9 rounded-xl bg-white/95 shadow-sm ring-1 ${colors.ring} flex items-center justify-center ${colors.text}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className={`p-3.5 ${wide ? 'flex flex-1 flex-col justify-center' : ''}`}>
        <h3 className={`text-[15px] font-bold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2 ${wide ? '' : 'min-h-10'}`}>{item.meta.label}</h3>
        <p className="mt-1 text-[12px] leading-4 text-slate-500 dark:text-slate-400 line-clamp-2 min-h-8">{item.meta.blurb}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className={`text-[13px] font-bold ${colors.price} truncate`}>{item.priceLabel}</p>
          <span className={`w-8 h-8 rounded-full ${colors.bg} inline-flex items-center justify-center flex-shrink-0 transition-transform group-active:translate-x-0.5`}>
            <ArrowRight className={`w-4 h-4 ${colors.text}`} />
          </span>
        </div>
      </div>
    </button>
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
      className="w-full bg-white dark:bg-slate-800 dark:border-slate-700 rounded-2xl border border-slate-100 shadow-sm p-3.5 text-left active:scale-[0.99] hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600 transition-all motion-safe:animate-[fadeInUp_0.4s_ease-out_both] no-select"
      style={{ animationDelay: `${index * 50}ms` }}
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
      <JobProgress status={booking.status} compact />
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
  const { catalog, services, loading, reload } = useServiceCatalog();
  const { url: logoUrl } = useAppLogo();
  const { profile } = useAuth();
  const { vibrate } = useHaptics();
  const [bookings, setBookings] = useState<HomeBooking[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<(typeof CATALOG_CATEGORIES)[number]>('All');
  const [detailService, setDetailService] = useState<Service | null>(null);
  const [showFloatHeader, setShowFloatHeader] = useState(false);

  const fetchBookings = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select('id, status, scheduled_date, scheduled_time, location, created_at, services(name, icon, slug)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);
    setBookings((data as unknown as HomeBooking[]) || []);
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleRefresh = useCallback(async () => {
    vibrate('light');
    await Promise.all([reload(), fetchBookings()]);
  }, [reload, fetchBookings, vibrate]);

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

  const filtered = catalog.filter((item) => {
    const matchesCategory = category === 'All' || item.meta.category === category;
    const q = search.trim().toLowerCase();
    const matchesSearch = q === ''
      || item.meta.label.toLowerCase().includes(q)
      || item.meta.shortLabel.toLowerCase().includes(q)
      || item.service.name.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const handleSelect = (svc: Service, mode: ServiceMode) => {
    onSelectService(svc, mode);
  };

  const handleViewDetails = (svc: Service) => {
    setDetailService(svc);
  };

  const activeBookings = bookings.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status));
  const recentBookings = bookings.slice(0, 5);

  const pullIndicatorHeight = refreshing ? 40 : pulling ? Math.round(progress * 40) : 0;

  const exploreSlides = catalog.map((item) => ({
    slug: item.service.slug,
    title: item.meta.label,
    blurb: item.meta.blurb,
    image: item.image,
    priceLabel: item.priceLabel,
    cta: 'Explore',
  }));

  return (
    <div ref={scrollRef} className="flex flex-col min-h-full bg-[#f5f8ff] dark:bg-slate-950 black:bg-black no-tap-highlight pb-8">
      <div className="home-float-wrap">
      <div className={`home-float-header ${showFloatHeader ? 'is-visible' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BrandLogo src={logoUrl} alt="Alphatek Nexus" className="h-7 w-auto flex-shrink-0" />
            <p className="text-sm font-bold text-[#173362] dark:text-slate-100 truncate">Hello, {firstName}</p>
          </div>
          <NotificationsPanel />
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

      <div className="home-safe-header pb-3 motion-safe:animate-[fadeInUp_0.4s_ease-out_both]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo src={logoUrl} alt="Alphatek Nexus" className="home-brand-logo h-8 w-auto flex-shrink-0" />
            <p className="text-[15px] leading-5 font-bold text-[#173362] dark:text-slate-100 tracking-tight truncate">
              Alphatek <span className="text-emerald-500">Nexus</span>
            </p>
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
      </div>

      <div className="px-4 sm:px-5 space-y-4">
        <DueInvoicesBanner onOpen={() => onNavigate('billing')} />
        <SmartSortHomeCard onNavigate={onNavigate} />

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#173362] via-[#1d4f94] to-emerald-600 p-5 text-white shadow-lg shadow-blue-900/20 motion-safe:animate-[fadeInUp_0.45s_ease-out_both]">
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-emerald-300/20" />
          <h1 className="text-[1.65rem] leading-tight font-bold tracking-tight">
            Hello, {firstName}
          </h1>
          <p className="mt-2 text-sm font-semibold leading-5 text-white">
            Smart Solutions. A Safer Tomorrow.
          </p>
          <p className="mt-1 max-w-[18rem] text-sm leading-5 text-white/80">
            Security, cleaning, logistics, and waste — one team, booked in minutes.
          </p>
          <button
            type="button"
            onClick={() => { vibrate('light'); onNavigate('services'); }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#173362] shadow-sm active:scale-[0.98] transition-transform"
          >
            Browse services <ArrowRight className="w-4 h-4" />
          </button>
        </section>

        <div className="grid grid-cols-3 gap-2.5 motion-safe:animate-[fadeInUp_0.45s_ease-out_0.05s_both]">
          {([
            ['payments', 'Payments', Wallet, 'bg-emerald-50 text-emerald-700'],
            ['quotes', 'Quotes', FileText, 'bg-blue-50 text-blue-700'],
            ['support', 'Inbox', Inbox, 'bg-amber-50 text-amber-700'],
          ] as const).map(([id, label, Icon, tone]) => (
            <button
              key={id}
              type="button"
              onClick={() => { vibrate('light'); onNavigate(id); }}
              className="min-h-[76px] rounded-2xl bg-white border border-slate-200/80 px-2 py-3 text-center shadow-sm active:scale-[0.98] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span className={`mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="block text-[13px] font-semibold text-slate-800">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-5 mt-4 mb-3 motion-safe:animate-[fadeInUp_0.4s_ease-out_0.1s_both]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cleaning, security, logistics..."
            className="w-full pl-11 pr-4 py-3.5 bg-white/95 dark:bg-slate-800 dark:border-slate-700 border border-slate-200 rounded-2xl text-base sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-sm no-tap-highlight transition-all dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
      </div>

      {search === '' && (
        <div className="mb-4 flex gap-2 overflow-x-auto px-4 sm:px-5 pb-1" style={{ scrollbarWidth: 'none' }}>
          {CATALOG_CATEGORIES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => { vibrate('selection'); setCategory(name); }}
              className={`flex-shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                category === name
                  ? 'bg-[#173362] text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {search === '' && category === 'All' && (
        <div className="px-4 sm:px-5 mb-5 space-y-4 motion-safe:animate-[fadeInUp_0.5s_ease-out_both]">
          <CampaignPromoBanner onNavigate={onNavigate} onSelectService={onSelectService} />
          <ExploreServicesCarousel
            slides={exploreSlides}
            animatedBackdrop
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
      <div className="px-4 sm:px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold text-[#173362] dark:text-slate-100">Our Services</h2>
            <p className="text-xs text-slate-500 mt-0.5">{filtered.length} ready to book</p>
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
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">No services in this filter</p>
            <button type="button" onClick={() => { setCategory('All'); setSearch(''); }} className="mt-2 text-sm font-semibold text-emerald-700">
              Show all services
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((item, idx) => (
                <ServiceGridCard
                  key={item.service.id}
                  item={item}
                  index={idx}
                  wide={idx === filtered.length - 1 && filtered.length % 2 === 1}
                  onViewDetails={handleViewDetails}
                />
            ))}
          </div>
        )}
      </div>

      {/* Previous bookings section */}
      <div className="px-4 sm:px-5 pb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold text-[#173362] dark:text-slate-100">Your bookings</h2>
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
          <div className="space-y-2.5">
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
          onHireNow={(svc, mode) => { setDetailService(null); handleSelect(svc as unknown as Service, mode || 'hire'); }}
          onRequestQuote={(svc) => { setDetailService(null); handleSelect(svc as unknown as Service, 'quote'); }}
        />
      )}
    </div>
  );
}
