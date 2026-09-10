import { useEffect, useMemo, useRef } from 'react';
import { Layer, Marker, Source, type MapRef } from 'react-map-gl/mapbox';
import { circlePolygon, lineString } from '../../lib/mapbox';
import { MapShell } from './MapShell';

interface Ping {
  latitude: number;
  longitude: number;
}

interface Props {
  pings: Ping[];
  currentIdx: number;
  siteLat?: number | null;
  siteLng?: number | null;
  radiusMeters?: number | null;
  events?: { latitude: number; longitude: number; type: string }[];
  height?: number;
}

export function RouteReplayMap({
  pings,
  currentIdx,
  siteLat,
  siteLng,
  radiusMeters,
  events = [],
  height = 256,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const full = useMemo(
    () => (pings.length > 1 ? lineString(pings.map((p) => [p.longitude, p.latitude])) : null),
    [pings],
  );
  const traveled = useMemo(() => {
    const slice = pings.slice(0, Math.max(1, currentIdx + 1));
    return slice.length > 1 ? lineString(slice.map((p) => [p.longitude, p.latitude])) : null;
  }, [pings, currentIdx]);
  const fence = useMemo(
    () => (siteLat != null && siteLng != null && radiusMeters
      ? circlePolygon(siteLng, siteLat, radiusMeters)
      : null),
    [siteLat, siteLng, radiusMeters],
  );
  const current = pings[currentIdx];

  useEffect(() => {
    const map = mapRef.current;
    if (!map || pings.length === 0) return;
    const points: [number, number][] = pings.map((p) => [p.longitude, p.latitude]);
    if (siteLng != null && siteLat != null) points.push([siteLng, siteLat]);
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 40, duration: 0, maxZoom: 15 },
    );
  }, [pings, siteLat, siteLng]);

  if (!current) return null;

  return (
    <MapShell
      mapRef={mapRef}
      height={height}
      initialViewState={{ longitude: current.longitude, latitude: current.latitude, zoom: 14 }}
    >
      {fence && (
        <Source id="replay-fence" type="geojson" data={fence}>
          <Layer id="replay-fence-fill" type="fill" paint={{ 'fill-color': '#10b981', 'fill-opacity': 0.12 }} />
          <Layer id="replay-fence-line" type="line" paint={{ 'line-color': '#10b981', 'line-width': 2, 'line-dasharray': [2, 1] }} />
        </Source>
      )}
      {full && (
        <Source id="replay-full" type="geojson" data={full}>
          <Layer id="replay-full-line" type="line" paint={{ 'line-color': '#94a3b8', 'line-width': 3, 'line-opacity': 0.45 }} />
        </Source>
      )}
      {traveled && (
        <Source id="replay-done" type="geojson" data={traveled}>
          <Layer id="replay-done-line" type="line" paint={{ 'line-color': '#3b82f6', 'line-width': 4 }} />
        </Source>
      )}
      {siteLng != null && siteLat != null && (
        <Marker longitude={siteLng} latitude={siteLat} color="#10b981" />
      )}
      {events.map((ev, i) => (
        <Marker key={i} longitude={ev.longitude} latitude={ev.latitude} anchor="center">
          <span className={`block w-2.5 h-2.5 rounded-full ${ev.type === 'enter' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </Marker>
      ))}
      <Marker longitude={current.longitude} latitude={current.latitude} anchor="center">
        <span className="block w-3.5 h-3.5 rounded-full bg-blue-500 ring-4 ring-blue-200" />
      </Marker>
    </MapShell>
  );
}
