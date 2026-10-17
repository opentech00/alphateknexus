-- HOD, Finance Manager, and Admin Manager of Admin & Finance
-- get the department workspace and full finance activity access.

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
        (
          e.org_role = 'division_head'
          AND s.slug = 'admin-finance'
        )
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

CREATE OR REPLACE FUNCTION public.is_admin_finance_ops()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND public.employee_is_admin_finance_ops(e.id)
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

CREATE OR REPLACE FUNCTION public.is_admin_finance_staff()
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
      AND s.slug = 'admin-finance'
  )
  OR public.is_finance_manager()
  OR public.is_admin_finance_ops();
$$;

CREATE OR REPLACE FUNCTION public.has_finance_permission(perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin_finance_ops()
    OR EXISTS (
      SELECT 1 FROM public.finance_permissions fp
      WHERE fp.user_id = auth.uid()
        AND (
          (perm = 'can_view_finance' AND fp.can_view_finance) OR
          (perm = 'can_add_transactions' AND fp.can_add_transactions) OR
          (perm = 'can_approve_withdrawals' AND fp.can_approve_withdrawals) OR
          (perm = 'can_delete_transactions' AND fp.can_delete_transactions) OR
          (perm = 'can_manage_fx_rates' AND fp.can_manage_fx_rates) OR
          (perm = 'can_manage_invoices' AND fp.can_manage_invoices)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.finance_can_decide(p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin_finance_ops()
    OR (
      p_kind = 'invoice' AND public.has_finance_permission('can_manage_invoices')
    )
    OR (
      p_kind = 'withdrawal' AND public.has_finance_permission('can_approve_withdrawals')
    )
    OR (
      p_kind = 'wallet_adjust' AND public.has_finance_permission('can_approve_withdrawals')
    )
    OR (
      p_kind = 'fx_rate' AND public.has_finance_permission('can_manage_fx_rates')
    )
    OR (
      p_kind = 'ledger_settle' AND (
        public.has_finance_permission('can_add_transactions')
        OR public.has_finance_permission('can_manage_invoices')
        OR public.is_admin()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.finance_can_manage_ledgers()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin()
    OR public.is_admin_finance_ops()
    OR public.is_admin_finance_staff()
    OR public.has_finance_permission('can_add_transactions')
    OR public.has_finance_permission('can_manage_invoices');
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
    user_id,
    can_view_finance,
    can_add_transactions,
    can_approve_withdrawals,
    can_delete_transactions,
    can_manage_fx_rates,
    can_manage_invoices
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

CREATE OR REPLACE FUNCTION public.trg_apply_hr_role_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND (
    TG_OP = 'INSERT'
    OR NEW.role_id IS DISTINCT FROM OLD.role_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.org_role IS DISTINCT FROM OLD.org_role
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.position IS DISTINCT FROM OLD.position
  ) THEN
    BEGIN
      PERFORM public.apply_hr_role_template(NEW.id, NEW.role_id);
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN OTHERS THEN
        IF SQLERRM LIKE 'Permission denied%' THEN
          NULL;
        ELSE
          RAISE;
        END IF;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_apply_hr_role_template ON public.employees;
CREATE TRIGGER employees_apply_hr_role_template
  AFTER INSERT OR UPDATE OF role_id, user_id, org_role, service_id, position
  ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_apply_hr_role_template();

CREATE OR REPLACE FUNCTION public.ensure_admin_finance_workspace_access(target_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp public.employees%ROWTYPE;
  v_user_id uuid;
  v_admin_role_id uuid;
  v_fm_role_id uuid;
BEGIN
  IF NOT public.employee_is_admin_finance_ops(target_employee_id) THEN
    RETURN;
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = target_employee_id;
  IF NOT FOUND OR v_emp.user_id IS NULL THEN
    RETURN;
  END IF;
  v_user_id := v_emp.user_id;

  INSERT INTO public.finance_permissions (
    user_id,
    can_view_finance,
    can_add_transactions,
    can_approve_withdrawals,
    can_delete_transactions,
    can_manage_fx_rates,
    can_manage_invoices
  ) VALUES (
    v_user_id, true, true, true, true, true, true
  )
  ON CONFLICT (user_id) DO UPDATE SET
    can_view_finance = true,
    can_add_transactions = true,
    can_approve_withdrawals = true,
    can_delete_transactions = true,
    can_manage_fx_rates = true,
    can_manage_invoices = true,
    updated_at = now();

  SELECT r.id INTO v_fm_role_id
  FROM public.hr_roles r
  WHERE r.name = 'Finance Manager' AND r.service_id IS NULL
  ORDER BY r.display_order
  LIMIT 1;

  IF v_fm_role_id IS NULL THEN
    SELECT r.id INTO v_fm_role_id
    FROM public.hr_roles r
    WHERE lower(r.name) LIKE '%finance manager%'
    ORDER BY r.display_order
    LIMIT 1;
  END IF;

  SELECT p.admin_role_id INTO v_admin_role_id
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_admin_role_id IS NULL THEN
    v_admin_role_id := COALESCE(v_fm_role_id, v_emp.role_id);
  END IF;

  UPDATE public.profiles
  SET role = 'admin',
      admin_role_id = COALESCE(admin_role_id, v_admin_role_id)
  WHERE id = v_user_id
    AND role IS DISTINCT FROM 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_ensure_admin_finance_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.ensure_admin_finance_workspace_access(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_ensure_admin_finance_workspace ON public.employees;
CREATE TRIGGER employees_ensure_admin_finance_workspace
  AFTER INSERT OR UPDATE OF role_id, user_id, org_role, service_id, position
  ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ensure_admin_finance_workspace();

-- Seed full finance ACL for Finance Manager and Admin & Finance leadership roles
INSERT INTO public.hr_role_permissions (role_id, page_key, can_access)
SELECT r.id, p.page_key, true
FROM public.hr_roles r
CROSS JOIN (VALUES
  ('admin-finance'),
  ('finance'),
  ('wallet'),
  ('receipts'),
  ('finance-services'),
  ('finance-cf'),
  ('finance-smart-sort'),
  ('finance-cleaning'),
  ('finance-security'),
  ('finance-procurement'),
  ('analytics')
) AS p(page_key)
WHERE lower(r.name) LIKE '%finance manager%'
   OR (
     r.name IN ('Admin Manager', 'Admin')
     AND EXISTS (
       SELECT 1 FROM public.services s
       WHERE s.id = r.service_id AND s.slug = 'admin-finance'
     )
   )
ON CONFLICT (role_id, page_key) DO UPDATE SET can_access = true;

-- Wallet / receipts / invoices / FX / payments: finance ops can act without waiting on JWT app_role
DROP POLICY IF EXISTS "select_own_wallet" ON public.wallet_transactions;
CREATE POLICY "select_own_wallet" ON public.wallet_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_insert_wallet" ON public.wallet_transactions;
CREATE POLICY "admin_insert_wallet" ON public.wallet_transactions FOR INSERT
  TO authenticated WITH CHECK (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_update_wallet" ON public.wallet_transactions;
CREATE POLICY "admin_update_wallet" ON public.wallet_transactions FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR public.is_admin_finance_ops())
  WITH CHECK (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_delete_wallet" ON public.wallet_transactions;
CREATE POLICY "admin_delete_wallet" ON public.wallet_transactions FOR DELETE
  TO authenticated USING (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "select_own_withdrawals" ON public.withdrawal_requests;
CREATE POLICY "select_own_withdrawals" ON public.withdrawal_requests FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_update_withdrawals" ON public.withdrawal_requests;
CREATE POLICY "admin_update_withdrawals" ON public.withdrawal_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR public.is_admin_finance_ops() OR public.has_finance_permission('can_approve_withdrawals'))
  WITH CHECK (public.is_admin() OR public.is_admin_finance_ops() OR public.has_finance_permission('can_approve_withdrawals'));

DROP POLICY IF EXISTS "admin_select_all_receipts" ON public.payment_receipts;
CREATE POLICY "admin_select_all_receipts" ON public.payment_receipts FOR SELECT
  TO authenticated USING (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_update_receipts" ON public.payment_receipts;
CREATE POLICY "admin_update_receipts" ON public.payment_receipts FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR public.is_admin_finance_ops())
  WITH CHECK (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_select_all_monime_payments" ON public.monime_payments;
CREATE POLICY "admin_select_all_monime_payments" ON public.monime_payments FOR SELECT
  TO authenticated USING (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_insert_payments" ON public.payments;
CREATE POLICY "admin_insert_payments" ON public.payments FOR INSERT
  TO authenticated WITH CHECK (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_select_all_invoices" ON public.invoices;
CREATE POLICY "admin_select_all_invoices" ON public.invoices FOR SELECT
  TO authenticated USING (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_insert_invoices" ON public.invoices;
CREATE POLICY "admin_insert_invoices" ON public.invoices FOR INSERT
  TO authenticated WITH CHECK (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_update_invoices" ON public.invoices;
CREATE POLICY "admin_update_invoices" ON public.invoices FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR public.is_admin_finance_ops())
  WITH CHECK (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_delete_invoices" ON public.invoices;
CREATE POLICY "admin_delete_invoices" ON public.invoices FOR DELETE
  TO authenticated USING (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_select_all_fx_rates" ON public.fx_rates;
CREATE POLICY "admin_select_all_fx_rates" ON public.fx_rates FOR SELECT
  TO authenticated USING (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_insert_fx_rates" ON public.fx_rates;
CREATE POLICY "admin_insert_fx_rates" ON public.fx_rates FOR INSERT
  TO authenticated WITH CHECK (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_update_fx_rates" ON public.fx_rates;
CREATE POLICY "admin_update_fx_rates" ON public.fx_rates FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR public.is_admin_finance_ops())
  WITH CHECK (public.is_admin() OR public.is_admin_finance_ops());

DROP POLICY IF EXISTS "admin_delete_fx_rates" ON public.fx_rates;
CREATE POLICY "admin_delete_fx_rates" ON public.fx_rates FOR DELETE
  TO authenticated USING (public.is_admin() OR public.is_admin_finance_ops());

CREATE OR REPLACE FUNCTION public.grant_admin_access(target_employee_id uuid, role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can grant admin access';
  END IF;

  UPDATE public.profiles
  SET role = 'admin',
      admin_role_id = role_id
  WHERE id = (
    SELECT user_id FROM public.employees WHERE id = target_employee_id
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee has no linked user account';
  END IF;

  IF role_id IS NOT NULL THEN
    PERFORM public.apply_hr_role_template(target_employee_id, role_id);
  END IF;

  PERFORM public.ensure_admin_finance_workspace_access(target_employee_id);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_admin_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_admin_access(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.employee_is_admin_finance_ops(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_finance_ops() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_finance_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_admin_finance_workspace_access(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.employee_is_admin_finance_ops(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_finance_ops() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_admin_finance_workspace_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_finance_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_can_decide(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_can_manage_ledgers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_finance_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hr_role_template(uuid, uuid) TO authenticated, service_role;

-- Backfill current HOD / Finance Manager / Admin Manager staff
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT e.id
    FROM public.employees e
    WHERE e.user_id IS NOT NULL
      AND public.employee_is_admin_finance_ops(e.id)
  LOOP
    PERFORM public.ensure_admin_finance_workspace_access(rec.id);
  END LOOP;
END $$;
