/*
# Create user_addresses table

## Purpose
Lets authenticated users save multiple named addresses (Home, Office, etc.)
to their profile for quick reuse when booking services. Each user can store
several addresses, mark one as default, and manage them from the Address
page in their account.

## New Tables
- `user_addresses`
  - `id` (uuid, primary key)
  - `user_id` (uuid, NOT NULL, defaults to auth.uid(), references auth.users)
  - `label` (text, NOT NULL) — friendly name e.g. "Home", "Office"
  - `address_line` (text, NOT NULL) — full street address
  - `city` (text)
  - `region` (text) — state/province/region
  - `postal_code` (text)
  - `country` (text)
  - `latitude` (numeric, nullable) — from geocoding result
  - `longitude` (numeric, nullable) — from geocoding result
  - `is_default` (boolean, default false)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Security
- RLS enabled on `user_addresses`.
- Four owner-scoped policies (select/insert/update/delete) scoped to
  `auth.uid() = user_id`.
- `user_id` defaults to `auth.uid()` so inserts that omit it succeed.

## Notes
1. One address per user can be marked `is_default = true`. The application
   enforces single-default by clearing other defaults before setting a new one.
2. Latitude/longitude are optional and populated from the address autocomplete
   geocoder so future booking flows can estimate distance/routing.
*/

CREATE TABLE IF NOT EXISTS user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  address_line text NOT NULL,
  city text,
  region text,
  postal_code text,
  country text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_addresses" ON user_addresses;
CREATE POLICY "select_own_addresses" ON user_addresses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_addresses" ON user_addresses;
CREATE POLICY "insert_own_addresses" ON user_addresses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_addresses" ON user_addresses;
CREATE POLICY "update_own_addresses" ON user_addresses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_addresses" ON user_addresses;
CREATE POLICY "delete_own_addresses" ON user_addresses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);