/*
# Create reviews table for service ratings

1. New Tables
  - `reviews`
    - `id` (uuid, primary key)
    - `user_id` (uuid, FK to auth.users, defaults to auth.uid())
    - `booking_id` (uuid, FK to bookings, unique - one review per booking)
    - `service_id` (uuid, FK to services)
    - `rating` (integer, 1-5 stars)
    - `comment` (text, nullable - written review)
    - `reviewer_name` (text - display name)
    - `created_at` (timestamptz)

2. Security
  - RLS enabled on reviews.
  - Users can read all reviews (public for social proof).
  - Users can insert/update/delete only their own reviews.

3. Important Notes
  - One review per booking enforced via UNIQUE constraint on booking_id.
  - Rating constrained to 1-5 via CHECK.
  - All authenticated users can see reviews for social proof on service cards.
*/

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  reviewer_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reviews_service_id ON reviews(service_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_booking_id ON reviews(booking_id);

-- All authenticated users can read reviews (public social proof)
DROP POLICY IF EXISTS "select_all_reviews" ON reviews;
CREATE POLICY "select_all_reviews" ON reviews FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_reviews" ON reviews;
CREATE POLICY "insert_own_reviews" ON reviews FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reviews" ON reviews;
CREATE POLICY "update_own_reviews" ON reviews FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reviews" ON reviews;
CREATE POLICY "delete_own_reviews" ON reviews FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
