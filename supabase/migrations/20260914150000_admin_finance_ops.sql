-- Admin & Finance: role templates, department ACL, dual-control approval queue.

-- ── Helpers ──────────────────────────────────────────────────────────────

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
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_finance_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_finance_staff() TO authenticated;

-- Super-admins keep full finance access. Role-based admins use finance_permissions flags.
CREATE OR REPLACE FUNCTION public.has_finance_permission(perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
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

CREATE OR REPLACE FUNCTION public.finance_can_submit()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin_finance_staff()
    OR public.has_finance_permission('can_add_transactions')
    OR public.has_finance_permission('can_manage_invoices')
    OR public.has_finance_permission('can_view_finance');
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
    );
$$;

REVOKE ALL ON FUNCTION public.finance_can_submit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_can_decide(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_can_submit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_can_decide(text) TO authenticated;

-- ── Role templates (admin pages + finance flags) ─────────────────────────

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
    ELSIF v_role.name = 'Finance Manager' THEN
      v_view := true;
      v_add := true;
      v_invoices := true;
      v_approve := true;
      v_fx := true;
      v_delete := true;
    END IF;
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

REVOKE ALL ON FUNCTION public.apply_hr_role_template(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_hr_role_template(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hr_role_template(uuid, uuid) TO service_role;

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
  ) THEN
    PERFORM public.apply_hr_role_template(NEW.id, NEW.role_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_apply_hr_role_template ON public.employees;
CREATE TRIGGER employees_apply_hr_role_template
  AFTER INSERT OR UPDATE OF role_id, user_id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_apply_hr_role_template();

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
END;
$$;

-- Seed admin page ACL for department roles + Finance Manager extras
INSERT INTO public.hr_role_permissions (role_id, page_key, can_access)
SELECT r.id, p.page_key, true
FROM public.hr_roles r
JOIN public.services s ON s.id = r.service_id AND s.slug = 'admin-finance'
CROSS JOIN (VALUES
  ('finance'),
  ('wallet'),
  ('receipts'),
  ('hr-dashboard'),
  ('hr-employees'),
  ('hr-documents'),
  ('admin-finance')
) AS p(page_key)
WHERE r.name = 'Admin'
ON CONFLICT (role_id, page_key) DO NOTHING;

INSERT INTO public.hr_role_permissions (role_id, page_key, can_access)
SELECT r.id, p.page_key, true
FROM public.hr_roles r
JOIN public.services s ON s.id = r.service_id AND s.slug = 'admin-finance'
CROSS JOIN (VALUES
  ('finance'),
  ('wallet'),
  ('receipts'),
  ('admin-finance')
) AS p(page_key)
WHERE r.name = 'Finance Officer'
ON CONFLICT (role_id, page_key) DO NOTHING;

INSERT INTO public.hr_role_permissions (role_id, page_key, can_access)
SELECT r.id, p.page_key, true
FROM public.hr_roles r
JOIN public.services s ON s.id = r.service_id AND s.slug = 'admin-finance'
CROSS JOIN (VALUES
  ('receipts'),
  ('hr-documents'),
  ('admin-finance')
) AS p(page_key)
WHERE r.name = 'Admin Assistant'
ON CONFLICT (role_id, page_key) DO NOTHING;

INSERT INTO public.hr_role_permissions (role_id, page_key, can_access)
SELECT r.id, p.page_key, true
FROM public.hr_roles r
JOIN public.services s ON s.id = r.service_id AND s.slug = 'admin-finance'
CROSS JOIN (VALUES
  ('finance'),
  ('wallet'),
  ('receipts'),
  ('analytics'),
  ('admin-finance')
) AS p(page_key)
WHERE r.name = 'Admin Manager'
ON CONFLICT (role_id, page_key) DO NOTHING;

INSERT INTO public.hr_role_permissions (role_id, page_key, can_access)
SELECT r.id, p.page_key, true
FROM public.hr_roles r
CROSS JOIN (VALUES
  ('receipts'),
  ('admin-finance')
) AS p(page_key)
WHERE r.name = 'Finance Manager' AND r.service_id IS NULL
ON CONFLICT (role_id, page_key) DO NOTHING;

-- Backfill templates: HR role first, then admin_role_id so granted admin role wins.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM public.employees WHERE user_id IS NOT NULL AND role_id IS NOT NULL
  LOOP
    PERFORM public.apply_hr_role_template(rec.id);
  END LOOP;

  FOR rec IN
    SELECT e.id, p.admin_role_id
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.user_id
    WHERE p.admin_role_id IS NOT NULL
  LOOP
    PERFORM public.apply_hr_role_template(rec.id, rec.admin_role_id);
  END LOOP;
END $$;

-- ── Dual-control queue ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('invoice', 'withdrawal', 'wallet_adjust', 'fx_rate')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  related_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS finance_approvals_status_idx ON public.finance_approvals (status, kind);
CREATE INDEX IF NOT EXISTS finance_approvals_requested_by_idx ON public.finance_approvals (requested_by, status);
CREATE INDEX IF NOT EXISTS finance_approvals_service_id_idx ON public.finance_approvals (service_id);

ALTER TABLE public.finance_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_finance_approvals" ON public.finance_approvals;
CREATE POLICY "select_finance_approvals" ON public.finance_approvals FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.is_admin()
    OR public.is_admin_finance_staff()
    OR public.finance_can_decide(kind)
  );

DROP POLICY IF EXISTS "insert_finance_approvals" ON public.finance_approvals;
CREATE POLICY "insert_finance_approvals" ON public.finance_approvals FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.finance_can_submit()
  );

DROP POLICY IF EXISTS "update_own_draft_finance_approvals" ON public.finance_approvals;
CREATE POLICY "update_own_draft_finance_approvals" ON public.finance_approvals FOR UPDATE
  TO authenticated
  USING (requested_by = auth.uid() AND status = 'draft')
  WITH CHECK (requested_by = auth.uid() AND status IN ('draft', 'submitted'));

DROP TRIGGER IF EXISTS finance_approvals_updated_at ON public.finance_approvals;
CREATE TRIGGER finance_approvals_updated_at
  BEFORE UPDATE ON public.finance_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.finance_approvals REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'finance_approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_approvals;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_finance_user(
  p_user_id uuid,
  p_title text,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, read, service_slug)
  VALUES (p_user_id, p_title, p_body, 'system', false, 'finance');

  PERFORM public.enqueue_notification(
    p_user_id,
    'admin',
    'finance_approval',
    p_title,
    p_body,
    'system',
    jsonb_build_object('service_slug', 'finance')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_finance_approvers(
  p_kind text,
  p_title text,
  p_body text,
  p_exclude uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT fp.user_id
    FROM public.finance_permissions fp
    WHERE fp.user_id IS DISTINCT FROM p_exclude
      AND (
        (p_kind = 'invoice' AND fp.can_manage_invoices)
        OR (p_kind IN ('withdrawal', 'wallet_adjust') AND fp.can_approve_withdrawals)
        OR (p_kind = 'fx_rate' AND fp.can_manage_fx_rates)
      )
  LOOP
    PERFORM public.notify_finance_user(rec.user_id, p_title, p_body);
  END LOOP;

  FOR rec IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role = 'admin'
      AND p.admin_role_id IS NULL
      AND p.id IS DISTINCT FROM p_exclude
  LOOP
    PERFORM public.notify_finance_user(rec.id, p_title, p_body);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_finance_hr_activity(
  p_actor uuid,
  p_target uuid,
  p_description text,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id uuid;
  v_actor_emp uuid;
BEGIN
  SELECT id INTO v_actor_emp FROM public.employees WHERE user_id = p_actor LIMIT 1;
  SELECT id INTO v_emp_id FROM public.employees WHERE user_id = COALESCE(p_target, p_actor) LIMIT 1;
  IF v_emp_id IS NULL THEN
    v_emp_id := v_actor_emp;
  END IF;
  IF v_emp_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (v_emp_id, p_actor, 'finance_approval', p_description, p_metadata);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_finance_approval(
  p_kind text,
  p_payload jsonb,
  p_related_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_submit boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_service uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_kind NOT IN ('invoice', 'withdrawal', 'wallet_adjust', 'fx_rate') THEN
    RAISE EXCEPTION 'Invalid approval kind';
  END IF;
  IF NOT public.finance_can_submit() THEN
    RAISE EXCEPTION 'Permission denied: cannot submit finance requests';
  END IF;

  SELECT id INTO v_service FROM public.services WHERE slug = 'admin-finance';
  v_status := CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END;

  INSERT INTO public.finance_approvals (
    kind, status, requested_by, service_id, related_id, payload, note, submitted_at
  ) VALUES (
    p_kind,
    v_status,
    auth.uid(),
    v_service,
    p_related_id,
    COALESCE(p_payload, '{}'::jsonb),
    NULLIF(trim(COALESCE(p_note, '')), ''),
    CASE WHEN p_submit THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;

  PERFORM public.log_finance_hr_activity(
    auth.uid(),
    auth.uid(),
    format('Finance %s %s', p_kind, v_status),
    jsonb_build_object('approval_id', v_id, 'kind', p_kind, 'status', v_status)
  );

  IF p_submit THEN
    PERFORM public.notify_finance_approvers(
      p_kind,
      'Finance approval needed',
      format('A %s request is waiting for dual-control review.', replace(p_kind, '_', ' ')),
      auth.uid()
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_finance_approval(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.finance_approvals%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.finance_approvals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;
  IF v_row.requested_by <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Permission denied: only the requester can submit this draft';
  END IF;
  IF v_row.status <> 'draft' THEN
    RAISE EXCEPTION 'Only drafts can be submitted';
  END IF;
  IF NOT public.finance_can_submit() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.finance_approvals
  SET status = 'submitted', submitted_at = now()
  WHERE id = p_id;

  PERFORM public.log_finance_hr_activity(
    auth.uid(),
    v_row.requested_by,
    format('Submitted %s for approval', v_row.kind),
    jsonb_build_object('approval_id', p_id, 'kind', v_row.kind)
  );

  PERFORM public.notify_finance_approvers(
    v_row.kind,
    'Finance approval needed',
    format('A %s request is waiting for dual-control review.', replace(v_row.kind, '_', ' ')),
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_finance_approval(
  p_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.finance_approvals%ROWTYPE;
  v_payload jsonb;
  v_invoice_id uuid;
  v_fx_id uuid;
  v_next text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.finance_approvals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;
  IF v_row.status <> 'submitted' THEN
    RAISE EXCEPTION 'This request is not awaiting approval';
  END IF;
  IF v_row.requested_by = auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Dual control: the requester cannot approve their own request';
  END IF;
  IF NOT public.finance_can_decide(v_row.kind) THEN
    RAISE EXCEPTION 'Permission denied: you cannot approve this kind of request';
  END IF;

  v_payload := COALESCE(v_row.payload, '{}'::jsonb);
  v_next := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;

  IF p_approve THEN
    IF v_row.kind = 'invoice' THEN
      IF NULLIF(v_payload->>'user_id', '') IS NULL THEN
        RAISE EXCEPTION 'Invoice is missing a client';
      END IF;
      INSERT INTO public.invoices (
        user_id, status, issue_date, due_date, currency,
        subtotal, tax_rate, tax_amount, total, amount_paid, notes, line_items, created_by
      ) VALUES (
        NULLIF(v_payload->>'user_id', '')::uuid,
        COALESCE(NULLIF(v_payload->>'status', ''), 'sent'),
        COALESCE((v_payload->>'issue_date')::date, CURRENT_DATE),
        COALESCE((v_payload->>'due_date')::date, CURRENT_DATE + 14),
        COALESCE(NULLIF(v_payload->>'currency', ''), 'SLE'),
        COALESCE((v_payload->>'subtotal')::numeric, 0),
        COALESCE((v_payload->>'tax_rate')::numeric, 0),
        COALESCE((v_payload->>'tax_amount')::numeric, 0),
        COALESCE((v_payload->>'total')::numeric, 0),
        0,
        NULLIF(v_payload->>'notes', ''),
        COALESCE(v_payload->'line_items', '[]'::jsonb),
        auth.uid()::text
      )
      RETURNING id INTO v_invoice_id;

      v_row.related_id := COALESCE(v_row.related_id, v_invoice_id);

    ELSIF v_row.kind = 'withdrawal' THEN
      IF v_row.related_id IS NULL THEN
        RAISE EXCEPTION 'Withdrawal request is missing';
      END IF;
      UPDATE public.withdrawal_requests
      SET
        status = 'approved',
        admin_note = COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), admin_note),
        reviewed_by = auth.uid(),
        reviewed_at = now()
      WHERE id = v_row.related_id
        AND status = 'pending';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Withdrawal is not pending or was not found';
      END IF;

    ELSIF v_row.kind = 'wallet_adjust' THEN
      IF NULLIF(v_payload->>'user_id', '') IS NULL THEN
        RAISE EXCEPTION 'Wallet adjustment is missing a client';
      END IF;
      INSERT INTO public.wallet_transactions (
        user_id, type, amount_sle, method, reference, description, status, recorded_by
      ) VALUES (
        NULLIF(v_payload->>'user_id', '')::uuid,
        COALESCE(NULLIF(v_payload->>'type', ''), 'adjustment'),
        COALESCE((v_payload->>'amount_sle')::numeric, 0),
        COALESCE(NULLIF(v_payload->>'method', ''), 'admin'),
        NULLIF(v_payload->>'reference', ''),
        COALESCE(NULLIF(v_payload->>'description', ''), 'Approved wallet adjustment'),
        'completed',
        auth.uid()::text
      );

    ELSIF v_row.kind = 'fx_rate' THEN
      IF COALESCE(trim(v_payload->>'currency_code'), '') = '' THEN
        RAISE EXCEPTION 'FX rate is missing a currency code';
      END IF;
      INSERT INTO public.fx_rates (
        currency_code, currency_name, symbol, rate_to_sle, is_active, updated_by
      ) VALUES (
        upper(COALESCE(v_payload->>'currency_code', '')),
        COALESCE(v_payload->>'currency_name', upper(COALESCE(v_payload->>'currency_code', ''))),
        COALESCE(v_payload->>'symbol', ''),
        COALESCE((v_payload->>'rate_to_sle')::numeric, 0),
        COALESCE((v_payload->>'is_active')::boolean, true),
        auth.uid()::text
      )
      ON CONFLICT (currency_code) DO UPDATE SET
        currency_name = EXCLUDED.currency_name,
        symbol = EXCLUDED.symbol,
        rate_to_sle = EXCLUDED.rate_to_sle,
        is_active = EXCLUDED.is_active,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING id INTO v_fx_id;
      v_row.related_id := COALESCE(v_row.related_id, v_fx_id);
    END IF;
  ELSIF v_row.kind = 'withdrawal' AND v_row.related_id IS NOT NULL THEN
    UPDATE public.withdrawal_requests
    SET
      status = 'rejected',
      admin_note = COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), admin_note),
      reviewed_by = auth.uid(),
      reviewed_at = now()
    WHERE id = v_row.related_id
      AND status = 'pending';
  END IF;

  UPDATE public.finance_approvals
  SET
    status = v_next,
    approved_by = auth.uid(),
    decision_note = NULLIF(trim(COALESCE(p_note, '')), ''),
    decided_at = now(),
    related_id = v_row.related_id
  WHERE id = p_id;

  PERFORM public.log_finance_hr_activity(
    auth.uid(),
    v_row.requested_by,
    format('%s %s request', initcap(v_next), replace(v_row.kind, '_', ' ')),
    jsonb_build_object('approval_id', p_id, 'kind', v_row.kind, 'status', v_next)
  );

  PERFORM public.notify_finance_user(
    v_row.requested_by,
    format('Finance request %s', v_next),
    COALESCE(
      NULLIF(trim(COALESCE(p_note, '')), ''),
      format('Your %s request was %s.', replace(v_row.kind, '_', ' '), v_next)
    )
  );

  RETURN jsonb_build_object('success', true, 'status', v_next, 'id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_withdrawal_request(
  p_withdrawal_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.withdrawal_requests%ROWTYPE;
  v_approval uuid;
  v_service uuid;
BEGIN
  IF NOT public.finance_can_decide('withdrawal') THEN
    RAISE EXCEPTION 'Permission denied: cannot approve withdrawals';
  END IF;

  SELECT * INTO v_row FROM public.withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Withdrawal is not pending';
  END IF;

  SELECT id INTO v_service FROM public.services WHERE slug = 'admin-finance';

  INSERT INTO public.finance_approvals (
    kind, status, requested_by, approved_by, service_id, related_id, payload, decision_note, submitted_at, decided_at
  ) VALUES (
    'withdrawal',
    CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    v_row.user_id,
    auth.uid(),
    v_service,
    p_withdrawal_id,
    jsonb_build_object('amount_sle', v_row.amount_sle, 'payout_method', v_row.payout_method),
    NULLIF(trim(COALESCE(p_note, '')), ''),
    now(),
    now()
  )
  RETURNING id INTO v_approval;

  UPDATE public.withdrawal_requests
  SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    admin_note = COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), admin_note),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_withdrawal_id;

  PERFORM public.log_finance_hr_activity(
    auth.uid(),
    v_row.user_id,
    CASE WHEN p_approve THEN 'Approved withdrawal' ELSE 'Rejected withdrawal' END,
    jsonb_build_object('withdrawal_id', p_withdrawal_id, 'approval_id', v_approval)
  );

  RETURN jsonb_build_object('success', true, 'approval_id', v_approval);
END;
$$;

CREATE OR REPLACE FUNCTION public.search_finance_clients(p_query text)
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.finance_can_submit() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF length(trim(COALESCE(p_query, ''))) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  WHERE p.full_name ILIKE '%' || trim(p_query) || '%'
     OR p.email ILIKE '%' || trim(p_query) || '%'
  ORDER BY p.full_name NULLS LAST
  LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_finance_user(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_finance_approvers(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_finance_hr_activity(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_finance_permission(text) TO authenticated;
REVOKE ALL ON FUNCTION public.grant_admin_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_admin_access(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_finance_approval(text, jsonb, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_finance_approval(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_finance_approval(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_withdrawal_request(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_finance_clients(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_finance_approval(text, jsonb, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_finance_approval(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_finance_approval(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_withdrawal_request(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_finance_clients(text) TO authenticated;

-- Tighten withdrawal updates: dual-control RPC (or super-admin) instead of any admin.
DROP POLICY IF EXISTS "admin_update_withdrawals" ON public.withdrawal_requests;
CREATE POLICY "admin_update_withdrawals" ON public.withdrawal_requests FOR UPDATE
  TO authenticated
  USING (public.is_super_admin() OR public.has_finance_permission('can_approve_withdrawals'))
  WITH CHECK (public.is_super_admin() OR public.has_finance_permission('can_approve_withdrawals'));
