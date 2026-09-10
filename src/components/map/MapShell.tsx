import { type ReactNode, type Ref } from 'react';
import Map, {
  NavigationControl,
  type MapRef,
  type MapMouseEvent,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin } from 'lucide-react';
import { getMapStyle, getMapboxToken, MAP_DEFAULT_CENTER } from '../../lib/mapbox';

interface MapShellProps {
  children?: ReactNode;
  height?: number | string;
  mapRef?: Ref<MapRef>;
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom?: number;
  };
  onClick?: (e: MapMouseEvent) => void;
  interactive?: boolean;
  className?: string;
  showNav?: boolean;
}

export function MapUnavailable({ height = 180, message = 'Add VITE_MAPBOX_ACCESS_TOKEN to enable live maps.' }: {
  height?: number | string;
  message?: string;
}) {
  return (
    <div
      className="rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center px-4"
      style={{ height }}
    >
      <MapPin className="w-6 h-6 text-slate-300 mb-2" />
      <p className="text-xs text-slate-400 max-w-xs">{message}</p>
    </div>
  );
}

export function MapShell({
  children,
  height = 220,
  mapRef,
  initialViewState,
  onClick,
  interactive = true,
  className = '',
  showNav = true,
}: MapShellProps) {
  const token = getMapboxToken();
  if (!token) return <MapUnavailable height={height} />;

  const dark = typeof document !== 'undefined'
    && (document.documentElement.classList.contains('dark')
      || document.documentElement.classList.contains('black'));

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 ${className}`} style={{ height }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        mapLib={import('mapbox-gl')}
        initialViewState={{
          longitude: initialViewState?.longitude ?? MAP_DEFAULT_CENTER.longitude,
          latitude: initialViewState?.latitude ?? MAP_DEFAULT_CENTER.latitude,
          zoom: initialViewState?.zoom ?? MAP_DEFAULT_CENTER.zoom,
        }}
        mapStyle={getMapStyle(dark)}
        style={{ width: '100%', height: '100%' }}
        onClick={onClick}
        interactive={interactive}
        attributionControl
        reuseMaps
      >
        {showNav && <NavigationControl position="top-right" showCompass={false} />}
        {children}
      </Map>
    </div>
  );
}
