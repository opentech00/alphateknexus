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
    (async () => {
      const { data } = await supabase
        .from('wallet_transactions')
        .select('amount_sle, status')
        .eq('status', 'completed');
      const bal = (data || []).reduce((s: number, t: any) => s + Number(t.amount_sle), 0);
      setWalletBalance(bal);
    })();
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

      {/* Header */}
      <section className={`pt-10 pb-6 text-center transition-all duration-700 delay-100 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">Our Services</h1>
        <p className="mt-3 text-slate-500 max-w-lg mx-auto">
          Choose from our professional services designed for your business
        </p>
      </section>

      {/* Featured Carousel */}
      <section className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 transition-all duration-700 delay-200 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Featured</span>
          </div>
          <span className="text-sm text-slate-400">Swipe for more</span>
        </div>

        <div className="relative group">
          <button
            onClick={() => scrollCarousel('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-50"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
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
                  <div className="relative h-52 w-72 sm:w-80 rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
                    <img
                      src={extras?.image}
                      alt={service.name}
                      width={320}
                      height={208}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/30 to-transparent" />
                    <button
                      onClick={(e) => toggleFavorite(e, service.id)}
                      className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors"
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
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 text-white text-xs font-medium rounded-full">
                          <Zap className="w-3 h-3" />
                          {extras.responseTime}
                        </span>
                        {svcRating && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-xs font-medium rounded-full">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            {svcRating.avg}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <p className="text-xs text-slate-300 uppercase tracking-wider mb-1 line-clamp-1">
                        {service.description?.slice(0, 50)}...
                      </p>
                      <h3 className="text-lg font-bold text-white">{service.name}</h3>
                      <div className="flex items-center gap-2 mt-2 text-emerald-300 text-sm font-medium group-hover/card:gap-3 transition-all">
                        Explore <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => scrollCarousel('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-50"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full w-2/5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" />
        </div>
      </section>

      {/* Recommendation Banner */}
      {topBooked && (
        <section className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 transition-all duration-700 delay-300 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Recommended for you</p>
                <p className="text-slate-700 mt-0.5">
                  You've booked <span className="font-bold">{topBooked[0]}</span> {topBooked[1]}x -- keep the momentum.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const svc = services.find((s) => s.name === topBooked[0]);
                if (svc) handleBookService(svc);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors text-sm whitespace-nowrap"
            >
              Book again <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* Category Filters */}
      <section className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 transition-all duration-700 delay-[400ms] ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="flex items-center gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                activeCategory === cat
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {cat === 'All' && <Grid3X3 className="w-3.5 h-3.5" />}
              {cat === 'C&F' && <Ship className="w-3.5 h-3.5" />}
              {cat === 'Smart Sort' && <Trash2 className="w-3.5 h-3.5" />}
              {cat === 'Cleaning' && <Sparkles className="w-3.5 h-3.5" />}
              {cat === 'Security' && <Shield className="w-3.5 h-3.5" />}
              {cat === 'Procurement' && <ShoppingCart className="w-3.5 h-3.5" />}
              {cat}
            </button>
          ))}
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
                className={`bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl hover:border-emerald-200 transition-all duration-500 group ${
                  animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${500 + index * 100}ms` }}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-700 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                      {iconMap[service.icon]}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                      {service.slug === 'waste-management' ? (
                        <span
                          title="smart sort waste management"
                          className="cursor-help border-b border-dashed border-slate-400 pb-px"
                        >
                          {service.name}
                        </span>
                      ) : service.name}
                    </h3>
                      <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{service.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-3">
                    <button
                      onClick={(e) => toggleFavorite(e, service.id)}
                      className={`p-1.5 rounded-lg transition-all active:scale-90 ${
                        favorites.has(service.id)
                          ? 'text-rose-500 hover:bg-rose-50'
                          : 'text-slate-300 hover:text-rose-400 hover:bg-rose-50'
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
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                        <Zap className="w-3 h-3" />
                        {extras.responseTime}
                      </span>
                    )}
                    {svcRating ? (
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span className="text-sm font-semibold text-amber-600">{svcRating.avg}</span>
                        <span className="text-xs text-slate-400">({svcRating.count})</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No reviews yet</span>
                    )}
                  </div>
                </div>

                {/* Pricing & Duration */}
                <div className="flex gap-8 mb-4 pb-4 border-b border-slate-100">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Pricing</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{service.price_range}</p>
                  </div>
                  {extras && (
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Duration</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">{extras.duration}</p>
                    </div>
                  )}
                </div>

                {/* Features */}
                {extras && (
                  <div className="mb-5">
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-2">Features</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {extras.features.map((f) => (
                        <div key={f} className="flex items-center gap-2 text-sm text-slate-600">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          {f}
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
                      className="flex items-center justify-center gap-1.5 px-4 py-3 bg-[#1e293b] text-white font-semibold rounded-xl hover:bg-[#0f172a] transition-all active:scale-[0.98] text-sm"
                    >
                      <PackageCheck className="w-4 h-4" />
                      One-Off Pickup
                    </button>
                    <button
                      onClick={() => handleBookService(service, 'subscribe')}
                      className="flex items-center justify-center gap-1.5 px-4 py-3 bg-teal-500 text-white font-semibold rounded-xl hover:bg-teal-600 transition-all active:scale-[0.98] text-sm"
                    >
                      <Repeat2 className="w-4 h-4" />
                      Subscribe
                    </button>
                    <button
                      onClick={() => handleQuoteService(service)}
                      className="flex items-center justify-center gap-1.5 px-4 py-3 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.98] text-sm"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Quote
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleBookService(service)}
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98]"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      Hire Now
                    </button>
                    <button
                      onClick={() => handleQuoteService(service)}
                      className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.98]"
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
