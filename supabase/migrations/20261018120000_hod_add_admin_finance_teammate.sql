-- Admin & Finance head can attach an existing HR employee to this department only.
-- Does not create logins, and does not pull staff out of another division.

CREATE OR REPLACE FUNCTION public._require_admin_finance_hod()
RETURNS public.employees
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor public.employees%ROWTYPE;
BEGIN
  SELECT e.* INTO actor
  FROM public.employees e
  JOIN public.services s ON s.id = e.service_id
  WHERE e.user_id = auth.uid()
    AND e.org_role = 'division_head'
    AND e.status = 'active'
    AND s.slug = 'admin-finance'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the Admin & Finance Head of Department can manage this team';
  END IF;

  RETURN actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.hod_search_admin_finance_teammates(p_query text)
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
  actor public.employees%ROWTYPE;
  q text;
BEGIN
  actor := public._require_admin_finance_hod();
  q := '%' || coalesce(nullif(trim(p_query), ''), '') || '%';

  RETURN QUERY
  SELECT
    e.id,
    e.full_name,
    e.employee_number,
    e.email,
    e.photo_url,
    NULL::text
  FROM public.employees e
  WHERE e.status = 'active'
    AND e.user_id IS NOT NULL
    AND e.service_id IS NULL
    AND e.org_role NOT IN ('division_head', 'super_admin')
    AND e.id <> actor.id
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

CREATE OR REPLACE FUNCTION public.hod_add_admin_finance_teammate(target_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  target public.employees%ROWTYPE;
BEGIN
  actor := public._require_admin_finance_hod();

  SELECT * INTO target FROM public.employees WHERE id = target_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF target.user_id IS NULL THEN
    RAISE EXCEPTION 'This person has no login yet. Ask HR to create their account first';
  END IF;
  IF target.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Cannot attach inactive staff';
  END IF;
  IF target.org_role IN ('division_head', 'super_admin') THEN
    RAISE EXCEPTION 'Permission denied: cannot move another head';
  END IF;
  IF target.service_id IS NOT NULL AND target.service_id IS DISTINCT FROM actor.service_id THEN
    RAISE EXCEPTION 'This employee belongs to another division. Ask HR to release them first';
  END IF;
  IF target.service_id = actor.service_id THEN
    RETURN;
  END IF;

  PERFORM set_config('alphatek.skip_employee_guard', 'true', true);

  UPDATE public.employees
  SET service_id = actor.service_id, updated_at = now()
  WHERE id = target.id;

  INSERT INTO public.employee_capabilities (employee_id, capability_key, granted_by)
  VALUES (target.id, 'div.view', actor.id)
  ON CONFLICT (employee_id, capability_key) DO NOTHING;

  INSERT INTO public.app_access (employee_id, app_type, is_active, granted_by, notes)
  VALUES (target.id, 'employee', true, auth.uid(), 'Attached to Admin & Finance by head')
  ON CONFLICT (employee_id) DO UPDATE SET
    is_active = true,
    updated_at = now();

  INSERT INTO public.permission_audit (actor_employee_id, target_employee_id, action, capability_keys, after_keys, metadata)
  VALUES (
    actor.id,
    target.id,
    'assign_division',
    ARRAY['div.view'],
    public.employee_capability_keys(target.id),
    jsonb_build_object('service_id', actor.service_id, 'department', 'admin-finance')
  );

  INSERT INTO public.employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (
    target.id,
    auth.uid(),
    'profile_updated',
    'Attached to Admin & Finance',
    jsonb_build_object('service_id', actor.service_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hod_remove_admin_finance_teammate(target_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  target public.employees%ROWTYPE;
BEGIN
  actor := public._require_admin_finance_hod();

  SELECT * INTO target FROM public.employees WHERE id = target_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF target.service_id IS DISTINCT FROM actor.service_id THEN
    RAISE EXCEPTION 'This person is not in Admin & Finance';
  END IF;
  IF target.id = actor.id THEN
    RAISE EXCEPTION 'You cannot remove yourself from the department';
  END IF;
  IF target.org_role IN ('division_head', 'super_admin') THEN
    RAISE EXCEPTION 'Permission denied: cannot remove another head';
  END IF;

  PERFORM set_config('alphatek.skip_employee_guard', 'true', true);

  UPDATE public.employees
  SET service_id = NULL, updated_at = now()
  WHERE id = target.id;

  DELETE FROM public.employee_capabilities
  WHERE employee_id = target.id AND capability_key LIKE 'div.%';

  INSERT INTO public.permission_audit (actor_employee_id, target_employee_id, action, capability_keys, metadata)
  VALUES (
    actor.id,
    target.id,
    'unassign_division',
    ARRAY[]::text[],
    jsonb_build_object('from_service_id', actor.service_id, 'department', 'admin-finance')
  );

  INSERT INTO public.employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (
    target.id,
    auth.uid(),
    'profile_updated',
    'Removed from Admin & Finance',
    jsonb_build_object('from_service_id', actor.service_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._require_admin_finance_hod() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hod_search_admin_finance_teammates(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hod_add_admin_finance_teammate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hod_remove_admin_finance_teammate(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hod_search_admin_finance_teammates(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hod_add_admin_finance_teammate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hod_remove_admin_finance_teammate(uuid) TO authenticated;
