/*
# Task Delegation & Reporting Hierarchy System

## Purpose
Creates a structured delegation system so the CEO, service managers, and supervisors
can assign tasks to subordinates with full tracking, acceptance/decline workflow,
priority levels, due dates, and an audit trail. Also adds a reporting hierarchy
(reports_to) to employees so the org chart is explicit and delegation chains
can be validated server-side.

## New Tables

### 1. `task_delegations` — Main task assignment table
- `id` (uuid PK)
- `title` (text, not null) — task title
- `description` (text) — detailed task instructions
- `service_id` (uuid FK → services) — which division this task belongs to
- `assigned_by` (uuid FK → profiles, not null) — who delegated the task (manager/CEO)
- `assigned_to` (uuid FK → profiles, not null) — who receives the task (subordinate)
- `assigned_by_employee_id` (uuid FK → employees) — employee record of assigner
- `assigned_to_employee_id` (uuid FK → employees) — employee record of assignee
- `booking_id` (uuid FK → bookings, nullable) — link to a specific booking if relevant
- `status` (text, CHECK in pending/accepted/declined/in_progress/completed/cancelled, default 'pending')
- `priority` (text, CHECK in low/medium/high/urgent, default 'medium')
- `due_date` (date, nullable) — deadline
- `accepted_at` (timestamptz, nullable) — when assignee accepted
- `declined_at` (timestamptz, nullable) — when assignee declined
- `decline_reason` (text, nullable) — reason for declining
- `completed_at` (timestamptz, nullable) — when marked complete
- `completion_notes` (text, nullable) — notes from assignee on completion
- `parent_task_id` (uuid FK → task_delegations, nullable) — for sub-task delegation chains
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 2. `task_progress_updates` — Progress tracking on delegated tasks
- `id` (uuid PK)
- `task_id` (uuid FK → task_delegations ON DELETE CASCADE)
- `update_by` (uuid FK → profiles, not null) — who posted the update
- `status_from` (text) — previous status
- `status_to` (text) — new status
- `message` (text, nullable) — progress notes
- `created_at` (timestamptz, default now())

### 3. `delegation_audit_log` — Audit trail for all delegation actions
- `id` (uuid PK)
- `task_id` (uuid FK → task_delegations ON DELETE CASCADE)
- `actor_id` (uuid FK → profiles, not null) — who performed the action
- `action` (text, CHECK in created/accepted/declined/started/completed/cancelled/reassigned/priority_changed/due_date_changed)
- `details` (jsonb) — before/after values
- `created_at` (timestamptz, default now())

## Modified Tables

### `employees` — Add `reports_to` column
- `reports_to` (uuid FK → employees.id ON DELETE SET NULL, nullable)
  This creates the reporting hierarchy. A CEO has reports_to = NULL.
  A service manager reports to the CEO. A supervisor reports to their manager. Etc.

## Security (RLS)

All tables get RLS enabled with the following access model:
- **Admins** (is_admin()): full CRUD on all delegation tables
- **Managers/assigners**: can SELECT/INSERT/UPDATE tasks they assigned (assigned_by = auth.uid())
- **Assignees**: can SELECT tasks assigned to them (assigned_to = auth.uid()), can UPDATE status fields
- **Progress updates**: assigner + assignee can INSERT; both can SELECT
- **Audit log**: everyone who can see the task can SELECT; only the system (via trigger) INSERTs

## Helper Function

### `can_user_delegate_to(assigner_uid, assignee_uid)`
Returns boolean — checks if the assigner is either an admin, the assignee's direct manager
(via employees.reports_to → employees.user_id), or a service manager in the same division.
This is a SECURITY DEFINER function to avoid RLS recursion.
*/

-- ═════════════════════════════════════════════════════════════
-- 1. Add reports_to column to employees
-- ═════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'reports_to'
  ) THEN
    ALTER TABLE employees
    ADD COLUMN reports_to uuid REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════
-- 2. Create task_delegations table
-- ═════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS task_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  assigned_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  assigned_to_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date date,
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  completed_at timestamptz,
  completion_notes text,
  parent_task_id uuid REFERENCES task_delegations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_task_delegations" ON task_delegations;
CREATE POLICY "admin_all_task_delegations" ON task_delegations
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "assigner_select_tasks" ON task_delegations;
CREATE POLICY "assigner_select_tasks" ON task_delegations
  FOR SELECT TO authenticated
  USING (assigned_by = auth.uid());

DROP POLICY IF EXISTS "assignee_select_tasks" ON task_delegations;
CREATE POLICY "assignee_select_tasks" ON task_delegations
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

DROP POLICY IF EXISTS "assigner_insert_tasks" ON task_delegations;
CREATE POLICY "assigner_insert_tasks" ON task_delegations
  FOR INSERT TO authenticated
  WITH CHECK (assigned_by = auth.uid());

DROP POLICY IF EXISTS "assigner_update_tasks" ON task_delegations;
CREATE POLICY "assigner_update_tasks" ON task_delegations
  FOR UPDATE TO authenticated
  USING (assigned_by = auth.uid())
  WITH CHECK (assigned_by = auth.uid());

DROP POLICY IF EXISTS "assignee_update_task_status" ON task_delegations;
CREATE POLICY "assignee_update_task_status" ON task_delegations
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- ═════════════════════════════════════════════════════════════
-- 3. Create task_progress_updates table
-- ═════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS task_progress_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES task_delegations(id) ON DELETE CASCADE,
  update_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status_from text,
  status_to text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_progress_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_progress" ON task_progress_updates;
CREATE POLICY "admin_all_progress" ON task_progress_updates
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "task_participant_select_progress" ON task_progress_updates;
CREATE POLICY "task_participant_select_progress" ON task_progress_updates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_delegations td
      WHERE td.id = task_progress_updates.task_id
      AND (td.assigned_by = auth.uid() OR td.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS "task_participant_insert_progress" ON task_progress_updates;
CREATE POLICY "task_participant_insert_progress" ON task_progress_updates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM task_delegations td
      WHERE td.id = task_progress_updates.task_id
      AND (td.assigned_by = auth.uid() OR td.assigned_to = auth.uid())
    )
  );

-- ═════════════════════════════════════════════════════════════
-- 4. Create delegation_audit_log table
-- ═════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS delegation_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES task_delegations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action text NOT NULL
    CHECK (action IN ('created', 'accepted', 'declined', 'started', 'completed', 'cancelled', 'reassigned', 'priority_changed', 'due_date_changed')),
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delegation_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_audit" ON delegation_audit_log;
CREATE POLICY "admin_all_audit" ON delegation_audit_log
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "task_participant_select_audit" ON delegation_audit_log;
CREATE POLICY "task_participant_select_audit" ON delegation_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_delegations td
      WHERE td.id = delegation_audit_log.task_id
      AND (td.assigned_by = auth.uid() OR td.assigned_to = auth.uid())
    )
  );

-- ═════════════════════════════════════════════════════════════
-- 5. Helper function: can_user_delegate_to
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION can_user_delegate_to(assigner_uid uuid, assignee_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    -- Admins can delegate to anyone
    EXISTS (SELECT 1 FROM profiles WHERE id = assigner_uid AND role = 'admin')
    OR
    -- Assigner is the assignee's direct manager (via reports_to → user_id)
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.user_id = assignee_uid
      AND e.reports_to IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM employees mgr
        WHERE mgr.id = e.reports_to
        AND mgr.user_id = assigner_uid
      )
    )
    OR
    -- Assigner is in the same division as the assignee (service manager delegating within their division)
    EXISTS (
      SELECT 1 FROM employees assigner_emp
      JOIN employees assignee_emp ON assignee_emp.user_id = assignee_uid
      WHERE assigner_emp.user_id = assigner_uid
      AND assigner_emp.service_id = assignee_emp.service_id
      AND assigner_emp.id != assignee_emp.id
    )
    OR
    -- Self-assignment (creating a task for yourself)
    assigner_uid = assignee_uid
$$;

-- ═════════════════════════════════════════════════════════════
-- 6. Trigger: auto-populate employee IDs and audit log on insert
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_task_delegation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Auto-populate employee IDs from user IDs if not provided
  IF NEW.assigned_by_employee_id IS NULL THEN
    SELECT id INTO NEW.assigned_by_employee_id FROM employees WHERE user_id = NEW.assigned_by LIMIT 1;
  END IF;
  IF NEW.assigned_to_employee_id IS NULL THEN
    SELECT id INTO NEW.assigned_to_employee_id FROM employees WHERE user_id = NEW.assigned_to LIMIT 1;
  END IF;

  -- Insert audit log entry
  INSERT INTO delegation_audit_log (task_id, actor_id, action, details)
  VALUES (NEW.id, NEW.assigned_by, 'created',
    jsonb_build_object('title', NEW.title, 'priority', NEW.priority, 'assigned_to', NEW.assigned_to));

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_delegation_insert ON task_delegations;
CREATE TRIGGER trg_task_delegation_insert
  AFTER INSERT ON task_delegations
  FOR EACH ROW EXECUTE FUNCTION handle_task_delegation_insert();

-- ═════════════════════════════════════════════════════════════
-- 7. Trigger: audit log on status change + progress update
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_task_delegation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  actor uuid;
BEGIN
  -- Determine who made the change
  actor := COALESCE(
    (SELECT assigned_by FROM task_delegations WHERE id = NEW.id),
    (SELECT assigned_to FROM task_delegations WHERE id = NEW.id)
  );

  -- Status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Map status to audit action
    INSERT INTO delegation_audit_log (task_id, actor_id, action, details)
    VALUES (
      NEW.id,
      CASE
        WHEN NEW.status = 'accepted' THEN NEW.assigned_to
        WHEN NEW.status = 'declined' THEN NEW.assigned_to
        WHEN NEW.status = 'in_progress' THEN NEW.assigned_to
        WHEN NEW.status = 'completed' THEN NEW.assigned_to
        WHEN NEW.status = 'cancelled' THEN NEW.assigned_by
        ELSE actor
      END,
      CASE NEW.status
        WHEN 'accepted' THEN 'accepted'
        WHEN 'declined' THEN 'declined'
        WHEN 'in_progress' THEN 'started'
        WHEN 'completed' THEN 'completed'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'started'
      END,
      jsonb_build_object('from', OLD.status, 'to', NEW.status,
        CASE WHEN NEW.status = 'declined' AND NEW.decline_reason IS NOT NULL
          THEN 'reason' ELSE NULL END,
        CASE WHEN NEW.status = 'declined' AND NEW.decline_reason IS NOT NULL
          THEN NEW.decline_reason ELSE NULL END)
    );

    -- Insert progress update
    INSERT INTO task_progress_updates (task_id, update_by, status_from, status_to, message)
    VALUES (
      NEW.id,
      CASE
        WHEN NEW.status IN ('accepted', 'declined', 'in_progress', 'completed') THEN NEW.assigned_to
        ELSE NEW.assigned_by
      END,
      OLD.status,
      NEW.status,
      CASE WHEN NEW.status = 'declined' THEN NEW.decline_reason
           WHEN NEW.status = 'completed' THEN NEW.completion_notes
           ELSE NULL END
    );
  END IF;

  -- Priority changed
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO delegation_audit_log (task_id, actor_id, action, details)
    VALUES (NEW.id, actor, 'priority_changed',
      jsonb_build_object('from', OLD.priority, 'to', NEW.priority));
  END IF;

  -- Due date changed
  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO delegation_audit_log (task_id, actor_id, action, details)
    VALUES (NEW.id, actor, 'due_date_changed',
      jsonb_build_object('from', OLD.due_date, 'to', NEW.due_date));
  END IF;

  -- Reassigned
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO delegation_audit_log (task_id, actor_id, action, details)
    VALUES (NEW.id, actor, 'reassigned',
      jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_delegation_update ON task_delegations;
CREATE TRIGGER trg_task_delegation_update
  BEFORE UPDATE ON task_delegations
  FOR EACH ROW EXECUTE FUNCTION handle_task_delegation_update();

-- ═════════════════════════════════════════════════════════════
-- 8. Indexes for performance
-- ═════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_task_delegations_assigned_by ON task_delegations(assigned_by);
CREATE INDEX IF NOT EXISTS idx_task_delegations_assigned_to ON task_delegations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_task_delegations_service_id ON task_delegations(service_id);
CREATE INDEX IF NOT EXISTS idx_task_delegations_status ON task_delegations(status);
CREATE INDEX IF NOT EXISTS idx_task_delegations_parent_task ON task_delegations(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_task_id ON task_progress_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_task_id ON delegation_audit_log(task_id);
CREATE INDEX IF NOT EXISTS idx_employees_reports_to ON employees(reports_to);

-- ═════════════════════════════════════════════════════════════
-- 9. Grant execute on helper function
-- ═════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION can_user_delegate_to(uuid, uuid) TO authenticated;
