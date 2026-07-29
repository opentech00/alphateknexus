/*
# Auth Pro: Session Management + Account Lockout + Login Audit Log

## Overview
Adds infrastructure for three pro auth features:
2. Session Management — track active sessions, let users view/revoke them
4. Account Lockout — brute-force protection (lock after 5 failed attempts)
5. Login Activity / Audit Log — log every login event with metadata

## 1. New Tables

### `login_activity`
Audit log of every authentication event (login success, login failure, logout, 2FA).
- `id` (uuid PK)
- `user_id` (uuid, references auth.users) — the user attempting auth
- `event_type` (text) — login_success | login_failed | logout | 2fa_success | 2fa_failed
- `ip_address` (text) — requester IP (best-effort from headers)
- `user_agent` (text) — browser/device string
- `device_name` (text) — parsed friendly device name
- `session_id` (text) — Supabase session token ID (for correlating sessions)
- `success` (boolean) — whether the event succeeded
- `error_message` (text) — failure reason if applicable
- `created_at` (timestamptz)

### `active_sessions`
Tracks currently active sessions per user for the session manager UI.
- `id` (uuid PK)
- `user_id` (uuid, references auth.users)
- `session_token` (text, unique) — the JWT jti or session identifier
- `device_name` (text)
- `browser` (text)
- `os` (text)
- `ip_address` (text)
- `location` (text) — best-effort geo (city/country from IP, if available)
- `is_current` (boolean) — whether this is the session the user is currently using
- `last_active_at` (timestamptz)
- `created_at` (timestamptz)

### `auth_lockout`
Per-user lockout state for brute-force protection.
- `id` (uuid PK)
- `user_id` (uuid, references auth.users, unique)
- `failed_attempts` (int, default 0) — consecutive failed login attempts
- `locked_until` (timestamptz) — if set, account is locked until this time
- `last_failed_at` (timestamptz)
- `updated_at` (timestamptz)

## 2. Security
- RLS enabled on all three tables.
- Users can only access their own rows.
- All CRUD policies for owners.
- The edge function uses the service role key to bypass RLS for logging.

## 3. Important Notes
1. Lockout threshold: 5 failed attempts → 15-minute lockout.
2. Successful login resets failed_attempts to 0.
3. The edge function parses User-Agent to extract device/browser/OS info.
4. Session tracking is best-effort — Supabase JWTs are stateless, so we track
   by the session token's jti claim.
*/
-- ── login_activity ──
CREATE TABLE IF NOT EXISTS login_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('login_success','login_failed','logout','2fa_success','2fa_failed')),
  ip_address text,
  user_agent text,
  device_name text,
  session_id text,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_activity_user ON login_activity(user_id, created_at DESC);

ALTER TABLE login_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_login_activity" ON login_activity;
CREATE POLICY "select_own_login_activity" ON login_activity FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_login_activity" ON login_activity;
CREATE POLICY "insert_own_login_activity" ON login_activity FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── active_sessions ──
CREATE TABLE IF NOT EXISTS active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  device_name text,
  browser text,
  os text,
  ip_address text,
  location text,
  is_current boolean NOT NULL DEFAULT false,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sessions" ON active_sessions;
CREATE POLICY "select_own_sessions" ON active_sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sessions" ON active_sessions;
CREATE POLICY "insert_own_sessions" ON active_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sessions" ON active_sessions;
CREATE POLICY "delete_own_sessions" ON active_sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sessions" ON active_sessions;
CREATE POLICY "update_own_sessions" ON active_sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── auth_lockout ──
CREATE TABLE IF NOT EXISTS auth_lockout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auth_lockout ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_lockout" ON auth_lockout;
CREATE POLICY "select_own_lockout" ON auth_lockout FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
