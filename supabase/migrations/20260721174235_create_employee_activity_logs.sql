/*
# Create employee_activity_logs table

1. New Tables
- `employee_activity_logs` — timestamped audit trail of key employee actions.
  - `id` (uuid, primary key)
  - `employee_id` (uuid, FK to employees.id ON DELETE CASCADE, not null)
  - `actor_id` (uuid, FK to auth.users.id ON DELETE SET NULL, nullable) — who performed the action
  - `action` (text, not null) — e.g. 'role_assigned', 'role_unassigned', 'status_changed', 'profile_updated', 'login'
  - `description` (text, nullable) — human-readable detail
  - `metadata` (jsonb, nullable) — structured before/after values
  - `created_at` (timestamptz, default now())

2. Indexes
- employee_activity_logs_employee_id_idx (employee_id)
- employee_activity_logs_created_at_idx (created_at desc)

3. Security (RLS)
- Enable RLS. Signed-in app.
- Admins (is_admin()) get full SELECT.
- Employees can SELECT their own logs (employee.user_id = auth.uid()).
- INSERT only for authenticated (admins log actions; edge function logs logins with service role).
- No UPDATE or DELETE — logs are immutable.

4. Notes
- Logs are append-only; no update/delete policies.
- metadata stores before/after for changes like role swaps and status changes.
*/

CREATE TABLE IF NOT EXISTS employee_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_activity_logs_employee_id_idx ON employee_activity_logs(employee_id);
CREATE INDEX IF NOT EXISTS employee_activity_logs_created_at_idx ON employee_activity_logs(created_at DESC);

ALTER TABLE employee_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_activity_logs" ON employee_activity_logs;
CREATE POLICY "select_activity_logs" ON employee_activity_logs
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM employees e WHERE e.id = employee_activity_logs.employee_id AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_activity_logs" ON employee_activity_logs;
CREATE POLICY "insert_activity_logs" ON employee_activity_logs
  FOR INSERT TO authenticated WITH CHECK (true);
