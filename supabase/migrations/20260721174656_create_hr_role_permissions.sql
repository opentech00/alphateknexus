/*
# Create hr_role_permissions table

1. New Tables
- `hr_role_permissions` — maps each HR role to the admin pages/features it can access.
  - `id` (uuid, primary key)
  - `role_id` (uuid, FK to hr_roles.id ON DELETE CASCADE, not null)
  - `page_key` (text, not null) — e.g. 'overview', 'bookings', 'hr-employees'
  - `can_access` (boolean, default true)
  - `created_at` (timestamptz, default now())
  - UNIQUE(role_id, page_key)

2. Indexes
- hr_role_permissions_role_id_idx (role_id)

3. Security (RLS)
- Enable RLS. Signed-in app.
- Admins (is_admin()) get full CRUD.
- No employee self-access — permissions are admin-managed only.

4. Notes
- Each role can have zero or more page permissions. Absence of a row means no access.
- page_key values correspond to the admin sidebar page identifiers.
*/

CREATE TABLE IF NOT EXISTS hr_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES hr_roles(id) ON DELETE CASCADE,
  page_key text NOT NULL,
  can_access boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, page_key)
);

CREATE INDEX IF NOT EXISTS hr_role_permissions_role_id_idx ON hr_role_permissions(role_id);

ALTER TABLE hr_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_role_permissions" ON hr_role_permissions;
CREATE POLICY "select_role_permissions" ON hr_role_permissions
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "insert_role_permissions" ON hr_role_permissions;
CREATE POLICY "insert_role_permissions" ON hr_role_permissions
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "update_role_permissions" ON hr_role_permissions;
CREATE POLICY "update_role_permissions" ON hr_role_permissions
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "delete_role_permissions" ON hr_role_permissions;
CREATE POLICY "delete_role_permissions" ON hr_role_permissions
  FOR DELETE TO authenticated USING (is_admin());
