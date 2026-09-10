export interface AddressSuggestion {
  display_name: string;
  address_line: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
}

function authHeaders(): HeadersInit {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    apikey: key,
    'Content-Type': 'application/json',
  };
}

function searchUrl(): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/address-search`;
}

export async function searchAddresses(
  query: string,
  countryCodes = 'sl',
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL(searchUrl());
  url.searchParams.set('q', q);
  if (countryCodes) url.searchParams.set('countrycodes', countryCodes);

  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error('Address search failed');
  const data = await res.json();
  return (data.results || []) as AddressSuggestion[];
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<AddressSuggestion | null> {
  const url = new URL(searchUrl());
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));

  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error('Reverse geocode failed');
  const data = await res.json();
  const results = (data.results || []) as AddressSuggestion[];
  return results[0] || null;
}

export interface DrivingRoute {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

export async function getDrivingRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): Promise<DrivingRoute | null> {
  const url = new URL(searchUrl());
  url.searchParams.set('from_lat', String(from.latitude));
  url.searchParams.set('from_lon', String(from.longitude));
  url.searchParams.set('to_lat', String(to.latitude));
  url.searchParams.set('to_lon', String(to.longitude));

  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error('Directions failed');
  const data = await res.json();
  if (!data?.route?.coordinates?.length) return null;
  return {
    coordinates: data.route.coordinates as [number, number][],
    distanceMeters: Number(data.route.distance_meters) || 0,
    durationSeconds: Number(data.route.duration_seconds) || 0,
  };
}

export function formatSuggestion(s: AddressSuggestion): string {
  return [s.address_line, s.city, s.region].filter(Boolean).join(', ') || s.display_name;
}
