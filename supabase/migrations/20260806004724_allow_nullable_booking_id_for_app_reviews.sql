/*
# Allow app-level reviews without a booking

The `reviews` table was originally booking-scoped only (booking_id NOT NULL
UNIQUE). The app-level "Rate Our App" modal needs to insert reviews that are
not tied to any booking. This migration:

1. Drops the NOT NULL constraint on booking_id.
2. Drops the UNIQUE constraint on booking_id (since multiple app reviews can
   have NULL booking_id, and NULLs are allowed in unique constraints in
   Postgres, but we also want multiple app reviews per user — the unique
   constraint was only meaningful for booking-scoped reviews).
3. Adds a partial unique index on booking_id for non-null values only,
   preserving the "one review per booking" rule where it applies.
*/

ALTER TABLE reviews ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_booking_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_booking_id_unique
  ON reviews (booking_id)
  WHERE booking_id IS NOT NULL;
