/*
# Fix: Employee cannot see assigned role + add role-based activities

## Problem
The `hr_roles` table has RLS enabled but ALL policies require `is_admin()`.
When a non-admin employee's query joins `hr_roles(...)`, the join is filtered
out by RLS and returns null — so the employee dashboard shows "Unassigned"
even though the role is correctly assigned in the database.

Same issue on `hr_role_permissions`: employees cannot read their own role's
permissions, which blocks the role-based activities feature.

## Fix 1: Allow employees to read active hr_roles
Add a SELECT policy allowing authenticated users to read active roles.
Roles are not sensitive data (name, description, division) — they're
organizational structure that employees need to see.

## Fix 2: Allow employees to read their own role's permissions
Add a SELECT policy allowing employees to read `hr_role_permissions` rows
for their own role_id, so the employee app can show which activities/pages
they have access to.

## New Table: role_activities
Defines activities (pages/actions) that are available to each role/division.
Admins assign activities to roles; employees see the ones matching their role.
*/

-- Fix 1: Let employees read active roles
DROP POLICY IF EXISTS "employee_read_active_hr_roles" ON hr_roles;
CREATE POLICY "employee_read_active_hr_roles" ON hr_roles FOR SELECT
  TO authenticated USING (is_active = true);

-- Fix 2: Let employees read their own role's permissions
DROP POLICY IF EXISTS "employee_read_own_role_permissions" ON hr_role_permissions;
CREATE POLICY "employee_read_own_role_permissions" ON hr_role_permissions FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.role_id = hr_role_permissions.role_id
        AND e.user_id = auth.uid()
    )
  );

-- New table: role_activities
-- Maps activities (pages/tasks) to roles so employees see relevant activities
CREATE TABLE IF NOT EXISTS role_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES hr_roles(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  activity_key text NOT NULL,
  activity_label text NOT NULL,
  activity_description text,
  activity_type text NOT NULL DEFAULT 'page' CHECK (activity_type IN ('page', 'action', 'report')),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, activity_key)
);

ALTER TABLE role_activities ENABLE ROW LEVEL SECURITY;

-- Employees can read activities for their own role
DROP POLICY IF EXISTS "employee_read_own_role_activities" ON role_activities;
CREATE POLICY "employee_read_own_role_activities" ON role_activities FOR SELECT
  TO authenticated USING (
    is_active = true AND (
      -- Match by role_id
      EXISTS (
        SELECT 1 FROM employees e
        WHERE e.role_id = role_activities.role_id
          AND e.user_id = auth.uid()
      )
      -- Or match by service_id (division) if no specific role match
      OR (
        role_activities.role_id IS NULL
        AND EXISTS (
          SELECT 1 FROM employees e
          WHERE e.service_id = role_activities.service_id
            AND e.user_id = auth.uid()
        )
      )
      -- Or global activities (no role_id and no service_id)
      OR (role_activities.role_id IS NULL AND role_activities.service_id IS NULL)
    )
  );

-- Admins have full CRUD on role_activities
DROP POLICY IF EXISTS "admin_select_role_activities" ON role_activities;
CREATE POLICY "admin_select_role_activities" ON role_activities FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_role_activities" ON role_activities;
CREATE POLICY "admin_insert_role_activities" ON role_activities FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_role_activities" ON role_activities;
CREATE POLICY "admin_update_role_activities" ON role_activities FOR UPDATE
  TO authenticated USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_role_activities" ON role_activities;
CREATE POLICY "admin_delete_role_activities" ON role_activities FOR DELETE
  TO authenticated USING (public.is_admin());

-- Seed default activities for each division
INSERT INTO role_activities (role_id, service_id, activity_key, activity_label, activity_description, activity_type, display_order)
SELECT NULL, s.id, 'bookings', 'View Bookings', 'View and track bookings in your division', 'page', 1
FROM services s WHERE s.slug IN ('cleaning-janitorial', 'clearing-forwarding', 'private-security', 'procurement', 'waste-management')
ON CONFLICT DO NOTHING;

INSERT INTO role_activities (role_id, service_id, activity_key, activity_label, activity_description, activity_type, display_order)
SELECT NULL, s.id, 'schedule', 'My Schedule', 'View your assigned work schedule', 'page', 2
FROM services s WHERE s.slug IN ('cleaning-janitorial', 'clearing-forwarding', 'private-security', 'procurement', 'waste-management')
ON CONFLICT DO NOTHING;

INSERT INTO role_activities (role_id, service_id, activity_key, activity_label, activity_description, activity_type, display_order)
SELECT NULL, s.id, 'documents', 'Documents', 'Upload and view division documents', 'page', 3
FROM services s WHERE s.slug IN ('cleaning-janitorial', 'clearing-forwarding', 'private-security', 'procurement', 'waste-management')
ON CONFLICT DO NOTHING;

INSERT INTO role_activities (role_id, service_id, activity_key, activity_label, activity_description, activity_type, display_order)
SELECT NULL, s.id, 'report', 'Submit Report', 'Submit daily or incident reports', 'action', 4
FROM services s WHERE s.slug IN ('cleaning-janitorial', 'clearing-forwarding', 'private-security', 'procurement', 'waste-management')
ON CONFLICT DO NOTHING;

INSERT INTO role_activities (role_id, service_id, activity_key, activity_label, activity_description, activity_type, display_order)
SELECT NULL, s.id, 'performance', 'My Performance', 'View your performance metrics', 'report', 5
FROM services s WHERE s.slug IN ('cleaning-janitorial', 'clearing-forwarding', 'private-security', 'procurement', 'waste-management')
ON CONFLICT DO NOTHING;

-- Global activities (available to all employees regardless of division)
INSERT INTO role_activities (role_id, service_id, activity_key, activity_label, activity_description, activity_type, display_order)
VALUES
  (NULL, NULL, 'profile', 'My Profile', 'View and update your personal information', 'page', 10),
  (NULL, NULL, 'id-card', 'My ID Card', 'View your digital employee ID card', 'page', 11),
  (NULL, NULL, 'cash-collections', 'Cash Collections', 'Record and track cash collections', 'action', 12)
ON CONFLICT DO NOTHING;
