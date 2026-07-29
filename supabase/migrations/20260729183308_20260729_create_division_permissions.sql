/*
# Create Division Permissions Table

## Purpose
Adds role-based access control for all 5 operational divisions:
Clearing & Forwarding, Smart Sort, Cleaning Services, Private Security, Procurement.

## New Tables
- `division_permissions`
  - `id` (uuid, PK)
  - `user_id` (uuid, FK → profiles.id) — the team member being granted access
  - `division_slug` (text) — one of: clearing-forwarding, smart-sort, cleaning-services, private-security, procurement
  - `can_view` (bool, default true) — view bookings and request data for this division
  - `can_manage_bookings` (bool, default false) — update booking status, assign jobs
  - `can_approve_quotes` (bool, default false) — approve or reject quote requests
  - `can_manage_documents` (bool, default false) — upload and manage booking documents
  - `can_message_clients` (bool, default false) — send messages to clients
  - `can_delete_records` (bool, default false) — delete bookings and records
  - `created_at`, `updated_at` timestamps
  - UNIQUE constraint on (user_id, division_slug) — one row per user per division

## Security
- RLS enabled
- Full admins (is_admin()) can read, insert, update, delete all rows
- Authenticated users can read their own permission rows
*/

CREATE TABLE IF NOT EXISTS division_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  division_slug text NOT NULL CHECK (division_slug IN ('clearing-forwarding','smart-sort','cleaning-services','private-security','procurement')),
  can_view boolean NOT NULL DEFAULT true,
  can_manage_bookings boolean NOT NULL DEFAULT false,
  can_approve_quotes boolean NOT NULL DEFAULT false,
  can_manage_documents boolean NOT NULL DEFAULT false,
  can_message_clients boolean NOT NULL DEFAULT false,
  can_delete_records boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, division_slug)
);

ALTER TABLE division_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_division_permissions" ON division_permissions;
CREATE POLICY "admin_select_division_permissions" ON division_permissions FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_division_permissions" ON division_permissions;
CREATE POLICY "admin_insert_division_permissions" ON division_permissions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_division_permissions" ON division_permissions;
CREATE POLICY "admin_update_division_permissions" ON division_permissions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_division_permissions" ON division_permissions;
CREATE POLICY "admin_delete_division_permissions" ON division_permissions FOR DELETE
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "self_select_division_permissions" ON division_permissions;
CREATE POLICY "self_select_division_permissions" ON division_permissions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_division_permissions_user ON division_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_division_permissions_slug ON division_permissions(division_slug);
