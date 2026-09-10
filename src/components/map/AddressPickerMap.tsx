import { useEffect, useRef } from 'react';
import { Marker, type MapRef } from 'react-map-gl/mapbox';
import { reverseGeocode, type AddressSuggestion } from '../../lib/addressSearch';
import { MAP_DEFAULT_CENTER } from '../../lib/mapbox';
import { MapShell } from './MapShell';

interface Props {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number, suggestion?: AddressSuggestion) => void;
  height?: number;
}

export function AddressPickerMap({ latitude, longitude, onChange, height = 200 }: Props) {
  const mapRef = useRef<MapRef>(null);
  const hasPin = latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude);

  useEffect(() => {
    if (!hasPin) return;
    mapRef.current?.flyTo({
      center: [longitude!, latitude!],
      zoom: 16,
      duration: 700,
    });
  }, [hasPin, latitude, longitude]);

  const pick = async (lat: number, lng: number) => {
    let suggestion: AddressSuggestion | undefined;
    try {
      suggestion = (await reverseGeocode(lat, lng)) || undefined;
    } catch { /* pin still valid */ }
    onChange(lat, lng, suggestion);
  };

  return (
    <div>
      <MapShell
        mapRef={mapRef}
        height={height}
        initialViewState={hasPin
          ? { longitude: longitude!, latitude: latitude!, zoom: 16 }
          : { ...MAP_DEFAULT_CENTER, zoom: 12 }}
        onClick={(e) => pick(e.lngLat.lat, e.lngLat.lng)}
      >
        {hasPin && (
          <Marker
            longitude={longitude!}
            latitude={latitude!}
            anchor="bottom"
            draggable
            onDragEnd={(e) => pick(e.lngLat.lat, e.lngLat.lng)}
          />
        )}
      </MapShell>
      <p className="text-[11px] text-slate-400 mt-1.5">
        {hasPin ? 'Drag the pin or tap the map to refine the exact location.' : 'Search an address or tap the map to drop a pin.'}
      </p>
    </div>
  );
}
