import { MapPin } from 'lucide-react';
import { staticMapUrl } from '../../lib/mapbox';

interface Props {
  latitude: number | null;
  longitude: number | null;
  alt?: string;
  className?: string;
}

export function StaticMapPreview({ latitude, longitude, alt = 'Map preview', className = '' }: Props) {
  if (latitude == null || longitude == null) return null;
  const src = staticMapUrl(longitude, latitude);
  if (!src) {
    return (
      <div className={`flex items-center gap-1.5 text-[11px] text-slate-400 ${className}`}>
        <MapPin className="w-3 h-3" />
        {latitude.toFixed(5)}, {longitude.toFixed(5)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`w-full h-24 object-cover rounded-xl border border-slate-100 ${className}`}
    />
  );
}
