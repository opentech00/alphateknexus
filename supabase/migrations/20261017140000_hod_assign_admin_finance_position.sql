-- Head of Admin & Finance assigns an HR-onboarded employee to one finance position.
-- HR creates the account. This function never creates a login.

CREATE OR REPLACE FUNCTION public.is_admin_finance_hod()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.services s ON s.id = e.service_id
    WHERE e.user_id = auth.uid()
      AND e.org_role = 'division_head'
      AND e.status = 'active'
      AND s.slug = 'admin-finance'
  );
$$;

CREATE TABLE IF NOT EXISTS public.admin_finance_positions (
  key text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  role_name text NOT NULL,
  role_service_slug text,
  grant_admin boolean NOT NULL DEFAULT false,
  can_view_finance boolean NOT NULL,
  can_add_transactions boolean NOT NULL,
  can_approve_withdrawals boolean NOT NULL,
  can_delete_transactions boolean NOT NULL,
  can_manage_fx_rates boolean NOT NULL,
  can_manage_invoices boolean NOT NULL,
  page_keys text[] NOT NULL,
  summary text NOT NULL,
  display_order integer NOT NULL
);

INSERT INTO public.admin_finance_positions (
  key, name, role_name, role_service_slug, grant_admin,
  can_view_finance, can_add_transactions, can_approve_withdrawals,
  can_delete_transactions, can_manage_fx_rates, can_manage_invoices,
  page_keys, summary, display_order
) VALUES
  (
    'finance_manager', 'Finance Manager', 'Finance Manager', NULL, true,
    true, true, true, true, true, true,
    ARRAY['admin-finance','finance','wallet','receipts','finance-services','finance-cf','finance-smart-sort','finance-cleaning','finance-security','finance-procurement','analytics'],
    'Full finance desk: approvals, FX, deletes, and every service ledger.',
    1
  ),
  (
    'admin_manager', 'Admin Manager', 'Admin Manager', 'admin-finance', true,
    true, true, true, false, true, true,
    ARRAY['admin-finance','finance','wallet','receipts','finance-services','finance-cf','finance-smart-sort','finance-cleaning','finance-security','finance-procurement','analytics'],
    'Runs the department desk. Can approve and manage FX. Cannot delete transactions.',
    2
  ),
  (
    'finance_officer', 'Finance Officer', 'Finance Officer', 'admin-finance', false,
    true, true, false, false, false, true,
    ARRAY['admin-finance','finance','wallet','receipts','finance-services','finance-cf','finance-smart-sort','finance-cleaning','finance-security','finance-procurement'],
    'Day-to-day invoices, receipts, and ledgers. Submits work for approval.',
    3
  ),
  (
    'admin', 'Admin', 'Admin', 'admin-finance', false,
    true, true, false, false, false, true,
    ARRAY['admin-finance','finance','wallet','receipts','hr-documents'],
    'Department admin for records, receipts, and invoices. Cannot approve payouts.',
    4
  ),
  (
    'admin_assistant', 'Admin Assistant', 'Admin Assistant', 'admin-finance', false,
    true, true, false, false, false, false,
    ARRAY['admin-finance','receipts','hr-documents'],
    'Supports records and receipts. Cannot approve, change FX, or delete.',
    5
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  role_name = EXCLUDED.role_name,
  role_service_slug = EXCLUDED.role_service_slug,
  grant_admin = EXCLUDED.grant_admin,
  can_view_finance = EXCLUDED.can_view_finance,
  can_add_transactions = EXCLUDED.can_add_transactions,
  can_approve_withdrawals = EXCLUDED.can_approve_withdrawals,
  can_delete_transactions = EXCLUDED.can_delete_transactions,
  can_manage_fx_rates = EXCLUDED.can_manage_fx_rates,
  can_manage_invoices = EXCLUDED.can_manage_invoices,
  page_keys = EXCLUDED.page_keys,
  summary = EXCLUDED.summary,
  display_order = EXCLUDED.display_order;

ALTER TABLE public.admin_finance_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_admin_finance_positions" ON public.admin_finance_positions;
CREATE POLICY "read_admin_finance_positions" ON public.admin_finance_positions
  FOR SELECT TO authenticated
  USING (public.is_admin_finance_hod() OR public.is_admin());

-- Leadership is the Head of Department and Finance Manager.
-- Admin Manager and officers use their own finance flags.
CREATE OR REPLACE FUNCTION public.employee_is_admin_finance_ops(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    LEFT JOIN public.services s ON s.id = e.service_id
    LEFT JOIN public.hr_roles hr ON hr.id = e.role_id
    LEFT JOIN public.profiles p ON p.id = e.user_id
    LEFT JOIN public.hr_roles ar ON ar.id = p.admin_role_id
    WHERE e.id = p_employee_id
      AND e.status IS DISTINCT FROM 'inactive'
      AND (
        (e.org_role = 'division_head' AND s.slug = 'admin-finance')
        OR lower(COALESCE(hr.name, '')) LIKE '%finance manager%'
        OR lower(COALESCE(ar.name, '')) LIKE '%finance manager%'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_finance_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    LEFT JOIN public.hr_roles hr ON hr.id = e.role_id
    LEFT JOIN public.profiles p ON p.id = e.user_id
    LEFT JOIN public.hr_roles ar ON ar.id = p.admin_role_id
    WHERE e.user_id = auth.uid()
      AND e.status IS DISTINCT FROM 'inactive'
      AND (
        lower(COALESCE(hr.name, '')) LIKE '%finance manager%'
        OR lower(COALESCE(ar.name, '')) LIKE '%finance manager%'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.apply_hr_role_template(
  target_employee_id uuid,
  p_role_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees%ROWTYPE;
  v_role public.hr_roles%ROWTYPE;
  v_pos public.admin_finance_positions%ROWTYPE;
  v_role_id uuid;
  v_view boolean := false;
  v_add boolean := false;
  v_approve boolean := false;
  v_delete boolean := false;
  v_fx boolean := false;
  v_invoices boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND NOT public.is_division_head() THEN
    RAISE EXCEPTION 'Permission denied: only admins can apply role templates';
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = target_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  v_role_id := COALESCE(p_role_id, v_emp.role_id);
  IF v_emp.user_id IS NULL THEN
    RETURN;
  END IF;

  IF v_role_id IS NOT NULL THEN
    SELECT * INTO v_role FROM public.hr_roles WHERE id = v_role_id;
  END IF;

  IF v_role.id IS NOT NULL THEN
    SELECT * INTO v_pos
    FROM public.admin_finance_positions pos
    WHERE lower(pos.role_name) = lower(v_role.name)
      AND (
        (pos.role_service_slug IS NULL AND v_role.service_id IS NULL)
        OR EXISTS (
          SELECT 1 FROM public.services s
          WHERE s.id = v_role.service_id AND s.slug = pos.role_service_slug
        )
      )
    LIMIT 1;

    IF FOUND THEN
      v_view := v_pos.can_view_finance;
      v_add := v_pos.can_add_transactions;
      v_approve := v_pos.can_approve_withdrawals;
      v_delete := v_pos.can_delete_transactions;
      v_fx := v_pos.can_manage_fx_rates;
      v_invoices := v_pos.can_manage_invoices;
    ELSIF v_role.name = 'Admin Assistant' THEN
      v_view := true;
      v_add := true;
    ELSIF v_role.name IN ('Finance Officer', 'Admin') THEN
      v_view := true;
      v_add := true;
      v_invoices := true;
    ELSIF v_role.name = 'Admin Manager' THEN
      v_view := true;
      v_add := true;
      v_invoices := true;
      v_approve := true;
      v_fx := true;
    ELSIF v_role.name = 'Finance Manager' OR lower(v_role.name) LIKE '%finance manager%' THEN
      v_view := true;
      v_add := true;
      v_invoices := true;
      v_approve := true;
      v_fx := true;
      v_delete := true;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.services s ON s.id = e.service_id
    WHERE e.id = target_employee_id
      AND e.org_role = 'division_head'
      AND s.slug = 'admin-finance'
  ) THEN
    v_view := true;
    v_add := true;
    v_invoices := true;
    v_approve := true;
    v_fx := true;
    v_delete := true;
  END IF;

  INSERT INTO public.finance_permissions (
    user_id, can_view_finance, can_add_transactions, can_approve_withdrawals,
    can_delete_transactions, can_manage_fx_rates, can_manage_invoices
  ) VALUES (
    v_emp.user_id, v_view, v_add, v_approve, v_delete, v_fx, v_invoices
  )
  ON CONFLICT (user_id) DO UPDATE SET
    can_view_finance = EXCLUDED.can_view_finance,
    can_add_transactions = EXCLUDED.can_add_transactions,
    can_approve_withdrawals = EXCLUDED.can_approve_withdrawals,
    can_delete_transactions = EXCLUDED.can_delete_transactions,
    can_manage_fx_rates = EXCLUDED.can_manage_fx_rates,
    can_manage_invoices = EXCLUDED.can_manage_invoices,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finance_role_id(p_pos public.admin_finance_positions)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id
  FROM public.hr_roles r
  LEFT JOIN public.services s ON s.id = r.service_id
  WHERE lower(r.name) = lower(p_pos.role_name)
    AND r.is_active IS DISTINCT FROM false
    AND (
      (p_pos.role_service_slug IS NULL AND r.service_id IS NULL)
      OR s.slug = p_pos.role_service_slug
    )
  ORDER BY r.display_order
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hod_admin_finance_staff_board()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_id uuid;
BEGIN
  IF NOT public.is_admin_finance_hod() THEN
    RAISE EXCEPTION 'Only the Head of Admin & Finance can view this staff board';
  END IF;

  SELECT id INTO v_service_id FROM public.services WHERE slug = 'admin-finance';

  RETURN jsonb_build_object(
    'positions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', pos.key,
        'name', pos.name,
        'summary', pos.summary,
        'grant_admin', pos.grant_admin
      ) ORDER BY pos.display_order)
      FROM public.admin_finance_positions pos
    ), '[]'::jsonb),
    'ready', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'full_name', e.full_name,
        'email', e.email,
        'employee_number', e.employee_number,
        'role_name', hr.name
      ) ORDER BY e.full_name)
      FROM public.employees e
      LEFT JOIN public.services s ON s.id = e.service_id
      LEFT JOIN public.hr_roles hr ON hr.id = e.role_id
      LEFT JOIN public.profiles p ON p.id = e.user_id
      WHERE e.user_id IS NOT NULL
        AND e.status = 'active'
        AND e.org_role NOT IN ('division_head', 'super_admin')
        AND (e.service_id IS NULL OR s.slug = 'admin-finance')
        AND COALESCE(p.role, 'user') IS DISTINCT FROM 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM public.admin_finance_positions pos
          WHERE public.admin_finance_role_id(pos) = e.role_id
        )
    ), '[]'::jsonb),
    'roster', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'full_name', e.full_name,
        'email', e.email,
        'employee_number', e.employee_number,
        'role_name', COALESCE(hr.name, 'Head of Department'),
        'is_hod', e.org_role = 'division_head'
      ) ORDER BY (e.org_role = 'division_head') DESC, e.full_name)
      FROM public.employees e
      LEFT JOIN public.hr_roles hr ON hr.id = e.role_id
      WHERE e.service_id = v_service_id
        AND e.status = 'active'
        AND (
          e.org_role = 'division_head'
          OR EXISTS (
            SELECT 1 FROM public.admin_finance_positions pos
            WHERE public.admin_finance_role_id(pos) = e.role_id
          )
        )
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hod_assign_admin_finance_position(
  p_employee_id uuid,
  p_position_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_emp public.employees%ROWTYPE;
  v_pos public.admin_finance_positions%ROWTYPE;
  v_service_id uuid;
  v_role_id uuid;
  v_slug text;
  v_profile_role text;
  v_page text;
BEGIN
  v_actor := public.current_employee_id();
  IF NOT public.is_admin_finance_hod() THEN
    RAISE EXCEPTION 'Only the Head of Admin & Finance can assign a finance position';
  END IF;

  SELECT * INTO v_pos FROM public.admin_finance_positions WHERE key = p_position_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose a finance position';
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND OR v_emp.user_id IS NULL THEN
    RAISE EXCEPTION 'HR has not onboarded this employee yet';
  END IF;
  IF v_emp.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Only an active employee can take a finance position';
  END IF;
  IF v_emp.org_role IN ('division_head', 'super_admin') THEN
    RAISE EXCEPTION 'That person cannot be assigned a staff finance position';
  END IF;

  SELECT s.slug INTO v_slug FROM public.services s WHERE s.id = v_emp.service_id;
  IF v_emp.service_id IS NOT NULL AND v_slug IS DISTINCT FROM 'admin-finance' THEN
    RAISE EXCEPTION 'This employee belongs to another department. Ask HR before moving them.';
  END IF;

  SELECT p.role INTO v_profile_role FROM public.profiles p WHERE p.id = v_emp.user_id;
  IF v_profile_role = 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.admin_finance_positions pos
    WHERE public.admin_finance_role_id(pos) = (
      SELECT admin_role_id FROM public.profiles WHERE id = v_emp.user_id
    )
  ) THEN
    RAISE EXCEPTION 'This account already has admin access outside Admin & Finance';
  END IF;

  SELECT id INTO v_service_id FROM public.services WHERE slug = 'admin-finance';
  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Admin & Finance is not set up yet';
  END IF;

  v_role_id := public.admin_finance_role_id(v_pos);
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'The % role is missing. Ask HR to confirm department roles.', v_pos.name;
  END IF;

  UPDATE public.employees
  SET service_id = v_service_id,
      role_id = v_role_id,
      position = v_pos.name,
      org_role = 'staff',
      updated_at = now()
  WHERE id = v_emp.id;

  PERFORM public.apply_hr_role_template(v_emp.id, v_role_id);

  FOREACH v_page IN ARRAY v_pos.page_keys LOOP
    INSERT INTO public.hr_role_permissions (role_id, page_key, can_access)
    VALUES (v_role_id, v_page, true)
    ON CONFLICT (role_id, page_key) DO UPDATE SET can_access = true;
  END LOOP;

  IF v_pos.grant_admin THEN
    UPDATE public.profiles
    SET role = 'admin', admin_role_id = v_role_id
    WHERE id = v_emp.user_id;
  ELSE
    UPDATE public.profiles
    SET role = 'user', admin_role_id = NULL
    WHERE id = v_emp.user_id
      AND admin_role_id IN (
        SELECT public.admin_finance_role_id(pos) FROM public.admin_finance_positions pos
      );
  END IF;

  INSERT INTO public.permission_audit (
    actor_employee_id, target_employee_id, action, capability_keys, metadata
  ) VALUES (
    v_actor, v_emp.id, 'finance_position_assigned', v_pos.page_keys,
    jsonb_build_object('position_key', v_pos.key, 'position_name', v_pos.name)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'full_name', v_emp.full_name,
    'position_name', v_pos.name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hod_clear_admin_finance_position(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_emp public.employees%ROWTYPE;
  v_slug text;
BEGIN
  v_actor := public.current_employee_id();
  IF NOT public.is_admin_finance_hod() THEN
    RAISE EXCEPTION 'Only the Head of Admin & Finance can remove a finance position';
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_emp.org_role = 'division_head' THEN
    RAISE EXCEPTION 'The Head of Department stays in place';
  END IF;

  SELECT s.slug INTO v_slug FROM public.services s WHERE s.id = v_emp.service_id;
  IF v_slug IS DISTINCT FROM 'admin-finance' THEN
    RAISE EXCEPTION 'This employee is not in Admin & Finance';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_finance_positions pos
    WHERE public.admin_finance_role_id(pos) = v_emp.role_id
  ) THEN
    RAISE EXCEPTION 'This employee does not hold a finance position';
  END IF;

  UPDATE public.employees
  SET role_id = NULL,
      position = NULL,
      updated_at = now()
  WHERE id = v_emp.id;

  IF v_emp.user_id IS NOT NULL THEN
    UPDATE public.finance_permissions
    SET can_view_finance = false,
        can_add_transactions = false,
        can_approve_withdrawals = false,
        can_delete_transactions = false,
        can_manage_fx_rates = false,
        can_manage_invoices = false,
        updated_at = now()
    WHERE user_id = v_emp.user_id;

    UPDATE public.profiles
    SET role = 'user', admin_role_id = NULL
    WHERE id = v_emp.user_id
      AND admin_role_id IN (
        SELECT public.admin_finance_role_id(pos) FROM public.admin_finance_positions pos
      );
  END IF;

  INSERT INTO public.permission_audit (
    actor_employee_id, target_employee_id, action, metadata
  ) VALUES (
    v_actor, v_emp.id, 'finance_position_cleared',
    jsonb_build_object('previous_role_id', v_emp.role_id)
  );

  RETURN jsonb_build_object('ok', true, 'full_name', v_emp.full_name);
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin_finance_hod() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_finance_role_id(public.admin_finance_positions) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hod_admin_finance_staff_board() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hod_assign_admin_finance_position(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hod_clear_admin_finance_position(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin_finance_hod() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hod_admin_finance_staff_board() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hod_assign_admin_finance_position(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hod_clear_admin_finance_position(uuid) TO authenticated;
