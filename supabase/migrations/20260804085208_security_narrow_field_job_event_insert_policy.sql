/*
  # Narrow the field job event write policy to INSERT only

  `employee_insert_own_job_events` was created `FOR ALL` with only a WITH CHECK
  expression and no USING expression, so it placed no row restriction on the
  commands that use USING. That widened SELECT and DELETE on
  `field_job_events` to every authenticated user rather than only permitting
  inserts of the caller's own rows.

  1. Changes
     - Replace it with an INSERT-only policy carrying the same WITH CHECK.
     - Reads and updates of own rows continue to come from
       `employee_read_own_job_events`; admins keep `admin_all_field_job_events`.
*/

DROP POLICY IF EXISTS "employee_insert_own_job_events" ON public.field_job_events;

CREATE POLICY "employee_insert_own_job_events"
  ON public.field_job_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (SELECT employees.id FROM employees WHERE employees.user_id = auth.uid())
  );
