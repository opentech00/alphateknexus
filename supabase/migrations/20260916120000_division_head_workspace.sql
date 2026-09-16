-- Division head workspace: attach existing HR staff, unassign, and dispatch field jobs
-- within the caller's assigned service_id only.

-- ── Privileged-column guard: allow SECURITY DEFINER RPCs via session GUC ──
CREATE OR REPLACE FUNCTION public.guard_employee_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('alphatek.skip_employee_guard', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.employee_number IS DISTINCT FROM OLD.employee_number
     OR NEW.performance_score IS DISTINCT FROM OLD.performance_score
     OR NEW.jobs_completed IS DISTINCT FROM OLD.jobs_completed
     OR NEW.reports_to IS DISTINCT FROM OLD.reports_to
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.org_role IS DISTINCT FROM OLD.org_role
     OR (NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
         AND NEW.must_change_password = true)
  THEN
    RAISE EXCEPTION 'insufficient_privilege: this field can only be changed by an administrator';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Actor must be a head or hold manage-staff-access in their division ──
CREATE OR REPLACE FUNCTION public._require_division_staff_manager()
RETURNS employees
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor employees%ROWTYPE;
BEGIN
  IF public.is_admin() THEN
    SELECT * INTO actor FROM employees WHERE user_id = auth.uid() LIMIT 1;
    IF actor.service_id IS NULL THEN
      RAISE EXCEPTION 'Permission denied: assign a division before managing staff here';
    END IF;
    RETURN actor;
  END IF;

  SELECT * INTO actor FROM employees
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF actor.service_id IS NULL THEN
    RAISE EXCEPTION 'Permission denied: no division assigned';
  END IF;

  IF actor.org_role = 'division_head'
     OR public.has_capability('div.manage_staff_access', actor.service_id) THEN
    RETURN actor;
  END IF;

  RAISE EXCEPTION 'Permission denied: only a division head can manage this team';
END;
$$;

CREATE OR REPLACE FUNCTION public._require_division_job_dispatcher()
RETURNS employees
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor employees%ROWTYPE;
BEGIN
  IF public.is_admin() THEN
    SELECT * INTO actor FROM employees WHERE user_id = auth.uid() LIMIT 1;
    IF actor.service_id IS NULL THEN
      RAISE EXCEPTION 'Permission denied: assign a division before dispatching jobs';
    END IF;
    RETURN actor;
  END IF;

  SELECT * INTO actor FROM employees
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;

  IF NOT FOUND OR actor.service_id IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF actor.org_role = 'division_head'
     OR public.has_capability('div.manage_bookings', actor.service_id)
     OR public.has_capability('div.manage_staff_access', actor.service_id) THEN
    RETURN actor;
  END IF;

  RAISE EXCEPTION 'Permission denied: cannot dispatch jobs in this division';
END;
$$;

-- Heads / manage-staff-access can list their roster (not only org_role = division_head)
CREATE OR REPLACE FUNCTION public.list_division_staff()
RETURNS TABLE (
  id uuid,
  full_name text,
  employee_number text,
  email text,
  phone text,
  role_id uuid,
  org_role text,
  status text,
  user_id uuid,
  photo_url text,
  hr_role_name text,
  app_type text,
  app_active boolean,
  capability_keys text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  svc uuid;
BEGIN
  IF public.is_admin() THEN
    SELECT e.service_id INTO svc FROM employees e WHERE e.user_id = auth.uid() LIMIT 1;
  ELSE
    SELECT e.service_id INTO svc FROM employees e
    WHERE e.user_id = auth.uid() AND e.status = 'active'
      AND (
        e.org_role = 'division_head'
        OR public.has_capability('div.manage_staff_access', e.service_id)
      );
    IF svc IS NULL THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.full_name, e.employee_number, e.email, e.phone, e.role_id, e.org_role, e.status,
    e.user_id, e.photo_url, r.name,
    COALESCE(a.app_type, 'employee'), COALESCE(a.is_active, true),
    public.employee_capability_keys(e.id)
  FROM employees e
  LEFT JOIN hr_roles r ON r.id = e.role_id
  LEFT JOIN app_access a ON a.employee_id = e.id
  WHERE (svc IS NULL OR e.service_id = svc)
  ORDER BY e.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public._assert_can_grant_to(target employees, actor employees, keys text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  IF target.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Cannot change access for inactive staff';
  END IF;

  IF 'div.manage_staff_access' = ANY (keys) THEN
    RAISE EXCEPTION 'Cannot grant manage-staff-access to staff';
  END IF;

  IF public.is_admin() THEN
    RETURN;
  END IF;

  IF actor.id IS NULL OR actor.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Permission denied: only a division head or super admin can grant access';
  END IF;

  IF actor.org_role IS DISTINCT FROM 'division_head'
     AND NOT public.has_capability('div.manage_staff_access', actor.service_id) THEN
    RAISE EXCEPTION 'Permission denied: only a division head or super admin can grant access';
  END IF;

  IF target.service_id IS DISTINCT FROM actor.service_id THEN
    RAISE EXCEPTION 'Permission denied: staff must belong to your division';
  END IF;

  IF target.org_role IN ('division_head', 'super_admin') THEN
    RAISE EXCEPTION 'Permission denied: cannot change access for another head or super admin';
  END IF;

  FOREACH k IN ARRAY keys LOOP
    IF NOT EXISTS (
      SELECT 1 FROM division_grant_ceilings c
      WHERE c.service_id = actor.service_id AND c.capability_key = k
    ) THEN
      RAISE EXCEPTION 'Capability % is not in the grant ceiling for this division', k;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM capability_catalog cat WHERE cat.key = k AND cat.grantable = true
    ) THEN
      RAISE EXCEPTION 'Capability % cannot be granted', k;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_staff_app_access(target_employee_id uuid, p_app_type text, p_is_active boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target employees%ROWTYPE;
  actor employees%ROWTYPE;
BEGIN
  IF p_app_type NOT IN ('employee', 'field') THEN
    RAISE EXCEPTION 'Invalid app type';
  END IF;

  PERFORM set_config('alphatek.skip_employee_guard', 'true', true);

  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT * INTO actor FROM employees WHERE user_id = auth.uid();

  IF NOT public.is_admin() THEN
    IF actor.status IS DISTINCT FROM 'active'
       OR actor.service_id IS DISTINCT FROM target.service_id
       OR (
         actor.org_role IS DISTINCT FROM 'division_head'
         AND NOT public.has_capability('div.manage_staff_access', actor.service_id)
       )
    THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
    IF target.org_role IN ('division_head', 'super_admin') THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  INSERT INTO app_access (employee_id, app_type, is_active, granted_by)
  VALUES (target.id, p_app_type, p_is_active, auth.uid())
  ON CONFLICT (employee_id) DO UPDATE SET
    app_type = EXCLUDED.app_type,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  IF p_app_type = 'field' AND p_is_active THEN
    UPDATE employees SET org_role = 'field_staff' WHERE id = target.id AND org_role = 'staff';
    INSERT INTO employee_capabilities (employee_id, capability_key, granted_by)
    VALUES (target.id, 'field.jobs', actor.id)
    ON CONFLICT (employee_id, capability_key) DO NOTHING;
  ELSIF p_app_type = 'employee' AND target.org_role = 'field_staff' THEN
    UPDATE employees SET org_role = 'staff' WHERE id = target.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_division_capabilities(target_employee_id uuid, p_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target employees%ROWTYPE;
  actor employees%ROWTYPE;
  before_keys text[];
  k text;
BEGIN
  PERFORM set_config('alphatek.skip_employee_guard', 'true', true);

  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT * INTO actor FROM employees WHERE user_id = auth.uid();

  PERFORM public._assert_can_grant_to(target, actor, p_keys);

  before_keys := public.employee_capability_keys(target.id);

  FOREACH k IN ARRAY p_keys LOOP
    INSERT INTO employee_capabilities (employee_id, capability_key, granted_by)
    VALUES (target.id, k, actor.id)
    ON CONFLICT (employee_id, capability_key) DO NOTHING;
  END LOOP;

  IF 'field.jobs' = ANY (p_keys) OR 'field.attendance' = ANY (p_keys) THEN
    UPDATE employees SET org_role = CASE
      WHEN org_role = 'division_head' THEN org_role
      ELSE 'field_staff'
    END WHERE id = target.id AND org_role NOT IN ('division_head', 'super_admin');
    INSERT INTO app_access (employee_id, app_type, is_active, granted_by)
    VALUES (target.id, 'field', true, auth.uid())
    ON CONFLICT (employee_id) DO UPDATE SET app_type = 'field', is_active = true, updated_at = now();
  END IF;

  INSERT INTO permission_audit (actor_employee_id, target_employee_id, action, capability_keys, before_keys, after_keys)
  VALUES (actor.id, target.id, 'grant', p_keys, before_keys, public.employee_capability_keys(target.id));

  INSERT INTO employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (target.id, auth.uid(), 'profile_updated', 'Division capabilities granted', jsonb_build_object('keys', p_keys));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_division_capabilities(target_employee_id uuid, p_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target employees%ROWTYPE;
  actor employees%ROWTYPE;
  before_keys text[];
  remaining text[];
BEGIN
  PERFORM set_config('alphatek.skip_employee_guard', 'true', true);

  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT * INTO actor FROM employees WHERE user_id = auth.uid();

  PERFORM public._assert_can_grant_to(target, actor, p_keys);

  before_keys := public.employee_capability_keys(target.id);

  DELETE FROM employee_capabilities
  WHERE employee_id = target.id AND capability_key = ANY (p_keys);

  remaining := public.employee_capability_keys(target.id);

  IF NOT ('field.jobs' = ANY (remaining) OR 'field.attendance' = ANY (remaining) OR 'field.incidents' = ANY (remaining)) THEN
    IF target.org_role = 'field_staff' THEN
      UPDATE employees SET org_role = 'staff' WHERE id = target.id;
    END IF;
    UPDATE app_access SET app_type = 'employee', updated_at = now() WHERE employee_id = target.id AND app_type = 'field';
  END IF;

  INSERT INTO permission_audit (actor_employee_id, target_employee_id, action, capability_keys, before_keys, after_keys)
  VALUES (actor.id, target.id, 'revoke', p_keys, before_keys, remaining);

  INSERT INTO employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (target.id, auth.uid(), 'profile_updated', 'Division capabilities revoked', jsonb_build_object('keys', p_keys));
END;
$$;

-- ── Search HR employees not already in this division ─────────────────────
CREATE OR REPLACE FUNCTION public.search_unassigned_employees(p_query text)
RETURNS TABLE (
  id uuid,
  full_name text,
  employee_number text,
  email text,
  photo_url text,
  current_division text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor employees%ROWTYPE;
  q text;
BEGIN
  actor := public._require_division_staff_manager();
  q := '%' || coalesce(nullif(trim(p_query), ''), '') || '%';

  RETURN QUERY
  SELECT
    e.id,
    e.full_name,
    e.employee_number,
    e.email,
    e.photo_url,
    s.name
  FROM employees e
  LEFT JOIN services s ON s.id = e.service_id
  WHERE e.status = 'active'
    AND e.user_id IS NOT NULL
    AND e.service_id IS DISTINCT FROM actor.service_id
    AND (
      public.is_admin()
      OR e.org_role NOT IN ('division_head', 'super_admin')
    )
    AND (
      trim(coalesce(p_query, '')) = ''
      OR e.full_name ILIKE q
      OR e.email ILIKE q
      OR e.employee_number ILIKE q
    )
  ORDER BY e.full_name
  LIMIT 25;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_employee_to_division(target_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor employees%ROWTYPE;
  target employees%ROWTYPE;
BEGIN
  actor := public._require_division_staff_manager();

  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  IF target.user_id IS NULL THEN
    RAISE EXCEPTION 'This person has no login yet. Ask HR to create their account first';
  END IF;
  IF target.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Cannot attach inactive staff';
  END IF;
  IF target.org_role IN ('division_head', 'super_admin') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: cannot move another head or super admin';
  END IF;
  IF target.service_id = actor.service_id THEN
    RETURN;
  END IF;

  PERFORM set_config('alphatek.skip_employee_guard', 'true', true);

  UPDATE employees
  SET service_id = actor.service_id, updated_at = now()
  WHERE id = target.id;

  INSERT INTO employee_capabilities (employee_id, capability_key, granted_by)
  VALUES (target.id, 'div.view', actor.id)
  ON CONFLICT (employee_id, capability_key) DO NOTHING;

  INSERT INTO app_access (employee_id, app_type, is_active, granted_by, notes)
  VALUES (target.id, 'employee', true, auth.uid(), 'Attached to division by head')
  ON CONFLICT (employee_id) DO UPDATE SET
    is_active = true,
    updated_at = now();

  INSERT INTO permission_audit (actor_employee_id, target_employee_id, action, capability_keys, after_keys, metadata)
  VALUES (
    actor.id,
    target.id,
    'assign_division',
    ARRAY['div.view'],
    public.employee_capability_keys(target.id),
    jsonb_build_object('service_id', actor.service_id)
  );

  INSERT INTO employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (
    target.id,
    auth.uid(),
    'profile_updated',
    'Attached to division',
    jsonb_build_object('service_id', actor.service_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unassign_employee_from_division(target_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor employees%ROWTYPE;
  target employees%ROWTYPE;
BEGIN
  actor := public._require_division_staff_manager();

  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  IF target.service_id IS DISTINCT FROM actor.service_id THEN
    RAISE EXCEPTION 'Permission denied: staff must belong to your division';
  END IF;
  IF target.id = actor.id THEN
    RAISE EXCEPTION 'You cannot remove yourself from the division';
  END IF;
  IF target.org_role IN ('division_head', 'super_admin') THEN
    RAISE EXCEPTION 'Permission denied: cannot remove another head';
  END IF;

  PERFORM set_config('alphatek.skip_employee_guard', 'true', true);

  UPDATE employees
  SET service_id = NULL, updated_at = now()
  WHERE id = target.id;

  DELETE FROM employee_capabilities
  WHERE employee_id = target.id AND capability_key LIKE 'div.%';

  INSERT INTO permission_audit (actor_employee_id, target_employee_id, action, capability_keys, metadata)
  VALUES (
    actor.id,
    target.id,
    'unassign_division',
    ARRAY[]::text[],
    jsonb_build_object('from_service_id', actor.service_id)
  );

  INSERT INTO employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (
    target.id,
    auth.uid(),
    'profile_updated',
    'Removed from division',
    jsonb_build_object('from_service_id', actor.service_id)
  );
END;
$$;

-- ── Field dispatch for the head's division ───────────────────────────────
CREATE OR REPLACE FUNCTION public.create_division_field_assignment(
  p_booking_id uuid,
  p_employee_id uuid,
  p_scheduled_date date DEFAULT NULL,
  p_scheduled_time text DEFAULT NULL,
  p_instructions text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_geofence_radius integer DEFAULT 100
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor employees%ROWTYPE;
  assignee employees%ROWTYPE;
  booking RECORD;
  new_id uuid;
  lat double precision;
  lng double precision;
  radius integer;
BEGIN
  actor := public._require_division_job_dispatcher();

  SELECT b.*, s.name AS service_name
  INTO booking
  FROM bookings b
  LEFT JOIN services s ON s.id = b.service_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF booking.service_id IS DISTINCT FROM actor.service_id THEN
    RAISE EXCEPTION 'Permission denied: booking is not in your division';
  END IF;

  SELECT * INTO assignee FROM employees WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Teammate not found'; END IF;
  IF assignee.service_id IS DISTINCT FROM actor.service_id OR assignee.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Assignee must be active staff in your division';
  END IF;
  IF assignee.org_role IN ('super_admin') THEN
    RAISE EXCEPTION 'Cannot dispatch to this person';
  END IF;
  IF NOT (
    assignee.org_role IN ('field_staff', 'division_head')
    OR EXISTS (
      SELECT 1 FROM employee_capabilities c
      WHERE c.employee_id = assignee.id AND c.capability_key = 'field.jobs'
    )
    OR EXISTS (
      SELECT 1 FROM app_access a
      WHERE a.employee_id = assignee.id AND a.app_type = 'field' AND a.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Assignee must have field job access';
  END IF;

  lat := COALESCE(p_latitude, booking.latitude);
  lng := COALESCE(p_longitude, booking.longitude);
  radius := CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN COALESCE(p_geofence_radius, 100) ELSE NULL END;

  INSERT INTO field_assignments (
    employee_id, service_id, service_name, customer_name, address,
    scheduled_date, scheduled_time, instructions, amount, status,
    booking_id, latitude, longitude, geofence_radius
  ) VALUES (
    assignee.id,
    actor.service_id,
    COALESCE(booking.service_name, 'Division job'),
    COALESCE(booking.contact_name, 'Customer'),
    COALESCE(booking.location, ''),
    COALESCE(p_scheduled_date, booking.scheduled_date, CURRENT_DATE),
    COALESCE(p_scheduled_time, booking.scheduled_time, '09:00'),
    p_instructions,
    NULL,
    'assigned',
    booking.id,
    lat,
    lng,
    radius
  )
  RETURNING id INTO new_id;

  INSERT INTO field_job_events (assignment_id, employee_id, event_type, note)
  VALUES (new_id, assignee.id, 'assigned', 'Dispatched from division workspace');

  IF assignee.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, booking_id)
    VALUES (
      assignee.user_id,
      'Field job assigned',
      'A field job in your division was assigned to you.',
      'booking_update',
      booking.id
    );
  END IF;

  INSERT INTO permission_audit (actor_employee_id, target_employee_id, action, metadata)
  VALUES (
    actor.id,
    assignee.id,
    'dispatch_field_job',
    jsonb_build_object('booking_id', booking.id, 'assignment_id', new_id)
  );

  RETURN new_id;
END;
$$;

-- ── RLS: heads can see (and insert) assignments in their division ────────
DROP POLICY IF EXISTS "employees_select_own_assignments" ON field_assignments;
CREATE POLICY "employees_select_own_assignments" ON field_assignments FOR SELECT
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    OR is_admin()
    OR (
      service_id IS NOT NULL
      AND (
        is_division_head(service_id)
        OR has_capability('div.manage_bookings', service_id)
        OR has_capability('div.manage_staff_access', service_id)
      )
    )
  );

DROP POLICY IF EXISTS "division_head_insert_assignments" ON field_assignments;
CREATE POLICY "division_head_insert_assignments" ON field_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin()
    OR (
      service_id IS NOT NULL
      AND (
        is_division_head(service_id)
        OR has_capability('div.manage_bookings', service_id)
        OR has_capability('div.manage_staff_access', service_id)
      )
      AND employee_id IN (
        SELECT e.id FROM employees e
        WHERE e.service_id = field_assignments.service_id AND e.status = 'active'
      )
    )
  );

REVOKE ALL ON FUNCTION public._require_division_staff_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._require_division_job_dispatcher() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_unassigned_employees(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_employee_to_division(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unassign_employee_from_division(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_division_field_assignment(uuid, uuid, date, text, text, double precision, double precision, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public._require_division_staff_manager() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._require_division_job_dispatcher() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.search_unassigned_employees(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_employee_to_division(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_employee_from_division(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_division_field_assignment(uuid, uuid, date, text, text, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_division_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_app_access(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_division_capabilities(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_division_capabilities(uuid, text[]) TO authenticated;
