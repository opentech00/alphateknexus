/*
# Create services and bookings tables for Alphatek Nexus

1. New Tables
  - `profiles`
    - `id` (uuid, primary key, references auth.users)
    - `email` (text, not null)
    - `full_name` (text)
    - `phone` (text)
    - `role` (text, default 'user') - either 'user' or 'admin'
    - `created_at` (timestamptz)
  - `services`
    - `id` (uuid, primary key)
    - `name` (text, not null)
    - `slug` (text, unique, not null)
    - `description` (text)
    - `icon` (text) - icon name for frontend
    - `price_range` (text)
    - `is_active` (boolean, default true)
    - `created_at` (timestamptz)
  - `bookings`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users)
    - `service_id` (uuid, references services)
    - `status` (text, default 'pending') - pending/confirmed/in_progress/completed/cancelled
    - `scheduled_date` (date, not null)
    - `scheduled_time` (time)
    - `location` (text)
    - `notes` (text)
    - `contact_name` (text, not null)
    - `contact_phone` (text, not null)
    - `contact_email` (text)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - RLS enabled on all tables.
  - profiles: users can read/update own profile; admins can read all.
  - services: anyone can read active services; admins can manage.
  - bookings: users can CRUD own bookings; admins can read/update all.

3. Seed Data
  - Pre-populate the 5 services offered by Alphatek Nexus.

4. Notes
  - Admin role is stored in profiles.role field.
  - A trigger auto-creates a profile on user signup.
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  phone text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin_select_all_profiles" ON profiles;
CREATE POLICY "admin_select_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  icon text,
  price_range text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_read_active_services" ON services;
CREATE POLICY "anyone_can_read_active_services" ON services FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_select_all_services" ON services;
CREATE POLICY "admin_select_all_services" ON services FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_services" ON services;
CREATE POLICY "admin_insert_services" ON services FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_services" ON services;
CREATE POLICY "admin_update_services" ON services FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_services" ON services;
CREATE POLICY "admin_delete_services" ON services FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  scheduled_date date NOT NULL,
  scheduled_time time,
  location text,
  notes text,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookings" ON bookings;
CREATE POLICY "select_own_bookings" ON bookings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_select_all_bookings" ON bookings;
CREATE POLICY "admin_select_all_bookings" ON bookings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "insert_own_bookings" ON bookings;
CREATE POLICY "insert_own_bookings" ON bookings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookings" ON bookings;
CREATE POLICY "update_own_bookings" ON bookings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_update_all_bookings" ON bookings;
CREATE POLICY "admin_update_all_bookings" ON bookings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "delete_own_bookings" ON bookings;
CREATE POLICY "delete_own_bookings" ON bookings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Seed services
INSERT INTO services (name, slug, description, icon, price_range) VALUES
  ('Waste Management', 'waste-management', 'Comprehensive waste collection, recycling, and disposal solutions for residential and commercial properties. We ensure eco-friendly practices and regulatory compliance.', 'Trash2', 'Custom Quote'),
  ('Private Security', 'private-security', 'Professional security personnel, surveillance systems, and patrol services to protect your assets, property, and people around the clock.', 'Shield', 'From KES 50,000/mo'),
  ('Clearing & Forwarding', 'clearing-forwarding', 'Expert customs clearance, freight forwarding, and logistics management for seamless import/export operations across borders.', 'Ship', 'Custom Quote'),
  ('Cleaning & Janitorial', 'cleaning-janitorial', 'Premium cleaning services for offices, commercial spaces, and residential properties. Regular maintenance and deep cleaning available.', 'Sparkles', 'From KES 15,000'),
  ('Procurement', 'procurement', 'Strategic sourcing and procurement services to help organizations acquire goods and services efficiently at competitive prices.', 'ShoppingCart', 'Custom Quote')
ON CONFLICT (slug) DO NOTHING;
