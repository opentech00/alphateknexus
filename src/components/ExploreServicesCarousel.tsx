import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

export interface ExploreSlide {
  slug: string;
  title: string;
  blurb: string;
  image: string;
  priceLabel: string;
  cta?: string;
}

export function ExploreServicesCarousel({
  slides,
  onSelect,
  onViewAll,
}: {
  slides: ExploreSlide[];
  onSelect: (slug: string) => void;
  onViewAll?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(0);
  const paused = useRef(false);
  const count = slides.length;

  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % count);
    }, 5200);
    return () => window.clearInterval(id);
  }, [count]);

  if (count === 0) return null;

  const slide = slides[index] || slides[0];

  return (
    <div
      className="relative rounded-3xl overflow-hidden shadow-lg shadow-blue-900/20"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onTouchStart={(e) => { paused.current = true; touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (dx > 40) setIndex((i) => (i - 1 + count) % count);
        else if (dx < -40) setIndex((i) => (i + 1) % count);
        window.setTimeout(() => { paused.current = false; }, 2500);
      }}
    >
      <img
        src={slide.image}
        alt={slide.title}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0c3486]/92 via-[#1158d4]/78 to-[#2f8bf0]/40" />
      <div className="relative p-4 min-h-[200px] flex flex-col justify-between">
        <div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-400 text-white">
            Explore Services
          </span>
          <h3 className="mt-3 text-2xl sm:text-3xl leading-8 font-extrabold text-white">
            {slide.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-blue-100 line-clamp-2">
            {slide.blurb}
          </p>
          <p className="mt-2 text-sm font-bold text-emerald-200">{slide.priceLabel}</p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            onClick={() => onSelect(slide.slug)}
            className="inline-flex items-center gap-2 bg-white text-[#103871] text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors active:scale-95 shadow-sm no-select"
          >
            {slide.cta || 'Explore'} <ArrowRight className="w-3.5 h-3.5" />
          </button>
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="text-xs font-semibold text-white/80 hover:text-white"
            >
              View all
            </button>
          )}
        </div>
      </div>
      <div className="absolute right-4 bottom-3 flex gap-1.5">
        {slides.map((s, i) => (
          <button
            key={s.slug}
            aria-label={`Show ${s.title}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
          />
        ))}
      </div>
    </div>
  );
}
