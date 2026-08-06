import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, Truck, Shield, ShoppingCart, Recycle, ArrowRight,
  CheckCircle2, Star,
} from 'lucide-react';
import { useAppLogo, useServiceBrandingImages, fallbackServiceImage } from '../../lib/media';

interface SplashScreenProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

const SLIDES = [
  {
    id: 0,
    badge: 'Welcome to AlphaTek Nexus',
    heading: (
      <>
        <span className="text-slate-900">Smart Services.</span>
        <br />
        <span className="text-blue-600">Seamless Life.</span>
      </>
    ),
    body: 'Book trusted services, make secure payments and manage everything in one place.',
    icon: Sparkles,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    accent: 'from-blue-50 via-white to-white',
    bubbleColor: 'bg-blue-100',
    image: '/splash_screen.png',
    features: ['5 services in one app', 'Secure payments', 'Real-time tracking'],
  },
  {
    id: 1,
    badge: 'Cleaning & Janitorial',
    heading: (
      <>
        <span className="text-slate-900">Spotless Spaces,</span>
        <br />
        <span className="text-emerald-600">Every Time.</span>
      </>
    ),
    body: 'Professional cleaning crews for homes, offices, and commercial properties — scheduled on your terms.',
    icon: Sparkles,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    accent: 'from-emerald-50 via-white to-white',
    bubbleColor: 'bg-emerald-100',
    image: fallbackServiceImage('cleaning-janitorial'),
    imageKey: 'cleaning-janitorial',
    features: ['Residential & Commercial', 'Certified cleaners', 'Flexible scheduling'],
  },
  {
    id: 2,
    badge: 'Clearing & Forwarding',
    heading: (
      <>
        <span className="text-slate-900">Freight Cleared,</span>
        <br />
        <span className="text-sky-600">Stress-Free.</span>
      </>
    ),
    body: 'Expert customs clearance and cargo forwarding so your goods move across borders without delays.',
    icon: Truck,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    accent: 'from-sky-50 via-white to-white',
    bubbleColor: 'bg-sky-100',
    image: fallbackServiceImage('clearing-forwarding'),
    imageKey: 'clearing-forwarding',
    features: ['Import & Export', 'Customs documentation', 'Door-to-door delivery'],
  },
  {
    id: 3,
    badge: 'Private Security',
    heading: (
      <>
        <span className="text-slate-900">Professional</span>
        <br />
        <span className="text-slate-700">Protection.</span>
      </>
    ),
    body: 'Licensed security personnel and surveillance solutions for your home, event, or business.',
    icon: Shield,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-700',
    accent: 'from-slate-50 via-white to-white',
    bubbleColor: 'bg-slate-200',
    image: fallbackServiceImage('private-security'),
    imageKey: 'private-security',
    features: ['Armed & unarmed guards', 'Event security', '24/7 availability'],
  },
  {
    id: 4,
    badge: 'Smart Sort — Waste',
    heading: (
      <>
        <span className="text-slate-900">Greener City,</span>
        <br />
        <span className="text-green-600">Smarter Sort.</span>
      </>
    ),
    body: 'Scheduled waste pickup, smart sorting, and impact dashboards — making recycling effortless for you.',
    icon: Recycle,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    accent: 'from-green-50 via-white to-white',
    bubbleColor: 'bg-green-100',
    image: fallbackServiceImage('waste-management'),
    imageKey: 'waste-management',
    features: ['Weekly pickups', 'Impact dashboard', 'Subscription plans'],
  },
  {
    id: 5,
    badge: 'Procurement',
    heading: (
      <>
        <span className="text-slate-900">Source Smarter,</span>
        <br />
        <span className="text-amber-600">Save More.</span>
      </>
    ),
    body: 'Submit procurement requests and let us source the best products and suppliers on your behalf.',
    icon: ShoppingCart,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    accent: 'from-amber-50 via-white to-white',
    bubbleColor: 'bg-amber-100',
    image: fallbackServiceImage('procurement'),
    imageKey: 'procurement',
    features: ['Request management', 'Vendor vetting', 'Transparent pricing'],
  },
] as const;

const TOTAL = SLIDES.length;
const AUTO_INTERVAL = 4500;

export function SplashScreen({ onGetStarted, onLogin }: SplashScreenProps) {
  const { url: logoUrl } = useAppLogo();
  const { images: serviceImages } = useServiceBrandingImages();
  const [current, setCurrent] = useState(0);
  const [animDir, setAnimDir] = useState<'next' | 'prev' | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [imageLoaded, setImageLoaded] = useState<Record<number, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number | null>(null);

  const goTo = useCallback((idx: number, dir: 'next' | 'prev') => {
    if (transitioning) return;
    setTransitioning(true);
    setAnimDir(dir);
    setTimeout(() => {
      setCurrent(idx);
      setAnimDir(null);
      setTimeout(() => setTransitioning(false), 50);
    }, 320);
  }, [transitioning]);

  const advance = useCallback(() => {
    goTo((current + 1) % TOTAL, 'next');
  }, [current, goTo]);

  // Auto-advance
  useEffect(() => {
    timerRef.current = setTimeout(advance, AUTO_INTERVAL);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [advance]);

  const handleDotClick = (i: number) => {
    if (i === current) return;
    goTo(i, i > current ? 'next' : 'prev');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) goTo((current + 1) % TOTAL, 'next');
    else goTo((current - 1 + TOTAL) % TOTAL, 'prev');
  };

  const slide = SLIDES[current];
  const Icon = slide.icon;
  const slideImage = ('imageKey' in slide && slide.imageKey && serviceImages[slide.imageKey]) || slide.image;

  const exitClass = animDir === 'next'
    ? 'animate-splash-exit-left'
    : animDir === 'prev'
    ? 'animate-splash-exit-right'
    : '';
  const enterClass = !animDir && !transitioning ? 'animate-splash-enter' : '';

  return (
    <div
      className="flex flex-col h-[100dvh] overflow-hidden bg-white select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Slide area ── */}
      <div className={`relative flex-1 overflow-hidden bg-gradient-to-b ${slide.accent} transition-all duration-500`}>

        {/* Decorative background blob */}
        <div
          className={`absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl transition-all duration-500 ${slide.bubbleColor}`}
        />
        <div
          className={`absolute bottom-0 -left-10 w-48 h-48 rounded-full opacity-30 blur-2xl transition-all duration-500 ${slide.bubbleColor}`}
        />

        {/* Content */}
        <div className={`relative h-full flex flex-col ${transitioning && animDir ? exitClass : enterClass}`}>

          {/* Logo & badge row */}
          <div className="flex items-center justify-between px-6 pt-10 pb-2">
            <img
              src={logoUrl}
              alt="AlphaTek Nexus"
              className="h-8 object-contain"
            />
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${slide.iconBg} ${slide.iconColor}`}>
              {slide.badge}
            </span>
          </div>

          {/* Hero image */}
          <div className="relative flex-1 flex items-end justify-center overflow-hidden px-0">
            <img
              key={slide.id}
              src={slideImage}
              alt={slide.badge}
              className={`w-full max-h-[52vh] object-cover object-top transition-opacity duration-300 ${imageLoaded[slide.id] ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(prev => ({ ...prev, [slide.id]: true }))}
            />

            {/* Text overlay at bottom of image */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/90 to-transparent pt-16 pb-4 px-6">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${slide.iconBg}`}>
                  <Icon className={`w-4 h-4 ${slide.iconColor}`} />
                </div>
                <h2 className="text-2xl font-extrabold leading-tight">{slide.heading}</h2>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed mb-3">{slide.body}</p>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-1.5">
                {slide.features.map((f) => (
                  <span
                    key={f}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${slide.iconBg} ${slide.iconColor}`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom panel ── */}
      <div className="flex-shrink-0 bg-white px-6 pt-4 pb-8 safe-area-pb">
        {/* Dots */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => handleDotClick(i)}
              className={`transition-all duration-300 rounded-full ${
                i === current
                  ? 'w-6 h-2 bg-blue-600'
                  : 'w-2 h-2 bg-slate-200 hover:bg-slate-300'
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        {/* Rating row */}
        <div className="flex items-center justify-center gap-1 mb-5">
          {[1,2,3,4,5].map(s => (
            <Star key={s} className="w-4 h-4 text-amber-400 fill-amber-400" />
          ))}
          <span className="text-xs text-slate-400 ml-1">Trusted by businesses in Sierra Leone</span>
        </div>

        {/* CTA buttons */}
        <button
          onClick={onGetStarted}
          className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl text-base hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 mb-3"
        >
          Get Started
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={onLogin}
          className="w-full py-4 border-2 border-blue-600 text-blue-600 font-bold rounded-2xl text-base hover:bg-blue-50 active:scale-[0.98] transition-all"
        >
          Login
        </button>
      </div>
    </div>
  );
}
