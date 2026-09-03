import { useEffect, useState, useRef } from 'react';
import {
  Trash2, Shield, Ship, Sparkles, ShoppingCart, ArrowRight,
  Star, Zap, Clock, ChevronLeft, ChevronRight, TrendingUp,
  Wallet, Plus, Grid3X3, Info, MessageSquare, CalendarPlus,
  RefreshCw, CheckCircle2, Heart, Repeat2, PackageCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ServiceDetailModal } from '../components/ServiceDetailModal';
import { ServiceBundleSection } from '../components/ServiceBundleSection';
import type { Bundle } from '../components/ServiceBundleSection';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

const iconMap: Record<string, React.ReactNode> = {
  Trash2: <Trash2 className="w-6 h-6" />,
  Shield: <Shield className="w-6 h-6" />,
  Ship: <Ship className="w-6 h-6" />,
  Sparkles: <Sparkles className="w-6 h-6" />,
  ShoppingCart: <ShoppingCart className="w-6 h-6" />,
};

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price_range: string;
}

interface ServicesPageProps {
  onNavigate: (page: string) => void;
  onSelectService: (service: Service, mode?: 'hire' | 'quote' | 'pickup' | 'subscribe') => void;
}

interface ServiceRating {
  avg: number;
  count: number;
}

const serviceExtras: Record<string, {
  responseTime: string;
  duration: string;
  features: string[];
  image: string;
  category: string;
}> = {
  'clearing-forwarding': {
    responseTime: '48h response',
    duration: '2-5 business days',
    features: ['Customs Documentation', 'Port Clearance', 'Cargo Tracking', 'Insurance Coverage'],
    image: 'https://images.pexels.com/photos/2226458/pexels-photo-2226458.jpeg?auto=compress&cs=tinysrgb&w=600',
    category: 'C&F',
  },
  'waste-management': {
    responseTime: 'Same-day',
    duration: 'Ongoing service',
    features: ['Scheduled Collection', 'Recycling Services', 'Disposal Certification', 'Route Optimization'],
    image: 'https://images.pexels.com/photos/6964174/pexels-photo-6964174.jpeg?auto=compress&cs=tinysrgb&w=600',
    category: 'Smart Sort',
  },
  'private-security': {
    responseTime: '24h deploy',
    duration: 'Contract-based',
    features: ['Armed & Unarmed Guards', 'CCTV Monitoring', 'Access Control', 'Event Security'],
    image: 'https://images.pexels.com/photos/5699456/pexels-photo-5699456.jpeg?auto=compress&cs=tinysrgb&w=600',
    category: 'Security',
  },
  'cleaning-janitorial': {
    responseTime: 'Same-day',
    duration: 'Per session / Monthly',
    features: ['Deep Cleaning', 'Office Maintenance', 'Carpet & Upholstery', 'Sanitization'],
    image: 'https://images.pexels.com/photos/4107120/pexels-photo-4107120.jpeg?auto=compress&cs=tinysrgb&w=600',
    category: 'Cleaning',
  },
  'procurement': {
    responseTime: '48h response',
    duration: 'Project-based',
    features: ['Strategic Sourcing', 'Vendor Management', 'Cost Analysis', 'Supply Chain'],
    image: 'https://images.pexels.com/photos/4481259/pexels-photo-4481259.jpeg?auto=compress&cs=tinysrgb&w=600',
    category: 'Procurement',
  },
};

const categories = ['All', 'C&F', 'Smart Sort', 'Cleaning', 'Security', 'Procurement'];

export function ServicesPage({ onNavigate, onSelectService }: ServicesPageProps) {
  const { wallet_enabled } = useFeatureFlags();

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [bookingCounts, setBookingCounts] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Record<string, ServiceRating>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [detailService, setDetailService] = useState<Service | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [animateIn, setAnimateIn] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    const fetchServices = async () => {
      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('created_at');
      setServices(data || []);
      setLoading(false);
      setTimeout(() => setAnimateIn(true), 100);
    };
    fetchServices();
    if (wallet_enabled) {
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('wallet_transactions')
          .select('amount_sle, status')
          .eq('user_id', user.id)
          .eq('status', 'completed');
        const bal = (data || []).reduce((s: number, t: any) => s + Number(t.amount_sle), 0);
        setWalletBalance(bal);
      })();
    }
  }, []);

  useEffect(() => {
    const fetchBookingCounts = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('service_id, services(name)');
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((b: any) => {
          const name = b.services?.name;
          if (name) counts[name] = (counts[name] || 0) + 1;
        });
        setBookingCounts(counts);
      }
    };
    fetchBookingCounts();
  }, []);

  useEffect(() => {
    const fetchRatings = async () => {
      const { data } = await supabase.from('reviews').select('service_id, rating');
      if (data && data.length > 0) {
        const grouped: Record<string, { total: number; count: number }> = {};
        data.forEach((r) => {
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
    };
    fetchRatings();
  }, []);

  useEffect(() => {
    const fetchFavorites = async () => {
      const { data } = await supabase.from('favorites').select('service_id');
      if (data) {
        setFavorites(new Set(data.map((f) => f.service_id)));
      }
    };
    fetchFavorites();
  }, []);

  const toggleFavorite = async (e: React.MouseEvent, serviceId: string) => {
    e.stopPropagation();
    const isFav = favorites.has(serviceId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
    if (isFav) {
      await supabase.from('favorites').delete().eq('service_id', serviceId);
    } else {
      await supabase.from('favorites').insert({ service_id: serviceId });
    }
  };

  const handleBookService = (service: Service, mode: 'hire' | 'quote' | 'pickup' | 'subscribe' = 'hire') => {
    onSelectService(service, mode);
  };

  const handleQuoteService = (service: Service) => {
    onSelectService(service, 'quote');
  };

  const handleViewDetails = (e: React.MouseEvent, service: Service) => {
    e.stopPropagation();
    setDetailService(service);
  };

  const scrollCarousel = (dir: 'left' | 'right') => {
    if (!carouselRef.current) return;
    const amount = 340;
    carouselRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  const filteredServices = activeCategory === 'All'
    ? services
    : services.filter((s) => serviceExtras[s.slug]?.category === activeCategory);

  const topBooked = Object.entries(bookingCounts).sort((a, b) => b[1] - a[1])[0];

  const getServiceRating = (service: Service) => {
    const live = ratings[service.id];
    if (live) return live;
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-4">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Wallet Banner */}
      {wallet_enabled && (
      <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 transition-all duration-700 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <Wallet className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Wallet balance: SLE {walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-sm text-slate-500">Use your wallet to pay for any service across all divisions</p>
              </div>
            </div>
            <button onClick={() => onNavigate('account')} className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors text-sm">
              <Plus className="w-4 h-4" />
              Top up
            </button>
          </div>
      </div>
      )}

      {/* Header */}
      <section className={`pt-10 pb-6 text-center transition-all duration-700 delay-100 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-3">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-widest">Enterprise Solutions</span>
        </div>
        <h1 className="text-3xl lg:text-5xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Our Services</h1>
        <p className="mt-3 text-slate-500 dark:text-slate-400 max-w-lg mx-auto text-sm sm:text-base">
          Professional logistics, waste management, security, janitorial, and procurement services tailored for your business
        </p>
      </section>

      {/* Featured Carousel */}
      <section className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 transition-all duration-700 delay-200 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-500 fill-emerald-500" />
            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Featured Divisions</span>
          </div>
          <span className="text-xs font-semibold text-slate-400">Swipe to explore</span>
        </div>

        <div className="relative group">
          <button
            onClick={() => scrollCarousel('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>

          <div
            ref={carouselRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {services.map((service) => {
              const extras = serviceExtras[service.slug];
              const svcRating = getServiceRating(service);
              return (
                <div
                  key={service.id}
                  className="flex-shrink-0 w-72 sm:w-80 snap-start group/card cursor-pointer"
                  onClick={(e) => handleViewDetails(e, service)}
                >
                  <div className="relative h-56 w-72 sm:w-80 rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] border border-slate-200/50 dark:border-slate-800">
                    <img
                      src={extras?.image}
                      alt={service.name}
                      width={320}
                      height={224}
                      className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-900/40 to-transparent" />
                    <button
                      onClick={(e) => toggleFavorite(e, service.id)}
                      className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center hover:bg-black/60 transition-colors shadow-sm"
                    >
                      <Heart
                        className={`w-4 h-4 transition-all ${
                          favorites.has(service.id)
                            ? 'text-rose-500 fill-rose-500 scale-110'
                            : 'text-white'
                        }`
                      }
                      />
                    </button>
                    {extras && (
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/90 backdrop-blur-md text-white text-xs font-bold rounded-full shadow-sm">
                          <Zap className="w-3 h-3 fill-white" />
                          {extras.responseTime}
                        </span>
                        {svcRating && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-black/60 backdrop-blur-md text-white text-xs font-bold rounded-full border border-white/10">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            {svcRating.avg}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <p className="text-xs text-emerald-300 font-semibold uppercase tracking-wider mb-1 line-clamp-1">
                        {extras?.category || 'Service'}
                      </p>
                      <h3 className="text-xl font-bold text-white leading-snug">{service.name}</h3>
                      <div className="flex items-center gap-2 mt-2 text-emerald-400 text-sm font-semibold group-hover/card:gap-3 transition-all">
                        Explore details <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => scrollCarousel('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
          >
            <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full w-2/5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" />
        </div>
      </section>

      {/* Recommendation Banner */}
      {topBooked && (
        <section className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 transition-all duration-700 delay-300 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="glass-card rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-emerald-500/20 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Most Requested</p>
                <p className="text-slate-800 dark:text-slate-200 mt-0.5 font-medium text-sm sm:text-base">
                  You've booked <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{topBooked[0]}</span> {topBooked[1]}x -- keep your workflow running smoothly.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const svc = services.find((s) => s.name === topBooked[0]);
                if (svc) handleBookService(svc);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-white transition-all text-sm whitespace-nowrap active:scale-[0.98] shadow-md"
            >
              Book again <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* Category Filters */}
      <section className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 transition-all duration-700 delay-[400ms] ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="flex items-center gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {categories.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-200 ${
                  active
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/20 border border-emerald-500/30 scale-[1.02]'
                    : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/80'
                }`}
              >
                {cat === 'All' && <Grid3X3 className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />}
                {cat === 'C&F' && <Ship className={`w-4 h-4 ${active ? 'text-white' : 'text-blue-500'}`} />}
                {cat === 'Smart Sort' && <Trash2 className={`w-4 h-4 ${active ? 'text-white' : 'text-emerald-500'}`} />}
                {cat === 'Cleaning' && <Sparkles className={`w-4 h-4 ${active ? 'text-white' : 'text-cyan-500'}`} />}
                {cat === 'Security' && <Shield className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-500'}`} />}
                {cat === 'Procurement' && <ShoppingCart className={`w-4 h-4 ${active ? 'text-white' : 'text-amber-500'}`} />}
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* Service Cards Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredServices.map((service, index) => {
            const extras = serviceExtras[service.slug];
            const svcRating = getServiceRating(service);
            return (
              <div
                key={service.id}
                className={`glass-card glass-card-hover rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 transition-all duration-500 group relative ${
                  animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${500 + index * 100}ms` }}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="w-13 h-13 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform shadow-sm flex-shrink-0">
                      {iconMap[service.icon]}
                    </div>
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                      {service.slug === 'waste-management' ? (
                        <span
                          title="smart sort waste management"
                          className="cursor-help border-b border-dashed border-slate-400 pb-px"
                        >
                          {service.name}
                        </span>
                      ) : service.name}
                    </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">{service.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-3">
                    <button
                      onClick={(e) => toggleFavorite(e, service.id)}
                      className={`p-1.5 rounded-xl transition-all active:scale-90 ${
                        favorites.has(service.id)
                          ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                          : 'text-slate-300 dark:text-slate-600 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          favorites.has(service.id) ? 'fill-rose-500' : ''
                        }`
                      }
                      />
                    </button>
                    {extras && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/20">
                        <Zap className="w-3 h-3 fill-emerald-500" />
                        {extras.responseTime}
                      </span>
                    )}
                    {svcRating ? (
                      <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-200/50">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{svcRating.avg}</span>
                        <span className="text-[10px] text-slate-400">({svcRating.count})</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">No reviews</span>
                    )}
                  </div>
                </div>

                {/* Pricing & Duration */}
                <div className="flex gap-8 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">Pricing</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">{service.price_range}</p>
                  </div>
                  {extras && (
                    <div>
                      <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">Duration</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">{extras.duration}</p>
                    </div>
                  )}
                </div>

                {/* Features */}
                {extras && (
                  <div className="mb-5">
                    <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold mb-2">Highlights</p>
                    <div className="grid grid-cols-2 gap-2">
                      {extras.features.map((f) => (
                        <div key={f} className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {service.slug === 'waste-management' ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBookService(service, 'pickup')}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-white transition-all active:scale-[0.98] text-xs sm:text-sm shadow-sm"
                    >
                      <PackageCheck className="w-4 h-4" />
                      One-Off Pickup
                    </button>
                    <button
                      onClick={() => handleBookService(service, 'subscribe')}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-emerald-700 transition-all active:scale-[0.98] text-xs sm:text-sm shadow-md shadow-emerald-950/20"
                    >
                      <Repeat2 className="w-4 h-4" />
                      Subscribe
                    </button>
                    <button
                      onClick={() => handleQuoteService(service)}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-[0.98] text-xs sm:text-sm"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Quote
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleBookService(service)}
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md shadow-emerald-950/20 active:scale-[0.98]"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      Hire Now
                    </button>
                    <button
                      onClick={() => handleQuoteService(service)}
                      className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-[0.98]"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Quote
                    </button>
                  </div>
                )}

                {/* View Details Link */}
                <button
                  onClick={(e) => handleViewDetails(e, service)}
                  className="group/details flex items-center justify-center gap-2 w-full mt-4 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border-t border-slate-100 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all"
                >
                  <Info className="w-4 h-4 transition-transform group-hover/details:scale-110" />
                  View more details
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/details:translate-x-1" />
                </button>
              </div>
            );
          })}
        </div>

        {filteredServices.length === 0 && (
          <div className="text-center py-16">
            <RefreshCw className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No services found in this category.</p>
            <button
              onClick={() => setActiveCategory('All')}
              className="mt-3 text-emerald-600 font-medium text-sm hover:text-emerald-700"
            >
              Show all services
            </button>
          </div>
        )}
      </section>

      {/* Service Bundles */}
      <ServiceBundleSection onSelectBundle={(bundle) => onSelectService(bundle as any, 'hire')} />

      {detailService && (
        <ServiceDetailModal
          service={detailService}
          rating={getServiceRating(detailService)}
          onClose={() => setDetailService(null)}
          onHireNow={(svc) => { setDetailService(null); handleBookService(svc); }}
          onRequestQuote={(svc) => { setDetailService(null); handleQuoteService(svc); }}
        />
      )}
    </div>
  );
}
