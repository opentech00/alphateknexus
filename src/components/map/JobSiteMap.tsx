import { useEffect, useMemo, useRef } from 'react';
import { Layer, Marker, Source, type MapRef } from 'react-map-gl/mapbox';
import { circlePolygon, lineString } from '../../lib/mapbox';
import { MapShell } from './MapShell';

interface Props {
  latitude: number;
  longitude: number;
  radiusMeters?: number | null;
  userLat?: number | null;
  userLng?: number | null;
  route?: [number, number][] | null;
  height?: number;
}

export function JobSiteMap({
  latitude,
  longitude,
  radiusMeters,
  userLat,
  userLng,
  route,
  height = 200,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const fence = useMemo(
    () => (radiusMeters && radiusMeters > 0 ? circlePolygon(longitude, latitude, radiusMeters) : null),
    [latitude, longitude, radiusMeters],
  );
  const routeLine = useMemo(
    () => (route && route.length > 1 ? lineString(route) : null),
    [route],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points: [number, number][] = [[longitude, latitude]];
    if (userLat != null && userLng != null) points.push([userLng, userLat]);
    route?.forEach((c) => points.push(c));
    if (points.length === 1) {
      map.flyTo({ center: points[0], zoom: 15, duration: 500 });
      return;
    }
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 48, duration: 500, maxZoom: 16 },
    );
  }, [latitude, longitude, userLat, userLng, route]);

  return (
    <MapShell
      mapRef={mapRef}
      height={height}
      initialViewState={{ longitude, latitude, zoom: 15 }}
    >
      {fence && (
        <Source id="geofence" type="geojson" data={fence}>
          <Layer id="geofence-fill" type="fill" paint={{ 'fill-color': '#10b981', 'fill-opacity': 0.12 }} />
          <Layer id="geofence-line" type="line" paint={{ 'line-color': '#10b981', 'line-width': 2, 'line-dasharray': [2, 1] }} />
        </Source>
      )}
      {routeLine && (
        <Source id="route" type="geojson" data={routeLine}>
          <Layer id="route-line" type="line" paint={{ 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 }} />
        </Source>
      )}
      <Marker longitude={longitude} latitude={latitude} anchor="bottom" color="#f97316" />
      {userLat != null && userLng != null && (
        <Marker longitude={userLng} latitude={userLat} anchor="center">
          <span className="block w-3.5 h-3.5 rounded-full bg-blue-500 ring-2 ring-white shadow" />
        </Marker>
      )}
    </MapShell>
  );
}
