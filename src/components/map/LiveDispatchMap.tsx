import { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Marker, Popup, Source, type MapRef } from 'react-map-gl/mapbox';
import { MapPin } from 'lucide-react';
import { circlePolygon, MAP_DEFAULT_CENTER } from '../../lib/mapbox';
import { MapShell } from './MapShell';

export interface LiveWorkerPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  active: boolean;
  subtitle?: string;
}

export interface LiveJobPin {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number | null;
  subtitle?: string;
}

interface Props {
  workers: LiveWorkerPin[];
  jobs: LiveJobPin[];
  height?: number;
}

export function LiveDispatchMap({ workers, jobs, height = 440 }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [popup, setPopup] = useState<{ lng: number; lat: number; title: string; body: string } | null>(null);

  const fences = useMemo(
    () => jobs.filter((j) => j.radiusMeters && j.radiusMeters > 0),
    [jobs],
  );

  useEffect(() => {
    const map = mapRef.current;
    const points: [number, number][] = [
      ...workers.map((w) => [w.longitude, w.latitude] as [number, number]),
      ...jobs.map((j) => [j.longitude, j.latitude] as [number, number]),
    ];
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.flyTo({ center: points[0], zoom: 14, duration: 400 });
      return;
    }
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 64, duration: 500, maxZoom: 15 },
    );
  }, [workers, jobs]);

  const first = workers[0] || jobs[0];

  return (
    <MapShell
      mapRef={mapRef}
      height={height}
      initialViewState={first
        ? { longitude: first.longitude, latitude: first.latitude, zoom: 12 }
        : MAP_DEFAULT_CENTER}
    >
      {fences.map((job) => (
        <Source key={`fence-${job.id}`} id={`fence-${job.id}`} type="geojson" data={circlePolygon(job.longitude, job.latitude, job.radiusMeters || 100)}>
          <Layer id={`fence-fill-${job.id}`} type="fill" paint={{ 'fill-color': '#f97316', 'fill-opacity': 0.08 }} />
          <Layer id={`fence-line-${job.id}`} type="line" paint={{ 'line-color': '#f97316', 'line-width': 1.5, 'line-dasharray': [2, 1] }} />
        </Source>
      ))}

      {jobs.map((job) => (
        <Marker
          key={`job-${job.id}`}
          longitude={job.longitude}
          latitude={job.latitude}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            setPopup({ lng: job.longitude, lat: job.latitude, title: job.label, body: job.subtitle || 'Job site' });
          }}
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white shadow-md ring-2 ring-orange-300">
            <MapPin className="w-3.5 h-3.5 text-orange-500" />
          </span>
        </Marker>
      ))}

      {workers.map((w) => (
        <Marker
          key={`w-${w.id}`}
          longitude={w.longitude}
          latitude={w.latitude}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            setPopup({ lng: w.longitude, lat: w.latitude, title: w.name, body: w.subtitle || (w.active ? 'On a job' : 'Available') });
          }}
        >
          <span className={`relative flex items-center justify-center w-9 h-9 rounded-full text-white text-xs font-bold shadow-lg ring-2 ring-white ${
            w.active ? 'bg-emerald-600' : 'bg-slate-400'
          }`}>
            {w.name[0]?.toUpperCase()}
            {w.active && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-white" />}
          </span>
        </Marker>
      ))}

      {popup && (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="top"
          onClose={() => setPopup(null)}
          closeOnClick={false}
        >
          <p className="text-xs font-semibold text-slate-900">{popup.title}</p>
          <p className="text-[11px] text-slate-500">{popup.body}</p>
        </Popup>
      )}
    </MapShell>
  );
}
