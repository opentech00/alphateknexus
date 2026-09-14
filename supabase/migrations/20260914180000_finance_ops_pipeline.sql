-- Finance pipeline: invoice-from-booking, dual-control ledger settle, bank slips, snapshots.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_per_booking
  ON public.invoices (booking_id)
  WHERE booking_id IS NOT NULL AND status <> 'cancelled';

ALTER TABLE public.service_finance_entries
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.finance_approvals DROP CONSTRAINT IF EXISTS finance_approvals_kind_check;
ALTER TABLE public.finance_approvals
  ADD CONSTRAINT finance_approvals_kind_check
  CHECK (kind IN ('invoice', 'withdrawal', 'wallet_adjust', 'fx_rate', 'ledger_settle'));

ALTER TABLE public.finance_reports DROP CONSTRAINT IF EXISTS finance_reports_report_type_check;
ALTER TABLE public.finance_reports
  ADD CONSTRAINT finance_reports_report_type_check
  CHECK (report_type IN ('weekly_digest', 'monthly_statement', 'client_statement', 'admin_revenue', 'service_pnl'));

DROP POLICY IF EXISTS "finance_select_payment_verifications" ON public.payment_verifications;
CREATE POLICY "finance_select_payment_verifications" ON public.payment_verifications FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_admin_finance_staff()
    OR public.has_finance_permission('can_view_finance')
  );

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
        OR (p_kind = 'ledger_settle' AND (fp.can_add_transactions OR fp.can_manage_invoices))
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
    )
    OR (
      p_kind = 'ledger_settle' AND (
        public.has_finance_permission('can_add_transactions')
        OR public.has_finance_permission('can_manage_invoices')
        OR public.is_admin()
      )
    );
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
  IF p_kind NOT IN ('invoice', 'withdrawal', 'wallet_adjust', 'fx_rate', 'ledger_settle') THEN
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

CREATE OR REPLACE FUNCTION public.link_invoice_to_booking(p_invoice_id uuid, p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_invoice_id IS NULL OR p_booking_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.invoices SET booking_id = p_booking_id WHERE id = p_invoice_id;
  UPDATE public.service_finance_entries
  SET invoice_id = p_invoice_id,
      notes = COALESCE(notes || E'\n', '') || 'Invoiced'
  WHERE booking_id = p_booking_id AND source = 'booking';
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
  v_settle jsonb;
  v_booking_id uuid;
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
      v_booking_id := NULLIF(v_payload->>'booking_id', '')::uuid;
      PERFORM public.link_invoice_to_booking(v_invoice_id, v_booking_id);

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

    ELSIF v_row.kind = 'ledger_settle' THEN
      v_settle := public.finance_settle_booking(
        NULLIF(v_payload->>'booking_id', '')::uuid,
        COALESCE(v_payload->>'method', ''),
        COALESCE((v_payload->>'amount')::numeric, 0),
        NULLIF(v_payload->>'reference', ''),
        NULLIF(v_payload->>'notes', '')
      );
      IF COALESCE(v_settle->>'success', 'false') <> 'true' THEN
        RAISE EXCEPTION '%', COALESCE(v_settle->>'error', 'Settlement failed');
      END IF;
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

CREATE OR REPLACE FUNCTION public.finance_request_ledger_settle(
  p_booking_id uuid,
  p_method text,
  p_amount numeric,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_immediate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.finance_can_manage_ledgers() THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to record payments.');
  END IF;
  IF p_immediate AND public.is_super_admin() THEN
    RETURN public.finance_settle_booking(p_booking_id, p_method, p_amount, p_reference, p_notes);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.finance_approvals
    WHERE kind = 'ledger_settle'
      AND related_id = p_booking_id
      AND status IN ('draft', 'submitted')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A payment for this request is already awaiting approval.');
  END IF;
  v_id := public.create_finance_approval(
    'ledger_settle',
    jsonb_build_object(
      'booking_id', p_booking_id,
      'method', p_method,
      'amount', p_amount,
      'reference', p_reference,
      'notes', p_notes
    ),
    p_booking_id,
    p_notes,
    true
  );
  RETURN jsonb_build_object('success', true, 'queued', true, 'approval_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_invoice_from_booking(
  p_booking_id uuid,
  p_due_days integer DEFAULT 14,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_amount numeric;
  v_desc text;
  v_approval uuid;
  v_invoice uuid;
  v_due integer;
BEGIN
  IF NOT public.finance_can_manage_ledgers() THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to invoice this request.');
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE booking_id = p_booking_id AND status <> 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request already has an invoice.');
  END IF;
  v_amount := COALESCE(public.booking_quoted_total(v_booking.details), 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Set a quote amount before invoicing.');
  END IF;
  v_due := GREATEST(COALESCE(p_due_days, 14), 1);
  v_desc := COALESCE(
    CASE WHEN COALESCE(v_booking.details->>'quote_request', '') IN ('true', 't', '1') THEN 'Quoted service' ELSE 'Hired service' END,
    'Service'
  );

  IF public.is_super_admin() THEN
    INSERT INTO public.invoices (
      user_id, status, issue_date, due_date, currency,
      subtotal, tax_rate, tax_amount, total, amount_paid, notes, line_items, created_by, booking_id
    ) VALUES (
      v_booking.user_id, 'sent', CURRENT_DATE, CURRENT_DATE + v_due, 'SLE',
      v_amount, 0, 0, v_amount, 0,
      NULLIF(BTRIM(COALESCE(p_note, '')), ''),
      jsonb_build_array(jsonb_build_object('description', v_desc, 'quantity', 1, 'unit_price', v_amount, 'total', v_amount)),
      auth.uid()::text,
      p_booking_id
    )
    RETURNING id INTO v_invoice;
    PERFORM public.link_invoice_to_booking(v_invoice, p_booking_id);
    RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice, 'queued', false);
  END IF;

  v_approval := public.create_finance_approval(
    'invoice',
    jsonb_build_object(
      'user_id', v_booking.user_id,
      'booking_id', p_booking_id,
      'status', 'sent',
      'issue_date', CURRENT_DATE,
      'due_date', CURRENT_DATE + v_due,
      'currency', 'SLE',
      'subtotal', v_amount,
      'tax_rate', 0,
      'tax_amount', 0,
      'total', v_amount,
      'notes', p_note,
      'line_items', jsonb_build_array(jsonb_build_object(
        'description', v_desc, 'quantity', 1, 'unit_price', v_amount, 'total', v_amount
      ))
    ),
    p_booking_id,
    p_note,
    true
  );
  RETURN jsonb_build_object('success', true, 'approval_id', v_approval, 'queued', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_pending_bank_slips(p_service_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.is_admin_finance_staff()
    OR public.has_finance_permission('can_view_finance')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      pv.id,
      pv.booking_id,
      pv.document_type,
      pv.document_name,
      pv.document_url,
      pv.amount_sle,
      pv.created_at,
      COALESCE(NULLIF(BTRIM(b.contact_name), ''), 'Client') AS contact_name,
      s.name AS service_name,
      s.id AS service_id
    FROM public.payment_verifications pv
    JOIN public.bookings b ON b.id = pv.booking_id
    JOIN public.services s ON s.id = b.service_id
    WHERE pv.status = 'pending'
      AND (p_service_id IS NULL OR b.service_id = p_service_id)
    ORDER BY pv.created_at DESC
    LIMIT 80
  ) x;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_review_bank_slip(
  p_id uuid,
  p_approve boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_verifications%ROWTYPE;
BEGIN
  IF NOT public.finance_can_manage_ledgers() THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot review bank slips.');
  END IF;
  SELECT * INTO v_row FROM public.payment_verifications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slip not found.');
  END IF;
  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This slip was already reviewed.');
  END IF;

  IF p_approve THEN
    UPDATE public.payment_verifications
    SET status = 'verified', verified_by = auth.uid(), verified_at = now(), updated_at = now()
    WHERE id = p_id;
    UPDATE public.bookings
    SET payment_status = 'verified', payment_method = COALESCE(payment_method, 'bank')
    WHERE id = v_row.booking_id;
  ELSE
    IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Give a rejection reason.');
    END IF;
    UPDATE public.payment_verifications
    SET status = 'rejected', rejection_reason = BTRIM(p_reason), updated_at = now()
    WHERE id = p_id;
    UPDATE public.bookings
    SET payment_status = 'rejected'
    WHERE id = v_row.booking_id;
  END IF;

  PERFORM public.log_finance_hr_activity(
    auth.uid(),
    auth.uid(),
    CASE WHEN p_approve THEN 'Verified bank slip' ELSE 'Rejected bank slip' END,
    jsonb_build_object('verification_id', p_id, 'booking_id', v_row.booking_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_ledger_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending numeric := 0;
  v_collected numeric := 0;
  v_online numeric := 0;
  v_offline numeric := 0;
  v_pending_n int := 0;
  v_services jsonb;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.is_admin_finance_staff()
    OR public.has_finance_permission('can_view_finance')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT
    COALESCE(SUM(amount_sle) FILTER (WHERE source = 'booking' AND settlement = 'pending'), 0),
    COALESCE(COUNT(*) FILTER (WHERE source = 'booking' AND settlement = 'pending'), 0),
    COALESCE(SUM(amount_sle) FILTER (
      WHERE kind = 'revenue' AND (
        (source = 'booking' AND settlement = 'collected')
        OR (source = 'manual' AND settlement <> 'void')
      )
    ), 0),
    COALESCE(SUM(amount_sle) FILTER (WHERE kind = 'revenue' AND channel = 'online' AND settlement = 'collected'), 0),
    COALESCE(SUM(amount_sle) FILTER (WHERE kind = 'revenue' AND channel = 'offline' AND settlement = 'collected'), 0)
  INTO v_pending, v_pending_n, v_collected, v_online, v_offline
  FROM public.service_finance_entries;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_services
  FROM (
    SELECT s.slug, s.name,
      COALESCE(SUM(e.amount_sle) FILTER (WHERE e.source = 'booking' AND e.settlement = 'pending'), 0) AS pending,
      COALESCE(SUM(e.amount_sle) FILTER (WHERE e.kind = 'revenue' AND e.settlement = 'collected'), 0) AS collected
    FROM public.services s
    LEFT JOIN public.service_finance_entries e ON e.service_id = s.id
    WHERE COALESCE(s.is_internal, false) = false
    GROUP BY s.id, s.slug, s.name
    ORDER BY s.name
  ) x;

  RETURN jsonb_build_object(
    'pending_amount', v_pending,
    'pending_count', v_pending_n,
    'collected_amount', v_collected,
    'online_amount', v_online,
    'offline_amount', v_offline,
    'services', v_services
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_generate_service_pnl(p_period_start date, p_period_end date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_snap jsonb;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.is_admin_finance_staff()
    OR public.has_finance_permission('can_view_finance')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  v_snap := public.finance_ledger_snapshot();
  INSERT INTO public.finance_reports (user_id, report_type, period_start, period_end, summary, status)
  VALUES (NULL, 'service_pnl', p_period_start, p_period_end, v_snap, 'generated')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_invoice_to_booking(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_request_ledger_settle(uuid, text, numeric, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_invoice_from_booking(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_pending_bank_slips(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_review_bank_slip(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_ledger_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_generate_service_pnl(date, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.finance_can_decide(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_finance_approval(text, jsonb, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_finance_approval(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_request_ledger_settle(uuid, text, numeric, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_invoice_from_booking(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_pending_bank_slips(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_review_bank_slip(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_ledger_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_generate_service_pnl(date, date) TO authenticated;
