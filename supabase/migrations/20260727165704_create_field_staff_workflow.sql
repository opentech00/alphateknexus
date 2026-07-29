/*
# Field Staff Workflow – Full Schema

Creates all tables needed to power the Alphatek Nexus Field Staff mobile app,
covering the complete "assignment to completion" workflow shown in the UI mockups.

## New Tables

### field_assignments
Each row is a job assigned to a specific employee.
- Links to `employees` (who does the work) and `services` (what service)
- Contains customer info, location, schedule, amount, instructions
- Tracks status through the full workflow lifecycle
- status values: pending | assigned | accepted | declined | in_progress |
  pending_review | approved | rejected

### field_assignment_tasks
Checklist items for a given assignment (copied from the service template
when the assignment is created, or custom per job).
- task_text: the checklist item label
- completed: whether the field worker has ticked it off

### field_checklist_templates
Default checklist items per service slug (e.g. "cleaning" has Sweep Floors, etc.)
- Seeded with realistic items for each service type

### field_check_ins
GPS check-in / check-out record per assignment.
- Captures latitude, longitude, time, and optional photo

### field_evidence
Before / after photos uploaded by the field worker per assignment.
- photo_type: 'before' | 'after'

### field_job_signatures
Customer signature captured as a base64 data-URL per assignment.

### field_incidents
Incident reports filed by field workers.
- incident_type: Equipment Issue | Safety Hazard | Customer Complaint |
  Property Damage | Other
- Can be linked to an assignment (nullable for general reports)
- optional photo

### field_attendance
Daily clock-in / clock-out log per employee.

### field_job_notes
Free-form notes added by the worker during a job.

## RLS Policy Strategy
- All tables use `authenticated` role.
- Field workers (employees) can read/write their own rows via `employee_id` join.
- Admins can read/write all rows via `is_admin()`.
- `field_checklist_templates` is public-readable (SELECT to authenticated).
*/

-- ─── field_assignments ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  service_id      uuid REFERENCES services(id) ON DELETE SET NULL,
  service_name    text NOT NULL,
  customer_name   text NOT NULL DEFAULT '',
  address         text NOT NULL DEFAULT '',
  scheduled_date  date,
  scheduled_time  text,
  instructions    text,
  amount          numeric(12,2),
  status          text NOT NULL DEFAULT 'assigned'
                  CHECK (status IN ('pending','assigned','accepted','declined',
                                    'in_progress','pending_review','approved','rejected')),
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE field_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_select_own_assignments"   ON field_assignments;
DROP POLICY IF EXISTS "employees_update_own_assignments"   ON field_assignments;
DROP POLICY IF EXISTS "admin_select_all_assignments"       ON field_assignments;
DROP POLICY IF EXISTS "admin_insert_assignments"           ON field_assignments;
DROP POLICY IF EXISTS "admin_update_all_assignments"       ON field_assignments;
DROP POLICY IF EXISTS "admin_delete_assignments"           ON field_assignments;

CREATE POLICY "employees_select_own_assignments" ON field_assignments FOR SELECT
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "employees_update_own_assignments" ON field_assignments FOR UPDATE
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "admin_insert_assignments" ON field_assignments FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "admin_delete_assignments" ON field_assignments FOR DELETE
  TO authenticated
  USING (is_admin());

-- ─── field_assignment_tasks ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_assignment_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  task_text       text NOT NULL,
  completed       boolean NOT NULL DEFAULT false,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE field_assignment_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_select_own_tasks"  ON field_assignment_tasks;
DROP POLICY IF EXISTS "employees_insert_own_tasks"  ON field_assignment_tasks;
DROP POLICY IF EXISTS "employees_update_own_tasks"  ON field_assignment_tasks;
DROP POLICY IF EXISTS "admin_all_tasks"             ON field_assignment_tasks;

CREATE POLICY "employees_select_own_tasks" ON field_assignment_tasks FOR SELECT
  TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM field_assignments
      WHERE employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  );

CREATE POLICY "employees_insert_own_tasks" ON field_assignment_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    assignment_id IN (
      SELECT id FROM field_assignments
      WHERE employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  );

CREATE POLICY "employees_update_own_tasks" ON field_assignment_tasks FOR UPDATE
  TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM field_assignments
      WHERE employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  )
  WITH CHECK (
    assignment_id IN (
      SELECT id FROM field_assignments
      WHERE employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  );

CREATE POLICY "admin_delete_tasks" ON field_assignment_tasks FOR DELETE
  TO authenticated USING (is_admin());

-- ─── field_checklist_templates ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_checklist_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_slug text NOT NULL,
  item_text    text NOT NULL,
  sort_order   int NOT NULL DEFAULT 0
);

ALTER TABLE field_checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_templates" ON field_checklist_templates;
CREATE POLICY "auth_select_templates" ON field_checklist_templates FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_templates" ON field_checklist_templates;
CREATE POLICY "admin_manage_templates" ON field_checklist_templates FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Seed default checklists
INSERT INTO field_checklist_templates (service_slug, item_text, sort_order) VALUES
  ('cleaning-janitorial', 'Sweep Floors',          1),
  ('cleaning-janitorial', 'Mop Floors',             2),
  ('cleaning-janitorial', 'Clean Toilets',          3),
  ('cleaning-janitorial', 'Disinfect Surfaces',     4),
  ('cleaning-janitorial', 'Empty Bins',             5),
  ('cleaning-janitorial', 'Final Inspection',       6),
  ('private-security',    'Site Briefing',          1),
  ('private-security',    'Perimeter Check',        2),
  ('private-security',    'Log Entry/Exit',         3),
  ('private-security',    'Incident Sweep',         4),
  ('private-security',    'End-of-Shift Report',    5),
  ('clearing-forwarding', 'Document Verification',  1),
  ('clearing-forwarding', 'Cargo Inspection',       2),
  ('clearing-forwarding', 'Customs Paperwork',      3),
  ('clearing-forwarding', 'Loading / Offloading',   4),
  ('clearing-forwarding', 'Delivery Confirmation',  5),
  ('smart-sort',          'Arrival Check-In',       1),
  ('smart-sort',          'Sort Recyclables',       2),
  ('smart-sort',          'Collect Waste Bags',     3),
  ('smart-sort',          'Weigh & Record',         4),
  ('smart-sort',          'Clean Up Area',          5),
  ('procurement',         'Receive Purchase Order', 1),
  ('procurement',         'Verify Item List',       2),
  ('procurement',         'Collect Items',          3),
  ('procurement',         'Quality Check',          4),
  ('procurement',         'Delivery / Hand-Off',    5)
ON CONFLICT DO NOTHING;

-- ─── field_check_ins ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_check_ins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  checkin_time    timestamptz,
  checkout_time   timestamptz,
  latitude        double precision,
  longitude       double precision,
  checkin_photo_url text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE field_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_select_own_checkins" ON field_check_ins;
DROP POLICY IF EXISTS "employees_insert_own_checkins" ON field_check_ins;
DROP POLICY IF EXISTS "employees_update_own_checkins" ON field_check_ins;
DROP POLICY IF EXISTS "admin_select_checkins"         ON field_check_ins;

CREATE POLICY "employees_select_own_checkins" ON field_check_ins FOR SELECT
  TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "employees_insert_own_checkins" ON field_check_ins FOR INSERT
  TO authenticated
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "employees_update_own_checkins" ON field_check_ins FOR UPDATE
  TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) OR is_admin())
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) OR is_admin());

-- ─── field_evidence ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_evidence (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  photo_url       text NOT NULL,
  photo_type      text NOT NULL DEFAULT 'before' CHECK (photo_type IN ('before','after')),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE field_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_select_own_evidence" ON field_evidence;
DROP POLICY IF EXISTS "employees_insert_own_evidence" ON field_evidence;
DROP POLICY IF EXISTS "employees_delete_own_evidence" ON field_evidence;
DROP POLICY IF EXISTS "admin_all_evidence"            ON field_evidence;

CREATE POLICY "employees_select_own_evidence" ON field_evidence FOR SELECT
  TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "employees_insert_own_evidence" ON field_evidence FOR INSERT
  TO authenticated
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "employees_delete_own_evidence" ON field_evidence FOR DELETE
  TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) OR is_admin());

-- ─── field_job_signatures ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_job_signatures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  signature_data  text NOT NULL,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE field_job_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_select_own_signatures" ON field_job_signatures;
DROP POLICY IF EXISTS "employees_insert_own_signatures" ON field_job_signatures;
DROP POLICY IF EXISTS "employees_update_own_signatures" ON field_job_signatures;
DROP POLICY IF EXISTS "admin_select_signatures"         ON field_job_signatures;

CREATE POLICY "employees_select_own_signatures" ON field_job_signatures FOR SELECT
  TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM field_assignments
      WHERE employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  );

CREATE POLICY "employees_insert_own_signatures" ON field_job_signatures FOR INSERT
  TO authenticated
  WITH CHECK (
    assignment_id IN (
      SELECT id FROM field_assignments
      WHERE employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  );

CREATE POLICY "employees_update_own_signatures" ON field_job_signatures FOR UPDATE
  TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM field_assignments
      WHERE employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  )
  WITH CHECK (
    assignment_id IN (
      SELECT id FROM field_assignments
      WHERE employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  );

-- ─── field_incidents ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_incidents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid REFERENCES field_assignments(id) ON DELETE SET NULL,
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  incident_type   text NOT NULL DEFAULT 'Other'
                  CHECK (incident_type IN ('Equipment Issue','Safety Hazard',
                         'Customer Complaint','Property Damage','Other')),
  description     text NOT NULL,
  photo_url       text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','closed')),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE field_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_select_own_incidents" ON field_incidents;
DROP POLICY IF EXISTS "employees_insert_own_incidents" ON field_incidents;
DROP POLICY IF EXISTS "admin_select_incidents"         ON field_incidents;
DROP POLICY IF EXISTS "admin_update_incidents"         ON field_incidents;

CREATE POLICY "employees_select_own_incidents" ON field_incidents FOR SELECT
  TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "employees_insert_own_incidents" ON field_incidents FOR INSERT
  TO authenticated
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

CREATE POLICY "admin_update_incidents" ON field_incidents FOR UPDATE
  TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ─── field_attendance ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date       date NOT NULL,
  clock_in        timestamptz,
  clock_out       timestamptz,
  latitude        double precision,
  longitude       double precision,
  status          text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','half_day','late')),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

ALTER TABLE field_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_select_own_attendance" ON field_attendance;
DROP POLICY IF EXISTS "employees_insert_own_attendance" ON field_attendance;
DROP POLICY IF EXISTS "employees_update_own_attendance" ON field_attendance;
DROP POLICY IF EXISTS "admin_select_attendance"         ON field_attendance;

CREATE POLICY "employees_select_own_attendance" ON field_attendance FOR SELECT
  TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "employees_insert_own_attendance" ON field_attendance FOR INSERT
  TO authenticated
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

CREATE POLICY "employees_update_own_attendance" ON field_attendance FOR UPDATE
  TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_field_assignments_employee_id   ON field_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_field_assignments_status        ON field_assignments(status);
CREATE INDEX IF NOT EXISTS idx_field_assignment_tasks_assign   ON field_assignment_tasks(assignment_id);
CREATE INDEX IF NOT EXISTS idx_field_check_ins_assignment      ON field_check_ins(assignment_id);
CREATE INDEX IF NOT EXISTS idx_field_evidence_assignment       ON field_evidence(assignment_id);
CREATE INDEX IF NOT EXISTS idx_field_incidents_employee        ON field_incidents(employee_id);
CREATE INDEX IF NOT EXISTS idx_field_attendance_employee_date  ON field_attendance(employee_id, work_date);
