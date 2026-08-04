/*
  # Narrow the offline sync queue write policy to INSERT only

  `employee_insert_own_sync_queue` was created `FOR ALL` with only a WITH CHECK
  expression and no USING expression, so it placed no row restriction on the
  commands that use USING. That widened SELECT and DELETE on
  `field_offline_sync_queue` to every authenticated user rather than only
  permitting inserts of the caller's own rows.

  1. Changes
     - Replace it with an INSERT-only policy carrying the same WITH CHECK.
     - Reads and updates of own rows continue to come from
       `employee_read_own_sync_queue` and `employee_update_own_sync_queue`;
       admins keep `admin_all_offline_sync_queue`.
*/

DROP POLICY IF EXISTS "employee_insert_own_sync_queue" ON public.field_offline_sync_queue;

CREATE POLICY "employee_insert_own_sync_queue"
  ON public.field_offline_sync_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (SELECT employees.id FROM employees WHERE employees.user_id = auth.uid())
  );
