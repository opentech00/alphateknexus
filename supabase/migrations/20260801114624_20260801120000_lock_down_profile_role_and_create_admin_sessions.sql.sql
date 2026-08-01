/*
# Lock down profiles.role column + Create admin_sessions audit table

## Purpose
1. Prevent privilege escalation: regular users must not be able to UPDATE the `role` column on profiles.
   We use a BEFORE UPDATE trigger because RLS WITH CHECK cannot reference OLD values.
2. Create a dedicated `admin_sessions` table to track admin logins/logouts for auditing.

## Changes to existing tables
- `profiles`: Added a BEFORE UPDATE trigger `guard_profile_role` that blocks any change
  to the `role` column unless the current user is an admin (checked via is_admin()).

## New tables
- `admin_sessions`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles, not null)
  - `login_at` (timestamptz, default now())
  - `logout_at` (timestamptz, nullable)
  - `ip_address` (text, nullable)
  - `user_agent` (text, nullable)
  - `session_token_hash` (text, nullable — SHA-256 hash of access token, never raw)

## Security
- RLS enabled on `admin_sessions`.
- SELECT: only admins (via is_admin()) can read session history.
- INSERT: any authenticated user can insert their own session record (for audit on login).
- UPDATE: only the session owner can update (mark logout).
- DELETE: only admins can delete session records.
- profiles.role: protected by trigger guard_profile_role.
*/

-- =========================================================
-- 1. Lock down profiles.role column via trigger
-- =========================================================

CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the role column is being changed and the current user is NOT an admin, block it
  IF OLD.role IS DISTINCT FROM NEW.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can change user roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_role ON public.profiles;
CREATE TRIGGER trg_guard_profile_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_role();

-- =========================================================
-- 2. Create admin_sessions table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  ip_address text,
  user_agent text,
  session_token_hash text
);

-- Enable RLS
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Only admins can read session history
DROP POLICY IF EXISTS "admin_select_sessions" ON public.admin_sessions;
CREATE POLICY "admin_select_sessions" ON public.admin_sessions
  FOR SELECT TO authenticated
  USING (is_admin());

-- Any authenticated user can INSERT their own session record (audit on login)
DROP POLICY IF EXISTS "insert_own_session" ON public.admin_sessions;
CREATE POLICY "insert_own_session" ON public.admin_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only the session owner can UPDATE their own session (mark logout)
DROP POLICY IF EXISTS "update_own_session" ON public.admin_sessions;
CREATE POLICY "update_own_session" ON public.admin_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only admins can DELETE session records
DROP POLICY IF EXISTS "admin_delete_sessions" ON public.admin_sessions;
CREATE POLICY "admin_delete_sessions" ON public.admin_sessions
  FOR DELETE TO authenticated
  USING (is_admin());

-- Enable realtime for admin dashboards
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_sessions;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON public.admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_login_at ON public.admin_sessions(login_at DESC);
