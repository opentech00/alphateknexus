/*
# Add app_settings table for feature toggles

1. New Tables
- `app_settings` — a singleton-style table (one row, id=1) holding global feature flags
  - `id` (int, primary key, always 1)
  - `referral_enabled` (boolean, default true) — controls whether the referral program is visible to clients
  - `wallet_enabled` (boolean, default true) — controls whether the wallet feature is visible to clients
  - `updated_at` (timestamptz) — last modification timestamp
  - `updated_by` (uuid, nullable) — admin user who last changed a setting

2. Seed Data
- Inserts a single row with id=1 and both features enabled (current behavior preserved).

3. Security — RLS
- Enable RLS on `app_settings`.
- SELECT: `TO anon, authenticated` — all clients (including anon-key) can read the flags so the frontend can hide/show features.
- UPDATE: `TO authenticated` with `is_admin()` check — only admin users can toggle features.
- No INSERT or DELETE policies — the singleton row is seeded via migration and should never be inserted or deleted by the app.

4. Important Notes
- The table is designed as a singleton (CHECK constraint id = 1) so there is always exactly one row to read.
- The `is_admin()` function is assumed to exist (it was created in earlier migrations for RLS recursion fixes).
- Clients read via the anon key, so the SELECT policy must include `anon`.
*/

CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  referral_enabled boolean NOT NULL DEFAULT true,
  wallet_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT singleton_row CHECK (id = 1)
);

-- Seed the singleton row if it doesn't exist
INSERT INTO app_settings (id, referral_enabled, wallet_enabled)
VALUES (1, true, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Allow all clients (including anon) to read feature flags
DROP POLICY IF EXISTS "read_app_settings" ON app_settings;
CREATE POLICY "read_app_settings"
  ON app_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can update feature flags
DROP POLICY IF EXISTS "admin_update_app_settings" ON app_settings;
CREATE POLICY "admin_update_app_settings"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
