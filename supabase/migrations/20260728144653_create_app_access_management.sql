/*
# App Access Management

## Overview
Creates a structured app access management system that controls which employees
can access which apps (employee portal vs field staff app). This replaces the
current heuristic of checking role names for "field" or "staff" keywords.

## New Tables

### `app_access`
- `id` (uuid, primary key)
- `employee_id` (uuid, FK to employees.id, unique) — one record per employee
- `app_type` (text, NOT NULL) — which app the employee should see:
  - `'employee'` = standard employee dashboard portal
  - `'field'` = field staff mobile app (jobs, attendance, GPS tracking)
  - `'admin'` = admin panel access (in addition to existing is_admin flag)
- `is_active` (boolean, default true) — whether access is currently enabled
- `granted_by` (uuid, FK to auth.users) — admin who granted the access
- `granted_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())
- `notes` (text, nullable) — optional admin notes about the access grant

## Security
- RLS enabled on `app_access`.
- Employees can read their own access record (to know which app to load).
- Admins (via is_admin() SECURITY DEFINER function) have full CRUD on all rows.
*/

CREATE TABLE IF NOT EXISTS app_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  app_type text NOT NULL DEFAULT 'employee' CHECK (app_type IN ('employee', 'field', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  notes text
);

ALTER TABLE app_access ENABLE ROW LEVEL SECURITY;

-- Employees can read their own access record
DROP POLICY IF EXISTS "select_own_app_access" ON app_access;
CREATE POLICY "select_own_app_access" ON app_access FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = app_access.employee_id AND e.user_id = auth.uid()
    )
  );

-- Admins can read all app access records
DROP POLICY IF EXISTS "admin_select_app_access" ON app_access;
CREATE POLICY "admin_select_app_access" ON app_access FOR SELECT
  TO authenticated USING (public.is_admin());

-- Admins can insert app access records
DROP POLICY IF EXISTS "admin_insert_app_access" ON app_access;
CREATE POLICY "admin_insert_app_access" ON app_access FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

-- Admins can update app access records
DROP POLICY IF EXISTS "admin_update_app_access" ON app_access;
CREATE POLICY "admin_update_app_access" ON app_access FOR UPDATE
  TO authenticated USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admins can delete app access records
DROP POLICY IF EXISTS "admin_delete_app_access" ON app_access;
CREATE POLICY "admin_delete_app_access" ON app_access FOR DELETE
  TO authenticated USING (public.is_admin());

-- Auto-update updated_at on changes
CREATE OR REPLACE TRIGGER update_app_access_timestamp
  BEFORE UPDATE ON app_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed existing employees: those with field-like roles get 'field', others get 'employee'
INSERT INTO app_access (employee_id, app_type, is_active)
SELECT e.id,
  CASE
    WHEN LOWER(COALESCE(hr.name, '')) LIKE '%field%' OR
         LOWER(COALESCE(e.position, '')) LIKE '%field%' OR
         LOWER(COALESCE(hr.name, '')) LIKE '%staff%'
    THEN 'field'
    ELSE 'employee'
  END,
  true
FROM employees e
LEFT JOIN hr_roles hr ON e.role_id = hr.id
WHERE NOT EXISTS (
  SELECT 1 FROM app_access aa WHERE aa.employee_id = e.id
)
ON CONFLICT (employee_id) DO NOTHING;
