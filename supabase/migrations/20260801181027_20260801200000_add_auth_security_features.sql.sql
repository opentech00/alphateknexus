/*
# Auth Security Features: Device Alerts, Password History, Email Verification Tracking

## Purpose
Adds three security features to the authentication system:
1. New Device Login Alerts — tracks recognized devices per user and sends alerts on unrecognized logins
2. Password History — stores hashed previous passwords to prevent reuse
3. Email Verification Tracking — tracks whether a user has verified their email

## New Tables

### recognized_devices
Stores device fingerprints per user. When a login occurs from an unrecognized
device+browser+OS combination, an alert email/notification is triggered and
the device is recorded as recognized for future logins.
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users, NOT NULL)
- `device_hash` (text, NOT NULL) — SHA-256 hash of user_agent + IP subnet
- `device_name` (text) — human-readable e.g. "Chrome on Windows"
- `browser` (text)
- `os` (text)
- `ip_address` (text)
- `first_seen_at` (timestamptz, default now())
- `last_seen_at` (timestamptz, default now())
- Unique constraint on (user_id, device_hash)

### password_history
Stores SHA-256 hashes of the last 3 passwords per user so new passwords can
be checked against history to prevent reuse.
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users, NOT NULL)
- `password_hash` (text, NOT NULL) — SHA-256 of the password (not the auth hash)
- `created_at` (timestamptz, default now())
- Index on user_id for fast lookup

## Modified Tables
None — all new tables, no existing data is touched.

## Security
- RLS enabled on all new tables.
- recognized_devices: users can only CRUD their own device records (auth.uid() = user_id).
- password_history: users can INSERT and SELECT their own records only.
  DELETE is not granted to users — only the service role (edge functions) can
  manage password history to prevent tampering.
- All policies use auth.uid() for ownership checks.

## Important Notes
1. The device_hash is computed as SHA-256(user_agent + IP_subnet) so the same
   browser on the same network is recognized without storing the full IP.
2. Password history stores only 3 entries per user — older entries are cleaned
   up by the edge function to keep the table small.
3. Email verification is tracked via the existing auth.users.email_confirmed_at
   field — no separate table needed. The edge function and frontend check this
   field directly.
*/

-- ── recognized_devices table ──
CREATE TABLE IF NOT EXISTS recognized_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash text NOT NULL,
  device_name text,
  browser text,
  os text,
  ip_address text,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  UNIQUE (user_id, device_hash)
);

ALTER TABLE recognized_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_devices" ON recognized_devices;
CREATE POLICY "select_own_devices" ON recognized_devices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_devices" ON recognized_devices;
CREATE POLICY "insert_own_devices" ON recognized_devices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_devices" ON recognized_devices;
CREATE POLICY "update_own_devices" ON recognized_devices FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_devices" ON recognized_devices;
CREATE POLICY "delete_own_devices" ON recognized_devices FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── password_history table ──
CREATE TABLE IF NOT EXISTS password_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history(user_id);

ALTER TABLE password_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own password history (to check reuse client-side if needed)
DROP POLICY IF EXISTS "select_own_password_history" ON password_history;
CREATE POLICY "select_own_password_history" ON password_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users can insert into their own password history (when setting a new password)
DROP POLICY IF EXISTS "insert_own_password_history" ON password_history;
CREATE POLICY "insert_own_password_history" ON password_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Only service role can delete (cleanup of old entries) — no DELETE policy for authenticated
