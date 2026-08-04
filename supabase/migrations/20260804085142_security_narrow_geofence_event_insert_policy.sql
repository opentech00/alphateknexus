/*
  # Narrow the geofence event write policy to INSERT only

  `employee_insert_own_geofence_events` was created `FOR ALL` with only a
  WITH CHECK expression and no USING expression. A policy with no USING clause
  places no row restriction on the commands that use USING, so this policy
  widened SELECT and DELETE on `field_geofence_events` to every authenticated
  user instead of only permitting inserts of the caller's own rows.

  1. Changes
     - Replace it with an INSERT-only policy carrying the same WITH CHECK.
     - Reads and updates of own rows continue to come from
       `employee_read_own_geofence_events`; admins keep `admin_all_geofence_events`.
*/

DROP POLICY IF EXISTS "employee_insert_own_geofence_events" ON public.field_geofence_events;

CREATE POLICY "employee_insert_own_geofence_events"
  ON public.field_geofence_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (SELECT employees.id FROM employees WHERE employees.user_id = auth.uid())
  );
