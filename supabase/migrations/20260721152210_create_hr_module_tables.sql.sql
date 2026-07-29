/*
# Create HR module tables (hr_roles, employees, id_cards)

1. New Tables
- `hr_roles` — role definitions created by HR. Each role belongs to a service/division
  and describes a position staff can be assigned to.
  - `id` (uuid, primary key)
  - `service_id` (uuid, FK to services.id, nullable so a role can span divisions)
  - `name` (text, not null) — e.g. "Driver", "Sorter", "Guard"
  - `description` (text, nullable)
  - `is_active` (boolean, default true)
  - `created_at` (timestamptz, default now())

- `employees` — staff records managed by HR. Each employee is assigned a role
  and a service/division, and may optionally have a portal login (linked to auth.users).
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users.id ON DELETE SET NULL, nullable)
  - `employee_number` (text, unique, not null) — auto-generated e.g. ATN-0001
  - `full_name` (text, not null)
  - `email` (text, not null)
  - `phone` (text, nullable)
  - `service_id` (uuid, FK to services.id, nullable) — division assignment
  - `role_id` (uuid, FK to hr_roles.id, nullable)
  - `photo_url` (text, nullable)
  - `hire_date` (date, nullable)
  - `status` (text, default 'active') — active | on_leave | inactive
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

- `id_cards` — generated staff ID cards. One per employee, regenerable.
  - `id` (uuid, primary key)
  - `employee_id` (uuid, FK to employees.id ON DELETE CASCADE, unique)
  - `card_number` (text, unique, not null) — e.g. ATN-2026-0001
  - `qr_payload` (text, not null)
  - `issue_date` (date, not null, default current_date)
  - `expiry_date` (date, nullable)
  - `status` (text, default 'active') — active | expired | revoked
  - `created_at` (timestamptz, default now())

2. Indexes
- employees_service_id_idx, employees_role_id_idx, employees_status_idx
- hr_roles_service_id_idx

3. Security (RLS)
- Enable RLS on all three tables. Signed-in app.
- Admins (profiles.role = 'admin') get full CRUD via is_admin() helper.
- Staff can read/update only their own employee record (user_id = auth.uid()).
- Four separate policies per table (select/insert/update/delete) — no FOR ALL.
- is_admin() is SECURITY DEFINER to avoid recursive RLS on profiles.

4. Notes
- employees.user_id is nullable: staff without portal login still have an HR record.
- hr_roles.service_id is nullable: a role can be division-agnostic.
- No user_id DEFAULT auth.uid() on employees because admin creates records on behalf of staff.
*/

CREATE TABLE IF NOT EXISTS hr_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_number text UNIQUE NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  role_id uuid REFERENCES hr_roles(id) ON DELETE SET NULL,
  photo_url text,
  hire_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active','on_leave','inactive'])),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS id_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  card_number text UNIQUE NOT NULL,
  qr_payload text NOT NULL,
  issue_date date NOT NULL DEFAULT current_date,
  expiry_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active','expired','revoked'])),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employees_service_id_idx ON employees(service_id);
CREATE INDEX IF NOT EXISTS employees_role_id_idx ON employees(role_id);
CREATE INDEX IF NOT EXISTS employees_status_idx ON employees(status);
CREATE INDEX IF NOT EXISTS hr_roles_service_id_idx ON hr_roles(service_id);

ALTER TABLE hr_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE id_cards ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- hr_roles policies
DROP POLICY IF EXISTS "select_hr_roles" ON hr_roles;
CREATE POLICY "select_hr_roles" ON hr_roles
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "insert_hr_roles" ON hr_roles;
CREATE POLICY "insert_hr_roles" ON hr_roles
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "update_hr_roles" ON hr_roles;
CREATE POLICY "update_hr_roles" ON hr_roles
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "delete_hr_roles" ON hr_roles;
CREATE POLICY "delete_hr_roles" ON hr_roles
  FOR DELETE TO authenticated USING (is_admin());

-- employees policies
DROP POLICY IF EXISTS "select_employees" ON employees;
CREATE POLICY "select_employees" ON employees
  FOR SELECT TO authenticated USING (is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "insert_employees" ON employees;
CREATE POLICY "insert_employees" ON employees
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "update_employees" ON employees;
CREATE POLICY "update_employees" ON employees
  FOR UPDATE TO authenticated USING (is_admin() OR user_id = auth.uid()) WITH CHECK (is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "delete_employees" ON employees;
CREATE POLICY "delete_employees" ON employees
  FOR DELETE TO authenticated USING (is_admin());

-- id_cards policies
DROP POLICY IF EXISTS "select_id_cards" ON id_cards;
CREATE POLICY "select_id_cards" ON id_cards
  FOR SELECT TO authenticated USING (is_admin() OR EXISTS (
    SELECT 1 FROM employees e WHERE e.id = id_cards.employee_id AND e.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "insert_id_cards" ON id_cards;
CREATE POLICY "insert_id_cards" ON id_cards
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "update_id_cards" ON id_cards;
CREATE POLICY "update_id_cards" ON id_cards
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "delete_id_cards" ON id_cards;
CREATE POLICY "delete_id_cards" ON id_cards
  FOR DELETE TO authenticated USING (is_admin());
