/*
  # Booking coordinates

  Stores Mapbox geocoded latitude/longitude on bookings so field
  assignments can inherit an exact job site (map pin, geofence, routing).
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS longitude double precision;
