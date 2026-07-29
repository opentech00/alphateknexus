import { useEffect, useState, useMemo } from 'react';
import {
  Search, Ship, Trash2, Shield, Sparkles, ShoppingCart,
  Loader2, CalendarPlus, MessageSquare, PackageCheck, Repeat2,
  Info, ArrowRight, Heart, Star, Zap, Clock, CheckCircle2,
  TrendingUp, Wallet, Plus, ChevronDown, X, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Service } from '../../types';
import { ServiceDetailModal } from '../ServiceDetailModal';

interface Props {
  onSelectService: (svc: Service, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => void;
  onNavigate: (page: string) => void;
}

type ServiceMode = 'hire' | 'quote' | 'pickup' | 'subscribe';

interface ServiceMeta {
  slug: string;
  label: string;
  shortLabel: string;
  icon: typeof Ship;
  image: string;
  category: string;
  responseTime: string;
  duration: string;
  features: string[];
  defaultMode: ServiceMode;
  hasQuote: boolean;
  hasHire: boolean;
  special?: 'waste';
  colors: { bg: string; text: string; gradient: string; badge: string; btn: string };
}

const SERVICE_META: ServiceMeta[] = [
  {
    slug: 'clearing-forwarding', label: 'Clearing & Forwarding', shortLabel: 'Clearing',
    icon: Ship, image: '/service-clearing-forwarding.webp', category: 'C&F',
    responseTime: '48h response', duration: '2–5 business days',
    features: ['Customs Documentation', 'Port Clearance', 'Cargo Tracking', 'Insurance'],
    defaultMode: 'hire', hasQuote: true, hasHire: true,
    colors: { bg: 'bg-blue-50', text: 'text-blue-600', gradient: 'from-blue-500 to-blue-700', badge: 'bg-blue-500', btn: 'bg-blue-600 hover:bg-blue-700' },
  },
  {
    slug: 'procurement', label: 'Procurement', shortLabel: 'Procurement',
    icon: ShoppingCart, image: '/service-procurement.webp', category: 'Procurement',
    responseTime: '48h response', duration: 'Project-based',
    features: ['Strategic Sourcing', 'Vendor Management', 'Cost Analysis', 'Supply Chain'],
    defaultMode: 'quote', hasQuote: true, hasHire: true,
    colors: { bg: 'bg-violet-50', text: 'text-violet-600', gradient: 'from-violet-500 to-violet-700', badge: 'bg-violet-500', btn: 'bg-violet-600 hover:bg-violet-700' },
  },
  {
    slug: 'private-security', label: 'Private Security', shortLabel: 'Security',
    icon: Shield, image: '/service-private-security.webp', category: 'Security',
    responseTime: '24h deploy', duration: 'Contract-based',
    features: ['Armed & Unarmed Guards', 'CCTV Monitoring', 'Access Control', 'Event Security'],
    defaultMode: 'hire', hasQuote: true, hasHire: true,
    colors: { bg: 'bg-slate-100', text: 'text-slate-700', gradient: 'from-slate-600 to-slate-800', badge: 'bg-slate-700', btn: 'bg-slate-800 hover:bg-slate-900' },
  },
  {
    slug: 'cleaning-janitorial', label: 'Cleaning & Janitorial', shortLabel: 'Cleaning',
    icon: Sparkles, image: '/service-cleaning-janitorial.webp', category: 'Cleaning',
    responseTime: 'Same-day', duration: 'Per session / Monthly',
    features: ['Deep Cleaning', 'Office Maintenance', 'Carpet & Upholstery', 'Sanitization'],
    defaultMode: 'hire', hasQuote: true, hasHire: true,
    colors: { bg: 'bg-cyan-50', text: 'text-cyan-600', gradient: 'from-cyan-500 to-cyan-700', badge: 'bg-cyan-500', btn: 'bg-cyan-600 hover:bg-cyan-700' },
  },
  {
    slug: 'waste-management', label: 'Smart Sort (Waste)', shortLabel: 'Smart Sort',
    icon: Trash2, image: '/service-smart-sort.webp', category: 'Smart Sort',
    responseTime: 'Same-day', duration: 'Ongoing service',
    features: ['Scheduled Collection', 'Recycling', 'Disposal Certs', 'Route Tracking'],
    defaultMode: 'pickup', hasQuote: true, hasHire: true, special: 'waste',
    colors: { bg: 'bg-emerald-50', text: 'text-emerald-600', gradient: 'from-emerald-500 to-emerald-700', badge: 'bg-emerald-500', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  },
];

const CATEGORIES = ['All', 'C&F', 'Smart Sort', 'Cleaning', 'Security', 'Procurement'] as const;
const CATEGORY_ICONS: Record<string, typeof Ship> = {
  All: Sparkles, 'C&F': Ship, 'Smart Sort': Trash2, Cleaning: Sparkles, Security: Shield, Procurement: ShoppingCart,
};

interface ServiceRating { avg: number; count: number }

export function MobileServicesPage({ onSelectService, onNavigate }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Record<string, ServiceRating>>({});
  const [bookingCounts, setBookingCounts] = useState<Record<string, number>>({});
  const [walletBalance, setWalletBalance] = useState(0);
  const [detailService, setDetailService] = useState<Service | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [animateIn, setAnimateIn] = useState(false);

  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: svcData, error: svcErr } = await supabase
        .from('services').select('*').eq('is_active', true).order('created_at');
      if (svcErr) { setFetchError('Failed to load services. Pull down to retry.'); setLoading(false); return; }
      setServices((svcData as Service[]) || []);
      setLoading(false);
      setTimeout(() => setAnimateIn(true), 80);

      const { data: favData } = await supabase.from('favorites').select('service_id');
      if (favData) setFavorites(new Set(favData.map(f => f.service_id)));

      const { data: reviewData } = await supabase.from('reviews').select('service_id, rating');
      if (reviewData && reviewData.length > 0) {
        const grouped: Record<string, { total: number; count: number }> = {};
        reviewData.forEach(r => {
          if (!grouped[r.service_id]) grouped[r.service_id] = { total: 0, count: 0 };
          grouped[r.service_id].total += r.rating;
          grouped[r.service_id].count += 1;
        });
        const result: Record<string, ServiceRating> = {};
        Object.entries(grouped).forEach(([id, { total, count }]) => {
          result[id] = { avg: Math.round((total / count) * 10) / 10, count };
        });
        setRatings(result);
      }

      const { data: bookingData } = await supabase.from('bookings').select('service_id, services(name)');
      if (bookingData) {
        const counts: Record<string, number> = {};
        bookingData.forEach((b: any) => {
          const name = b.services?.name;
          if (name) counts[name] = (counts[name] || 0) + 1;
        });
        setBookingCounts(counts);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setWalletBalance(0); return; }
      const { data: walletData } = await supabase
        .from('wallet_transactions').select('amount_sle, status').eq('user_id', user.id).eq('status', 'completed');
      const bal = (walletData || []).reduce((s: number, t: any) => s + Number(t.amount_sle), 0);
      setWalletBalance(bal);
    })();
  }, []);

  const toggleFavorite = async (serviceId: string) => {
    const isFav = favorites.has(serviceId);
    setFavorites(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(serviceId); else next.add(serviceId);
      return next;
    });
    if (isFav) {
      await supabase.from('favorites').delete().eq('service_id', serviceId);
    } else {
      await supabase.from('favorites').insert({ service_id: serviceId });
    }
  };

  const filteredMeta = useMemo(() => {
    return SERVICE_META.filter(m => {
      const catMatch = activeCategory === 'All' || m.category === activeCategory;
      const searchMatch = search === '' ||
        m.label.toLowerCase().includes(search.toLowerCase()) ||
        m.shortLabel.toLowerCase().includes(search.toLowerCase());
      return catMatch && searchMatch;
    });
  }, [activeCategory, search]);

  const topBooked = Object.entries(bookingCounts).sort((a, b) => b[1] - a[1])[0];

  const getServiceRating = (service: Service): ServiceRating | null => ratings[service.id] ?? null;

  const handleBook = (service: Service, mode: ServiceMode) => onSelectService(service, mode);
  const handleQuote = (service: Service) => onSelectService(service, 'quote');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (fetchError && services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-sm text-slate-600 dark:text-slate-300">{fetchError}</p>
        <button onClick={() => { setFetchError(''); setLoading(true); window.location.reload(); }} className="mt-4 px-4 py-2 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg active:scale-95 transition-transform">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50 dark:bg-slate-950 black:bg-black no-tap-highlight">
      {/* Wallet strip */}
      <div
        className="mx-4 mt-3 rounded-2xl bg-white dark:bg-slate-800 dark:border-slate-700 border border-slate-100 shadow-sm p-3.5 flex items-center justify-between active:scale-[0.99] transition-transform"
        style={{ animation: 'fadeInUp 0.4s ease-out both' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <Wallet className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              SLE {walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Wallet balance</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('account')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold rounded-xl active:scale-95 transition-transform flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Top up
        </button>
      </div>

      {/* Search */}
      <div className="px-4 mt-3" style={{ animation: 'fadeInUp 0.4s ease-out 0.06s both' }}>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search services..."
            className="w-full pl-10 pr-10 py-3 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm no-tap-highlight transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-90 transition-transform"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div
        className="px-4 mt-3 flex items-center gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', animation: 'fadeInUp 0.4s ease-out 0.12s both' }}
      >
        {CATEGORIES.map(cat => {
          const Icon = CATEGORY_ICONS[cat];
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
                active
                  ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-md'
                  : 'bg-white dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {cat}
            </button>
          );
        })}
      </div>

      {/* Recommendation banner */}
      {topBooked && search === '' && activeCategory === 'All' && (
        <div
          className="mx-4 mt-3 rounded-2xl bg-white dark:bg-slate-800 dark:border-slate-700 border border-slate-100 shadow-sm p-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform"
          style={{ animation: 'fadeInUp 0.4s ease-out 0.18s both' }}
        >
          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Recommended</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-tight">
              You've booked <span className="font-bold">{topBooked[0]}</span> {topBooked[1]}× — keep going
            </p>
          </div>
          <button
            onClick={() => {
              const svc = services.find(s => s.name === topBooked[0]);
              if (svc) handleBook(svc, 'hire');
            }}
            className="flex items-center gap-1 px-3 py-2 bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold rounded-xl active:scale-95 transition-transform flex-shrink-0"
          >
            Book again <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Service cards */}
      <div className="px-4 mt-4 pb-8 space-y-3">
        {filteredMeta.map((meta, index) => {
          const service = services.find(s => s.slug === meta.slug);
          const svcRating = service ? getServiceRating(service) : null;
          const isFav = service ? favorites.has(service.id) : false;
          const isExpanded = expandedSlug === meta.slug;
          const Icon = meta.icon;

          return (
            <div
              key={meta.slug}
              className={`bg-white dark:bg-slate-800 dark:border-slate-700 rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300 ${
                animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              } ${isExpanded ? 'shadow-md' : 'hover:shadow-md'}`}
              style={{ transitionDelay: `${index * 60}ms` }}
            >
              {/* Image header */}
              <div className={`relative h-28 ${meta.colors.bg} overflow-hidden`}>
                <img
                  src={meta.image}
                  alt={meta.label}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className={`absolute inset-0 bg-gradient-to-br ${meta.colors.gradient} opacity-15`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

                {/* Favorite */}
                {service && (
                  <button
                    onClick={() => toggleFavorite(service.id)}
                    className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Heart className={`w-4 h-4 transition-all ${isFav ? 'text-rose-500 fill-rose-500 scale-110' : 'text-white'}`} />
                  </button>
                )}

                {/* Response time badge */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-full">
                  <Zap className={`w-3 h-3 ${meta.colors.text}`} />
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-800">{meta.responseTime}</span>
                </div>

                {/* Icon + title overlay */}
                <div className="absolute bottom-2.5 left-3 flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-white rounded-xl shadow-sm flex items-center justify-center">
                    <Icon className={`w-5 h-5 ${meta.colors.text}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white drop-shadow leading-tight">{meta.label}</h3>
                    {svcRating && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span className="text-[11px] font-semibold text-white drop-shadow">{svcRating.avg}</span>
                        <span className="text-[10px] text-white/70">({svcRating.count})</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Body — tap to expand */}
              <button
                onClick={() => setExpandedSlug(isExpanded ? null : meta.slug)}
                className="w-full flex items-center justify-between px-4 py-3 text-left no-select"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Pricing</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">{service?.price_range || '—'}</p>
                  </div>
                  <div className="h-8 w-px bg-slate-100 dark:bg-slate-700" />
                  <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Duration</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">{meta.duration}</p>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 animate-slide-in-from-bottom">
                  {service?.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">{service.description}</p>
                  )}

                  {/* Features */}
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {meta.features.map(f => (
                      <div key={f} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className={`w-3.5 h-3.5 ${meta.colors.text} flex-shrink-0`} />
                        {f}
                      </div>
                    ))}
                  </div>

                  {/* View details */}
                  <button
                    onClick={() => service && setDetailService(service)}
                    className="group/details w-full flex items-center justify-center gap-1.5 py-2.5 mb-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-xl active:scale-[0.98] hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all no-select border border-blue-100 dark:border-blue-800/50"
                  >
                    <Info className="w-3.5 h-3.5 transition-transform group-hover/details:scale-110" />
                    View more details
                    <ArrowRight className="w-3 h-3 transition-transform group-hover/details:translate-x-0.5" />
                  </button>

                  {/* Action buttons */}
                  {meta.special === 'waste' ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => service && handleBook(service, 'pickup')}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform no-select text-sm shadow-sm"
                      >
                        <PackageCheck className="w-4 h-4" />
                        One-Off Pickup
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => service && handleBook(service, 'subscribe')}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-emerald-600 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform no-select text-sm"
                        >
                          <Repeat2 className="w-3.5 h-3.5" />
                          Subscribe
                        </button>
                        <button
                          onClick={() => service && handleQuote(service)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-white dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 border border-slate-200 text-slate-700 font-medium rounded-xl active:scale-[0.98] transition-transform no-select text-sm"
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
                          onClick={() => service && handleBook(service, meta.defaultMode)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform no-select text-sm shadow-sm ${meta.colors.btn}`}
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          {meta.defaultMode === 'quote' ? 'Request Quote' : 'Hire Now'}
                        </button>
                      )}
                      {meta.hasQuote && meta.defaultMode !== 'quote' && (
                        <button
                          onClick={() => service && handleQuote(service)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-white dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 border border-slate-200 text-slate-700 font-medium rounded-xl active:scale-[0.98] transition-transform no-select text-sm"
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
        })}

        {/* Empty state */}
        {filteredMeta.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-3">
              <Search className="w-7 h-7 text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No services found</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Try a different search or category</p>
            <button
              onClick={() => { setSearch(''); setActiveCategory('All'); }}
              className="mt-3 text-xs font-medium text-blue-600 dark:text-blue-400 active:scale-95 transition-transform"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailService && (
        <ServiceDetailModal
          service={detailService}
          rating={getServiceRating(detailService)}
          onClose={() => setDetailService(null)}
          onHireNow={(svc) => { setDetailService(null); handleBook(svc as Service, 'hire'); }}
          onRequestQuote={(svc) => { setDetailService(null); handleQuote(svc as Service); }}
        />
      )}
    </div>
  );
}
