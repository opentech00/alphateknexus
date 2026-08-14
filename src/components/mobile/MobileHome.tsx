import { useEffect, useState } from 'react';
import {
  Search, ChevronRight, Ship, Trash2, Shield, Sparkles, ShoppingCart,
  Loader2, CalendarPlus, MessageSquare, PackageCheck, Repeat2,
  ChevronDown, Info, MapPin, Calendar, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Service } from '../../types';
import { ServiceDetailModal } from '../ServiceDetailModal';
import { useServiceBrandingImages, fallbackServiceImage } from '../../lib/media';

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
  defaultMode: ServiceMode;
  hasQuote: boolean;
  hasHire: boolean;
  special?: 'waste';
}

const SERVICE_META: ServiceMeta[] = [
  { slug: 'clearing-forwarding', label: 'Clearing & Forwarding', icon: <Ship className="w-5 h-5" />,        image: fallbackServiceImage('clearing-forwarding'), defaultMode: 'hire',  hasQuote: true, hasHire: true },
  { slug: 'procurement',         label: 'Procurement',            icon: <ShoppingCart className="w-5 h-5" />, image: fallbackServiceImage('procurement'),         defaultMode: 'quote', hasQuote: true, hasHire: true },
  { slug: 'private-security',    label: 'Private Security',      icon: <Shield className="w-5 h-5" />,       image: fallbackServiceImage('private-security'),    defaultMode: 'hire',  hasQuote: true, hasHire: true },
  { slug: 'cleaning-janitorial', label: 'Cleaning & Janitorial', icon: <Sparkles className="w-5 h-5" />,      image: fallbackServiceImage('cleaning-janitorial'), defaultMode: 'hire',  hasQuote: true, hasHire: true },
  { slug: 'waste-management',    label: 'Smart Sort (Waste)',    icon: <Trash2 className="w-5 h-5" />,        image: fallbackServiceImage('waste-management'),    defaultMode: 'pickup', hasQuote: true, hasHire: true, special: 'waste' },
];

const SERVICE_COLORS: Record<string, { bg: string; text: string; gradient: string }> = {
  'clearing-forwarding': { bg: 'bg-blue-50',   text: 'text-blue-600',   gradient: 'from-blue-500 to-blue-600' },
  'procurement':         { bg: 'bg-violet-50', text: 'text-violet-600', gradient: 'from-violet-500 to-violet-600' },
  'private-security':    { bg: 'bg-slate-100', text: 'text-slate-700',  gradient: 'from-slate-600 to-slate-800' },
  'cleaning-janitorial': { bg: 'bg-teal-50',   text: 'text-teal-600',   gradient: 'from-teal-500 to-teal-600' },
  'waste-management':    { bg: 'bg-emerald-50', text: 'text-emerald-600', gradient: 'from-emerald-500 to-emerald-600' },
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

function HeroIllustration() {
  return (
    <svg viewBox="0 0 120 110" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="65" y="20" width="44" height="80" rx="4" fill="#1e3a6e" opacity="0.6" />
      <rect x="72" y="28" width="8" height="8" rx="1" fill="#93c5fd" opacity="0.8" />
      <rect x="84" y="28" width="8" height="8" rx="1" fill="#93c5fd" opacity="0.5" />
      <rect x="96" y="28" width="8" height="8" rx="1" fill="#93c5fd" opacity="0.8" />
      <rect x="72" y="42" width="8" height="8" rx="1" fill="#93c5fd" opacity="0.5" />
      <rect x="84" y="42" width="8" height="8" rx="1" fill="#93c5fd" opacity="0.9" />
      <rect x="96" y="42" width="8" height="8" rx="1" fill="#93c5fd" opacity="0.6" />
      <rect x="72" y="56" width="8" height="8" rx="1" fill="#93c5fd" opacity="0.8" />
      <rect x="84" y="56" width="8" height="8" rx="1" fill="#93c5fd" opacity="0.4" />
      <rect x="96" y="56" width="8" height="8" rx="1" fill="#93c5fd" opacity="0.7" />
      <ellipse cx="52" cy="102" rx="14" ry="4" fill="#1e3a6e" opacity="0.2" />
      <rect x="47" y="84" width="5" height="18" rx="2.5" fill="#f97316" />
      <rect x="54" y="84" width="5" height="18" rx="2.5" fill="#f97316" />
      <rect x="42" y="56" width="22" height="30" rx="6" fill="#f97316" />
      <rect x="32" y="58" width="12" height="5" rx="2.5" fill="#f97316" transform="rotate(15 32 58)" />
      <rect x="63" y="58" width="14" height="5" rx="2.5" fill="#f97316" transform="rotate(-20 63 58)" />
      <rect x="74" y="55" width="12" height="15" rx="2" fill="white" opacity="0.9" />
      <rect x="77" y="59" width="6" height="1.5" rx="0.75" fill="#3b82f6" />
      <rect x="77" y="62" width="6" height="1.5" rx="0.75" fill="#3b82f6" />
      <rect x="77" y="65" width="4" height="1.5" rx="0.75" fill="#3b82f6" />
      <circle cx="53" cy="46" r="12" fill="#fed7aa" />
      <ellipse cx="53" cy="36" rx="12" ry="6" fill="#92400e" />
      <circle cx="49" cy="47" r="1.5" fill="#78350f" />
      <circle cx="57" cy="47" r="1.5" fill="#78350f" />
      <path d="M49 52 Q53 55 57 52" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function ServiceGridCard({
  meta,
  service,
  index,
  onSelect,
  onViewDetails,
}: {
  meta: ServiceMeta;
  service?: Service;
  index: number;
  onSelect: (svc: Service, mode: ServiceMode) => void;
  onViewDetails: (svc: Service) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = SERVICE_COLORS[meta.slug] || { bg: 'bg-slate-100', text: 'text-slate-600', gradient: 'from-slate-500 to-slate-600' };

  const handleAction = (mode: ServiceMode) => {
    if (service) onSelect(service, mode);
  };

  return (
    <div
      className={`bg-white dark:bg-slate-800 dark:border-slate-700 rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300 active:scale-[0.98] hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600 ${expanded ? 'col-span-2' : ''}`}
      style={{ animation: `fadeInUp 0.4s ease-out ${index * 0.08}s both` }}
    >
      {/* Service image banner */}
      <div className={`relative h-20 ${colors.bg} overflow-hidden`}>
        <img
          src={meta.image}
          alt={meta.label}
          className="absolute inset-0 w-full h-full object-cover opacity-90"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className={`absolute inset-0 bg-gradient-to-br ${colors.gradient} opacity-10`} />
        {/* Icon badge */}
        <div className={`absolute bottom-2 left-2.5 w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center ${colors.text}`}>
          {meta.icon}
        </div>
      </div>

      {/* Card body */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex flex-col items-center text-center px-3 pt-2.5 pb-3 no-select"
      >
        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2 min-h-[2rem]">{meta.label}</h3>
        {service?.price_range && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 truncate w-full">{service.price_range}</p>
        )}
        <div className={`mt-1.5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDown className={`w-3.5 h-3.5 ${colors.text}`} />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 animate-slide-in-from-bottom">
          {service?.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed text-center">{service.description}</p>
          )}

          {/* View Details button */}
          <button
            onClick={() => service && onViewDetails(service)}
            className="group/details w-full flex items-center justify-center gap-1.5 py-2.5 mb-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-xl active:scale-[0.98] hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all no-select border border-blue-100 dark:border-blue-800/50"
          >
            <Info className="w-3.5 h-3.5 transition-transform group-hover/details:scale-110" />
            View more details
            <ArrowRight className="w-3 h-3 transition-transform group-hover/details:translate-x-0.5" />
          </button>

          {meta.special === 'waste' ? (
            <div className="space-y-2">
              <button
                onClick={() => handleAction('pickup')}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform no-select text-sm"
              >
                <PackageCheck className="w-4 h-4" />
                One-Off Pickup
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction('subscribe')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform no-select text-sm"
                >
                  <Repeat2 className="w-3.5 h-3.5" />
                  Subscribe
                </button>
                <button
                  onClick={() => handleAction('quote')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl active:scale-[0.98] transition-transform no-select text-sm"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Get Quote
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {meta.hasHire && (
                <button
                  onClick={() => handleAction('hire')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform no-select text-sm shadow-sm hover:bg-blue-700"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Hire Now
                </button>
              )}
              {meta.hasQuote && (
                <button
                  onClick={() => handleAction('quote')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl active:scale-[0.98] transition-transform no-select text-sm hover:border-slate-300"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Get Quote
                </button>
              )}
            </div>
          )}
        </div>
      )}
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
  const { profile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<HomeBooking[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailService, setDetailService] = useState<Service | null>(null);

  useEffect(() => {
    supabase.from('services').select('*').eq('is_active', true).order('created_at').then(({ data }) => {
      setServices((data as Service[]) || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase
      .from('bookings')
      .select('id, status, scheduled_date, scheduled_time, location, created_at, services(name, icon, slug)')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setBookings((data as unknown as HomeBooking[]) || []);
      });
  }, []);

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

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

  return (
    <div className="flex flex-col min-h-full bg-gray-50 dark:bg-slate-950 black:bg-black no-tap-highlight">
      {/* Greeting */}
      <div className="px-5 pt-5 pb-3 safe-area-pt" style={{ animation: 'fadeInUp 0.4s ease-out both' }}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Hello, {firstName}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">What service do you need today?</p>
      </div>

      {/* Search */}
      <div className="px-5 mb-4" style={{ animation: 'fadeInUp 0.4s ease-out 0.08s both' }}>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search services..."
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 dark:border-slate-700 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm no-tap-highlight transition-all dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
      </div>

      {/* Hero Banner */}
      {search === '' && (
        <div className="mx-5 mb-5" style={{ animation: 'fadeInUp 0.5s ease-out 0.15s both' }}>
          <div className="relative bg-gradient-to-br from-blue-600 via-blue-600 to-blue-800 rounded-2xl overflow-hidden shadow-lg shadow-blue-600/20 transition-transform active:scale-[0.99]">
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-blue-500/30 rounded-full animate-pulse" style={{ animationDuration: '3s' }} />
            <div className="absolute -bottom-6 right-16 w-20 h-20 bg-blue-800/20 rounded-full" />
            <div className="relative flex items-end min-h-[130px]">
              <div className="flex-1 p-5 pb-5">
                <p className="text-white font-bold text-lg leading-snug mb-1">
                  Reliable. Professional.<br />Trusted.
                </p>
                <p className="text-blue-100 text-xs leading-relaxed mb-4">
                  We deliver exceptional services<br />that you can count on.
                </p>
                <button
                  onClick={() => onNavigate('services')}
                  className="inline-flex items-center gap-1.5 bg-white text-blue-700 text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors active:scale-95 shadow-sm no-select"
                >
                  Explore Services
                </button>
              </div>
              <div className="w-28 h-28 flex-shrink-0 mr-1">
                <HeroIllustration />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Services Grid */}
      <div className="px-5 pb-6" style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Our Services</h2>
          <button
            onClick={() => onNavigate('services')}
            className="text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-0.5 active:scale-95 transition-transform no-select"
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
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
                  onSelect={handleSelect}
                  onViewDetails={handleViewDetails}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* My Bookings / Requests section */}
      <div className="px-5 pb-8" style={{ animation: 'fadeInUp 0.5s ease-out 0.3s both' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">My Bookings</h2>
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

        {bookings.length === 0 ? (
          <button
            onClick={() => onNavigate('services')}
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
