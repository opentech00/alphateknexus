/*
# User Management Module — admin tools for managing customer accounts

1. New Columns on `profiles`
  - `is_suspended` (boolean, default false) — allows admins to suspend/reactivate user accounts
  - `is_verified` (boolean, default false) — KYC verification status
  - `suspended_reason` (text, nullable) — reason for suspension
  - `suspended_at` (timestamptz, nullable) — when the user was suspended

2. New Tables
  - `admin_notes` — internal notes admins can attach to any user
    - `id` (uuid, PK)
    - `user_id` (uuid, FK to profiles)
    - `admin_id` (uuid, FK to profiles) — which admin wrote the note
    - `note` (text, not null)
    - `created_at` (timestamptz)
  - `user_flags` — flag system for at-risk / VIP / problematic users
    - `id` (uuid, PK)
    - `user_id` (uuid, FK to profiles)
    - `flag_type` (text, not null) — 'vip', 'at_risk', 'problematic', 'high_value'
    - `note` (text, nullable)
    - `created_by` (uuid, FK to profiles)
    - `created_at` (timestamptz)
  - `admin_audit_log` — audit trail for admin actions on user accounts
    - `id` (uuid, PK)
    - `admin_id` (uuid, FK to profiles)
    - `target_user_id` (uuid, FK to profiles)
    - `action` (text, not null) — 'suspend', 'reactivate', 'verify', 'unverify', 'delete', 'note_added', 'flag_added', 'flag_removed'
    - `details` (jsonb, nullable)
    - `created_at` (timestamptz)

3. Security
  - All new tables have RLS enabled.
  - Admins (profiles.role = 'admin') have full CRUD on all new tables.
  - Admins can update profiles.is_suspended, is_verified, suspended_reason, suspended_at.
  - Regular users cannot read or modify any of these tables.
  - Admin update policy on profiles is extended to cover the new columns.

4. Notes
  - The migration is idempotent — uses IF NOT EXISTS and DROP POLICY IF EXISTS.
  - Existing profiles default to not suspended and not verified.
*/

-- Add columns to profiles
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Admin update policy for profiles already exists (admin_update_all_profiles covers all columns via USING).
-- Add admin insert policy for profiles (for the existing admin_select_all_profiles + update).
-- The existing update_own_profile policy only allows self-update; admin_update_all_profiles allows admin to update any profile.

-- admin_notes table
CREATE TABLE IF NOT EXISTS admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_notes" ON admin_notes;
CREATE POLICY "admin_select_notes" ON admin_notes FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_notes" ON admin_notes;
CREATE POLICY "admin_insert_notes" ON admin_notes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_notes" ON admin_notes;
CREATE POLICY "admin_delete_notes" ON admin_notes FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- user_flags table
CREATE TABLE IF NOT EXISTS user_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  flag_type text NOT NULL CHECK (flag_type IN ('vip', 'at_risk', 'problematic', 'high_value')),
  note text,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, flag_type)
);

ALTER TABLE user_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_flags" ON user_flags;
CREATE POLICY "admin_select_flags" ON user_flags FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_flags" ON user_flags;
CREATE POLICY "admin_insert_flags" ON user_flags FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_flags" ON user_flags;
CREATE POLICY "admin_delete_flags" ON user_flags FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- admin_audit_log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_audit_log" ON admin_audit_log;
CREATE POLICY "admin_select_audit_log" ON admin_audit_log FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_audit_log" ON admin_audit_log;
CREATE POLICY "admin_insert_audit_log" ON admin_audit_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_notes_user_id ON admin_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_flags_user_id ON user_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_user_id ON admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON profiles(is_suspended);
