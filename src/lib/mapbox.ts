export type LngLat = { longitude: number; latitude: number };

export type GeoPoint = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: 'Point'; coordinates: [number, number] };
};

export type GeoLine = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
};

export type GeoPolygon = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
};

/** Freetown — default camera for Sierra Leone operations. */
export const MAP_DEFAULT_CENTER = {
  longitude: -13.2317,
  latitude: 8.484,
  zoom: 12,
} as const;

export function getMapboxToken(): string {
  return (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();
}

export function isMapboxEnabled(): boolean {
  return getMapboxToken().length > 0;
}

export function getMapStyle(dark = false): string {
  return dark
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/streets-v12';
}

export function staticMapUrl(
  longitude: number,
  latitude: number,
  opts?: { width?: number; height?: number; zoom?: number; pin?: string },
): string | null {
  const token = getMapboxToken();
  if (!token) return null;
  const width = opts?.width ?? 400;
  const height = opts?.height ?? 160;
  const zoom = opts?.zoom ?? 15;
  const pin = opts?.pin ?? 'pin-s+10b981';
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}(${longitude},${latitude})/${longitude},${latitude},${zoom},0/${width}x${height}@2x?access_token=${encodeURIComponent(token)}`;
}

export function circlePolygon(
  longitude: number,
  latitude: number,
  radiusMeters: number,
  points = 64,
): GeoPolygon {
  const coords: [number, number][] = [];
  const km = radiusMeters / 1000;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = (km / 110.574) * Math.cos(angle);
    const dLng = (km / (111.32 * Math.cos((latitude * Math.PI) / 180))) * Math.sin(angle);
    coords.push([longitude + dLng, latitude + dLat]);
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

export function lineString(coordinates: [number, number][]): GeoLine {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
}

export function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function openExternalDirections(lat: number, lng: number): void {
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`,
    '_blank',
  );
}
