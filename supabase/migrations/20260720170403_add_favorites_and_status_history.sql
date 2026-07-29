/*
# Add favorites and booking status history tables

1. New Tables
  - `favorites`
    - `id` (uuid, primary key)
    - `user_id` (uuid, FK to auth.users, defaults to auth.uid())
    - `service_id` (uuid, FK to services)
    - `created_at` (timestamptz)
    - UNIQUE(user_id, service_id) - one favorite per service per user
  - `booking_status_history`
    - `id` (uuid, primary key)
    - `booking_id` (uuid, FK to bookings)
    - `status` (text) - the status at this point in time
    - `note` (text, nullable) - optional context for the transition
    - `created_by` (text, nullable) - 'system' or 'admin' marker
    - `created_at` (timestamptz, default now())
  - `booking_presets`
    - `id` (uuid, primary key)
    - `user_id` (uuid, FK to auth.users, defaults to auth.uid())
    - `label` (text) - user-defined name like "Office" or "Warehouse"
    - `contact_name` (text, not null)
    - `contact_phone` (text, not null)
    - `contact_email` (text, nullable)
    - `location` (text, nullable)
    - `created_at` (timestamptz)

2. Security
  - RLS enabled on all three new tables.
  - favorites: owner-scoped CRUD (user sees/manages only their own favorites).
  - booking_status_history: users can read history for their own bookings; admins can read all.
  - booking_presets: owner-scoped CRUD.

3. Important Notes
  - The status_history table is populated by a trigger on bookings updates so
    transitions are recorded automatically without requiring app changes.
  - A user gets one row per favorited service (UNIQUE constraint).
  - Presets hold reusable contact/location info for the Quick Book flow.
*/

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, service_id)
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_favorites" ON favorites;
CREATE POLICY "select_own_favorites" ON favorites FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_favorites" ON favorites;
CREATE POLICY "insert_own_favorites" ON favorites FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_favorites" ON favorites;
CREATE POLICY "delete_own_favorites" ON favorites FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);

-- Booking status history table
CREATE TABLE IF NOT EXISTS booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  note text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE booking_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_history" ON booking_status_history;
CREATE POLICY "select_own_history" ON booking_status_history FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_select_all_history" ON booking_status_history;
CREATE POLICY "admin_select_all_history" ON booking_status_history FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admins can insert history entries (e.g. when updating status)
DROP POLICY IF EXISTS "admin_insert_history" ON booking_status_history;
CREATE POLICY "admin_insert_history" ON booking_status_history FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_history_booking_id ON booking_status_history(booking_id);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON booking_status_history(created_at);

-- Auto-record status changes via trigger
CREATE OR REPLACE FUNCTION public.record_booking_status_change()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_status_history (booking_id, status, note, created_by)
    VALUES (NEW.id, NEW.status, 'Booking submitted', 'system');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.booking_status_history (booking_id, status, note, created_by)
    VALUES (NEW.id, NEW.status, null, 'admin');
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_change ON bookings;
CREATE TRIGGER on_booking_change
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION public.record_booking_status_change();

-- Booking presets table (for Quick Book)
CREATE TABLE IF NOT EXISTS booking_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_email text,
  location text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE booking_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_presets" ON booking_presets;
CREATE POLICY "select_own_presets" ON booking_presets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_presets" ON booking_presets;
CREATE POLICY "insert_own_presets" ON booking_presets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_presets" ON booking_presets;
CREATE POLICY "update_own_presets" ON booking_presets FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_presets" ON booking_presets;
CREATE POLICY "delete_own_presets" ON booking_presets FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_presets_user_id ON booking_presets(user_id);
