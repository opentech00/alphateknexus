import { useState, useEffect, ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useAppLogo, useLoginCarouselImages, fallbackLoginImage } from '../../lib/media';

export interface AuthSlide {
  src: string;
  key?: string;
  title: string;
  desc: string;
  badge?: string;
}

const DEFAULT_SLIDES: AuthSlide[] = [
  {
    src: fallbackLoginImage('smart-sort'),
    key: 'smart-sort',
    title: 'Smart Sort — Waste Management',
    desc: 'Recycling, bin subscriptions and scheduled pickups for a cleaner city.',
    badge: 'SMART SORT',
  },
  {
    src: fallbackLoginImage('clearing-forwarding'),
    key: 'clearing-forwarding',
    title: 'Clearing & Forwarding',
    desc: 'Import and export logistics, customs clearance and cargo handling at the port.',
    badge: 'LOGISTICS',
  },
  {
    src: fallbackLoginImage('private-security'),
    key: 'private-security',
    title: 'Private Security',
    desc: 'Trained guards and surveillance for homes, offices and industrial sites.',
    badge: 'SECURITY',
  },
  {
    src: fallbackLoginImage('cleaning-janitorial'),
    key: 'cleaning-janitorial',
    title: 'Cleaning & Janitorial',
    desc: 'Professional cleaning crews for offices, estates and commercial spaces.',
    badge: 'CLEANING',
  },
  {
    src: fallbackLoginImage('procurement'),
    key: 'procurement',
    title: 'Procurement',
    desc: 'Sourcing, supply chain management and inventory for businesses.',
    badge: 'PROCUREMENT',
  },
];

interface AuthLayoutProps {
  children: ReactNode;
  slides?: AuthSlide[];
  /** Static hero content override (no carousel) for secondary screens */
  heroTitle?: string;
  heroDesc?: string;
}

export function AuthLayout({ children, slides = DEFAULT_SLIDES, heroTitle, heroDesc }: AuthLayoutProps) {
  const { url: logoUrl } = useAppLogo();
  const { images: loginImages } = useLoginCarouselImages();
  const [slideIdx, setSlideIdx] = useState(0);

  // Merge dynamic login carousel images from media library with defaults
  const resolvedSlides = slides.map((s) => ({
    ...s,
    src: (s.key && loginImages[s.key]) ? loginImages[s.key] : s.src,
  }));

  useEffect(() => {
    if (heroTitle) return; // static hero, no rotation
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % resolvedSlides.length), 5000);
    return () => clearInterval(t);
  }, [resolvedSlides.length, heroTitle]);

  const current = resolvedSlides[slideIdx];
  const showCarousel = !heroTitle;

  return (
    <div className="h-dvh flex flex-col lg:flex-row overflow-hidden">
      {/* Left Panel - Hero */}
      <div className="relative lg:flex-1 h-[26vh] lg:h-dvh flex-shrink-0 overflow-hidden bg-slate-900">
        {showCarousel ? (
          slides.map((slide, i) => (
            <img
              key={slide.src}
              src={slide.src}
              alt={slide.title}
              width={800}
              height={1200}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
                i === slideIdx ? 'opacity-40' : 'opacity-0'
              }`}
            />
          ))
        ) : (
          <img
            src={resolvedSlides[0].src}
            alt={heroTitle}
            width={800}
            height={1200}
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-emerald-900/40" />

        {/* Logo watermark */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
          <img
            src={logoUrl}
            alt="Alphatek Nexus"
            width={48}
            height={48}
            className="w-10 h-10 lg:w-12 lg:h-12 object-contain drop-shadow-lg"
          />
        </div>

        <div className="relative z-10 flex flex-col justify-end lg:justify-between h-full p-4 lg:p-12">
          {/* Brand - desktop only */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-tight">Alphatek Nexus</p>
              <p className="text-slate-300 text-xs">Client Portal</p>
            </div>
          </div>

          {/* Rotating division content */}
          <div className="max-w-lg">
            {showCarousel && current.badge && (
              <span className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-300 text-xs font-semibold tracking-wider uppercase mb-5">
                {current.badge}
              </span>
            )}
            <h2 className="text-sm lg:text-3xl xl:text-4xl font-bold text-white leading-tight mb-1 lg:mb-4">
              {heroTitle || current.title}
            </h2>
            <p className="text-slate-200 text-[11px] lg:text-base leading-snug lg:leading-relaxed line-clamp-2 lg:line-clamp-none">
              {heroDesc || current.desc}
            </p>
            <p className="hidden lg:block text-slate-300 text-sm mt-6">
              Book services, track bookings, manage payments, and access everything in one place.
            </p>
          </div>

          {/* Slide indicators */}
          {showCarousel && (
            <div className="flex gap-1.5 lg:gap-2 mt-2 lg:mt-0">
              {resolvedSlides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Show slide ${i + 1}`}
                  onClick={() => setSlideIdx(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === slideIdx ? 'w-6 lg:w-8 bg-emerald-400' : 'w-3 lg:w-4 bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 lg:max-w-md xl:max-w-lg flex items-center justify-center bg-white px-5 py-6 lg:py-8 overflow-y-auto">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-2.5 mb-5">
            <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-slate-900 font-bold text-base leading-tight">Alphatek Nexus</p>
              <p className="text-slate-500 text-xs">Client App</p>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
