import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, type MapRef } from 'react-map-gl/mapbox';
import { Loader2, Navigation, Radio } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { MapShell, MapUnavailable } from './MapShell';
import { getMapboxToken } from '../../lib/mapbox';

interface CrewFix {
  available: boolean;
  latitude?: number | null;
  longitude?: number | null;
  recorded_at?: string | null;
  eta_minutes?: number | null;
  crew_name?: string | null;
  assignment_status?: string | null;
  site_latitude?: number | null;
  site_longitude?: number | null;
  reason?: string;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(s)));
}

function ageLabel(iso?: string | null) {
  if (!iso) return 'Waiting for a location';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Updated just now';
  if (mins === 1) return 'Updated 1 minute ago';
  return `Updated ${mins} minutes ago`;
}

export function CrewTrackMap({ bookingId }: { bookingId: string }) {
  const mapRef = useRef<MapRef>(null);
  const [fix, setFix] = useState<CrewFix | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc('client_crew_location', { p_booking_id: bookingId });
      if (!cancelled) {
        setFix((data || { available: false }) as CrewFix);
        setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [bookingId]);

  const nearby = useMemo(() => {
    if (!fix?.latitude || !fix.longitude || !fix.site_latitude || !fix.site_longitude) return false;
    return haversineKm(fix.latitude, fix.longitude, fix.site_latitude, fix.site_longitude) < 1;
  }, [fix]);

  useEffect(() => {
    if (!fix?.latitude || !fix.longitude) return;
    mapRef.current?.flyTo({
      center: [fix.longitude, fix.latitude],
      zoom: 14,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800,
    });
  }, [fix?.latitude, fix?.longitude]);

  const status = nearby
    ? 'Your crew is nearby'
    : fix?.available
      ? `${fix.crew_name || 'Your crew'} is on the way`
      : 'Live location will appear once the crew is moving';

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden motion-safe:animate-[fadeInUp_0.4s_ease]" aria-labelledby="crew-track-heading">
      <div className="px-4 sm:px-5 py-4 flex items-start gap-3 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <Navigation className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="crew-track-heading" className="text-sm font-semibold text-slate-900">{status}</h2>
          <p className="text-xs text-slate-500 mt-0.5" aria-live="polite">
            {loading ? 'Checking location…' : ageLabel(fix?.recorded_at)}
            {fix?.eta_minutes ? ` · about ${fix.eta_minutes} min` : ''}
          </p>
        </div>
        {fix?.available && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-1">
            <Radio className="w-3 h-3 motion-safe:animate-pulse" aria-hidden="true" />
            Live
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-56 flex items-center justify-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" aria-label="Loading map" />
        </div>
      ) : !getMapboxToken() ? (
        <div className="p-4"><MapUnavailable height={220} /></div>
      ) : !fix?.latitude || !fix.longitude ? (
        <div className="h-40 flex items-center justify-center px-6 text-center text-sm text-slate-500">
          {fix?.reason === 'unassigned'
            ? 'A crew has not been assigned to this booking yet.'
            : 'The crew has not shared a location yet. This updates automatically.'}
        </div>
      ) : (
        <MapShell
          mapRef={mapRef}
          height={260}
          initialViewState={{ longitude: fix.longitude, latitude: fix.latitude, zoom: 13 }}
          className="rounded-none border-0"
        >
          <Marker longitude={fix.longitude} latitude={fix.latitude} anchor="center">
            <span className="relative flex h-4 w-4" aria-label="Crew location">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-600 ring-2 ring-white" />
            </span>
          </Marker>
          {fix.site_latitude && fix.site_longitude && (
            <Marker longitude={fix.site_longitude} latitude={fix.site_latitude} anchor="bottom" color="#0f172a" />
          )}
        </MapShell>
      )}
    </section>
  );
}
