import { useState, useEffect, ReactNode } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
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
    src: fallbackLoginImage('cleaning-janitorial'),
    key: 'cleaning-janitorial',
    badge: 'Cleaning & Janitorial',
    title: 'Spotless spaces, professional crews, every day.',
    desc: 'Trained janitorial teams for offices, estates, and commercial floors — scheduled, deep-clean, or on demand.',
  },
  {
    src: fallbackLoginImage('smart-sort'),
    key: 'smart-sort',
    badge: 'Smart Sort Waste',
    title: 'Less waste. Cleaner sites. Smarter pickups.',
    desc: 'Scheduled collections, recycling streams, and bin subscriptions that keep homes and businesses compliant.',
  },
  {
    src: fallbackLoginImage('private-security'),
    key: 'private-security',
    badge: 'Private Security',
    title: 'Your people. Your property. Protected.',
    desc: 'Vetted officers, 24/7 coverage, and rapid response for homes, worksites, and high-profile events.',
  },
  {
    src: fallbackLoginImage('clearing-forwarding'),
    key: 'clearing-forwarding',
    badge: 'Clearing & Forwarding',
    title: 'Cargo cleared. Deadlines met. Ports handled.',
    desc: 'Customs, documentation, and freight coordination so your shipment never sits waiting at the quay.',
  },
  {
    src: fallbackLoginImage('procurement'),
    key: 'procurement',
    badge: 'Procurement',
    title: 'The right supplies. The right price. On time.',
    desc: 'Sourced, quoted, and delivered — from office essentials to industrial materials, on your terms.',
  },
];

const SLIDE_MS = 3000;
const FADE_OUT_MS = 450;

interface AuthLayoutProps {
  children: ReactNode;
  slides?: AuthSlide[];
  heroTitle?: string;
  heroDesc?: string;
  onCta?: () => void;
  companyName?: string;
}

function AnimatedHeadline({ text, animKey, exiting }: { text: string; animKey: number; exiting: boolean }) {
  return (
    <h2
      key={animKey}
      className="text-3xl xl:text-5xl font-extrabold text-white leading-[1.12] tracking-tight"
    >
      {text.split(' ').map((word, i) => (
        <span
          key={`${animKey}-${i}-${word}`}
          className={`${exiting ? 'auth-word-out' : 'auth-word-in'} inline-block mr-[0.28em]`}
          style={{ animationDelay: exiting ? `${i * 28}ms` : `${90 + i * 55}ms` }}
        >
          {word}
        </span>
      ))}
    </h2>
  );
}

export function AuthLayout({ children, slides = DEFAULT_SLIDES, heroTitle, heroDesc, onCta, companyName = 'Alphatek Nexus' }: AuthLayoutProps) {
  const { url: logoUrl } = useAppLogo();
  const { images: loginImages } = useLoginCarouselImages();
  const [slideIdx, setSlideIdx] = useState(0);
  const [exiting, setExiting] = useState(false);

  const resolvedSlides = slides.map((s) => ({
    ...s,
    src: (s.key && loginImages[s.key]) ? loginImages[s.key] : s.src,
  }));

  useEffect(() => {
    if (heroTitle || resolvedSlides.length <= 1) return;
    setExiting(false);
    const fade = window.setTimeout(() => setExiting(true), SLIDE_MS - FADE_OUT_MS);
    const next = window.setTimeout(() => {
      setSlideIdx((i) => (i + 1) % resolvedSlides.length);
      setExiting(false);
    }, SLIDE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(next);
    };
  }, [slideIdx, resolvedSlides.length, heroTitle]);

  const goToSlide = (next: number) => {
    if (next === slideIdx || exiting) return;
    setExiting(true);
    window.setTimeout(() => {
      setSlideIdx(next);
      setExiting(false);
    }, FADE_OUT_MS);
  };

  const current = resolvedSlides[slideIdx] || resolvedSlides[0];
  const showCarousel = !heroTitle;

  return (
    <div className="h-dvh flex flex-col lg:flex-row overflow-hidden">
      <div className="relative lg:flex-[1.45] h-[26vh] lg:h-dvh flex-shrink-0 overflow-hidden bg-[#07111f]">
        {showCarousel ? (
          resolvedSlides.map((slide, i) => (
            <img
              key={slide.key || slide.src}
              src={slide.src}
              alt={slide.title}
              width={800}
              height={1200}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                i === slideIdx && !exiting ? 'opacity-100 auth-kenburns-active' : 'opacity-0'
              }`}
            />
          ))
        ) : (
          <img
            src={resolvedSlides[0].src}
            alt={heroTitle}
            width={800}
            height={1200}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-[#07111f]/55 lg:bg-gradient-to-r lg:from-[#07111f]/88 lg:via-[#07111f]/62 lg:to-[#07111f]/28" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07111f] via-transparent to-[#07111f]/35" />

        <div className="relative z-10 flex flex-col justify-end lg:justify-between h-full p-4 lg:px-12 lg:py-10 xl:px-16 xl:py-12">
          <div className="hidden lg:flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-black/20">
              <img src={logoUrl} alt={companyName} className="w-8 h-8 object-contain" />
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-tight">{companyName}</p>
              <p className="text-slate-300 text-sm">Client Portal</p>
            </div>
          </div>

          {showCarousel && current ? (
            <>
              <div className="hidden lg:block max-w-xl">
                {current.badge && (
                  <span
                    key={`badge-${slideIdx}`}
                    className={`${exiting ? 'auth-line-out' : 'auth-line-in'} inline-flex items-center gap-2 px-3.5 py-1.5 mb-6 rounded-full bg-white/10 border border-white/15 text-white text-[11px] font-semibold tracking-[0.14em] uppercase`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                    {current.badge}
                  </span>
                )}
                <AnimatedHeadline text={current.title} animKey={slideIdx} exiting={exiting} />
                <p
                  key={`desc-${slideIdx}`}
                  className={`${exiting ? 'auth-line-out' : 'auth-line-in'} mt-5 text-slate-200 text-base xl:text-lg leading-relaxed max-w-lg`}
                  style={{ animationDelay: exiting ? '40ms' : '280ms' }}
                >
                  {current.desc}
                </p>
                <p
                  key={`plat-${slideIdx}`}
                  className={`${exiting ? 'auth-line-out' : 'auth-line-in'} mt-3 text-slate-400 text-sm leading-relaxed`}
                  style={{ animationDelay: exiting ? '80ms' : '380ms' }}
                >
                  One platform for Clearing & Forwarding, Waste, Cleaning, Security, and Procurement.
                </p>
              </div>

              <div className={`lg:hidden max-w-lg ${exiting ? 'auth-line-out' : 'auth-line-in'}`}>
                <h2 className="text-sm font-bold text-white leading-tight mb-1">{current.title}</h2>
                <p className="text-slate-200 text-[11px] leading-snug line-clamp-2">{current.desc}</p>
              </div>
            </>
          ) : (
            <div className="max-w-lg">
              <h2 className="text-sm lg:text-3xl xl:text-4xl font-bold text-white leading-tight mb-1 lg:mb-4">
                {heroTitle}
              </h2>
              <p className="text-slate-200 text-[11px] lg:text-base leading-snug lg:leading-relaxed">
                {heroDesc}
              </p>
            </div>
          )}

          {showCarousel && (
            <div className="mt-3 lg:mt-0">
              <div className="flex items-center gap-2">
                {resolvedSlides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Show ${resolvedSlides[i].badge || `slide ${i + 1}`}`}
                    onClick={() => goToSlide(i)}
                    className={`relative h-1.5 rounded-full overflow-hidden transition-all duration-300 ${
                      i === slideIdx ? 'w-8 bg-white/20' : 'w-3.5 bg-white/30 hover:bg-white/50'
                    }`}
                  >
                    {i === slideIdx && <span className="auth-dot-progress absolute inset-y-0 left-0 bg-emerald-400" />}
                  </button>
                ))}
              </div>

              <div className="hidden lg:block mt-8 max-w-lg">
                <p className="text-white text-lg xl:text-xl font-semibold leading-snug">
                  Your services, bookings and payments — all in one place.
                </p>
                {onCta && (
                  <>
                <p className="mt-3 text-slate-300 text-sm leading-relaxed">
                  Create your free account to book trusted services, track every job live, receive instant quotes, and pay securely — from any device.
                </p>
                <button
                  type="button"
                  onClick={onCta}
                  className="mt-5 inline-flex items-center gap-2 text-emerald-300 text-sm font-semibold hover:text-emerald-200 transition-colors group"
                >
                  Join hundreds already moving smarter with {companyName}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 lg:max-w-md xl:max-w-[28rem] flex items-center justify-center bg-white px-5 py-6 lg:py-8 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="flex lg:hidden items-center gap-2.5 mb-5">
            <div className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
              <img src={logoUrl} alt={companyName} className="w-6 h-6 object-contain" />
            </div>
            <div>
              <p className="text-slate-900 font-bold text-base leading-tight">{companyName}</p>
              <p className="text-slate-500 text-xs">Client App</p>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
