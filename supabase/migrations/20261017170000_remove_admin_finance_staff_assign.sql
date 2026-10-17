-- Remove the Admin & Finance head-of-department "assign employee" board.
-- HR assigns Admin & Finance staff. Other divisions keep their own position board.

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
        OR lower(COALESCE(e.position, '')) LIKE '%finance manager%'
        OR (
          s.slug = 'admin-finance'
          AND lower(COALESCE(hr.name, '')) LIKE '%admin manager%'
        )
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
        OR lower(COALESCE(e.position, '')) LIKE '%finance manager%'
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
    IF v_role.name = 'Admin Assistant' THEN
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

  IF public.employee_is_admin_finance_ops(target_employee_id) THEN
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

DROP FUNCTION IF EXISTS public.hod_clear_admin_finance_position(uuid);
DROP FUNCTION IF EXISTS public.hod_assign_admin_finance_position(uuid, text);
DROP FUNCTION IF EXISTS public.hod_admin_finance_staff_board();

-- The read policy calls is_admin_finance_hod(), so it must go before the function.
DO $$
BEGIN
  IF to_regclass('public.admin_finance_positions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "read_admin_finance_positions" ON public.admin_finance_positions';
  END IF;
  IF to_regprocedure('public.admin_finance_role_id(public.admin_finance_positions)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.admin_finance_role_id(public.admin_finance_positions)';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.is_admin_finance_hod();
DROP TABLE IF EXISTS public.admin_finance_positions;

CREATE OR REPLACE FUNCTION public._require_division_hod()
RETURNS public.employees
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  v_slug text;
BEGIN
  SELECT * INTO actor
  FROM public.employees
  WHERE user_id = auth.uid()
    AND org_role = 'division_head'
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND OR actor.service_id IS NULL THEN
    RAISE EXCEPTION 'Only a Head of Department can assign division positions';
  END IF;

  SELECT slug INTO v_slug FROM public.services WHERE id = actor.service_id;
  IF v_slug = 'admin-finance' THEN
    RAISE EXCEPTION 'Admin & Finance staff are assigned by HR';
  END IF;

  RETURN actor;
END;
$$;
