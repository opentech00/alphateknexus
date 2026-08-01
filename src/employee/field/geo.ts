export interface Coords { lat: number; lng: number; heading?: number; speed?: number; }

export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function haversineMeters(a: Coords, b: Coords): number {
  return haversineKm(a, b) * 1000;
}

export function getCurrentPosition(): Promise<Coords | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, enableHighAccuracy: false },
    );
  });
}

export function watchPosition(
  onPosition: (coords: Coords) => void,
  onError?: () => void,
): (() => void) | null {
  if (!navigator.geolocation) return null;
  const watchId = navigator.geolocation.watchPosition(
    pos => onPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      heading: pos.coords.heading != null && !isNaN(pos.coords.heading) ? pos.coords.heading : undefined,
      speed: pos.coords.speed != null && !isNaN(pos.coords.speed) ? pos.coords.speed : undefined,
    }),
    () => onError?.(),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
  );
  return () => navigator.geolocation.clearWatch(watchId);
}

export function isInsideGeofence(current: Coords, target: Coords, radiusMeters: number): boolean {
  return haversineMeters(current, target) <= radiusMeters;
}

export function getBatteryLevel(): number | undefined {
  const nav = navigator as any;
  if (nav.getBattery) {
    return nav.battery?.level != null ? Math.round(nav.battery.level * 100) : undefined;
  }
  return undefined;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function estimateEtaMinutes(km: number): number {
  return Math.max(1, Math.round((km / 30) * 60));
}

export function estimateTravelTimeKm(km: number): string {
  const minutes = Math.max(1, Math.round((km / 30) * 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

export function optimizeRoute(stops: { id: string; coords: Coords; label: string }[], origin: Coords): typeof stops {
  if (stops.length <= 1) return stops;
  const result: typeof stops = [];
  const remaining = [...stops];
  let current = origin;
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i].coords);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const next = remaining.splice(nearestIdx, 1)[0];
    result.push(next);
    current = next.coords;
  }
  return result;
}

export function detectTimeConflict(
  jobs: { id: string; scheduled_date: string | null; scheduled_time: string | null }[],
): { id: string; conflictWith: string }[] {
  const conflicts: { id: string; conflictWith: string }[] = [];
  const withTimes = jobs.filter(j => j.scheduled_date && j.scheduled_time);
  for (let i = 0; i < withTimes.length; i++) {
    for (let j = i + 1; j < withTimes.length; j++) {
      if (withTimes[i].scheduled_date === withTimes[j].scheduled_date) {
        const t1 = withTimes[i].scheduled_time!;
        const t2 = withTimes[j].scheduled_time!;
        const diff = Math.abs(timeToMinutes(t1) - timeToMinutes(t2));
        if (diff < 60) {
          conflicts.push({ id: withTimes[i].id, conflictWith: withTimes[j].id });
        }
      }
    }
  }
  return conflicts;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
