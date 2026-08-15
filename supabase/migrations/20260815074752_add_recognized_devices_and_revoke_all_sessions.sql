/*
# Add recognized_devices table and revoke-all-sessions support

1. New Tables
   - `recognized_devices` (if not exists)
     - `id` (uuid, primary key)
     - `user_id` (uuid, references auth.users)
     - `device_hash` (text, SHA-256 of user_agent + IP subnet)
     - `device_name` (text)
     - `browser` (text)
     - `os` (text)
     - `ip_address` (text)
     - `first_seen_at` (timestamptz)
     - `last_seen_at` (timestamptz)

2. Security
   - RLS enabled on recognized_devices
   - Owner-scoped SELECT/DELETE for authenticated users
   - Service-role INSERT/UPDATE handled via edge function

3. Notes
   - The manage-auth-events edge function already references this table
     for new-device detection. This migration ensures the table exists.
   - Unique constraint on (user_id, device_hash) prevents duplicates.
*/

-- recognized_devices table
CREATE TABLE IF NOT EXISTS recognized_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash text NOT NULL,
  device_name text NOT NULL DEFAULT 'Unknown',
  browser text NOT NULL DEFAULT 'Unknown',
  os text NOT NULL DEFAULT 'Unknown',
  ip_address text NOT NULL DEFAULT 'unknown',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint (idempotent via DO block)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recognized_devices_user_device_unique'
  ) THEN
    ALTER TABLE recognized_devices ADD CONSTRAINT recognized_devices_user_device_unique UNIQUE (user_id, device_hash);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recognized_devices_user ON recognized_devices(user_id);

ALTER TABLE recognized_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_devices" ON recognized_devices;
CREATE POLICY "select_own_devices" ON recognized_devices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_devices" ON recognized_devices;
CREATE POLICY "delete_own_devices" ON recognized_devices FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Service role needs INSERT/UPDATE (handled by edge function with service_role key)
-- No insert/update policies for authenticated needed since edge function uses service role
