-- Wallet + Monime hardening: unique credits, booking purpose, debit locks,
-- withdrawal reservation, dual-control completion, invoice pay, booking refund.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('pending', 'pending_cash', 'paid', 'pending_verification', 'verified', 'rejected', 'refunded'));

-- ── Unique Monime credit (webhook + poll cannot double-insert) ──
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_monime_payment_id_uidx
  ON public.wallet_transactions (monime_payment_id)
  WHERE monime_payment_id IS NOT NULL;

-- ── Store SLE as numeric matching Monime minor units / 100 ──
-- revenue_daily depends on monime_payments.amount_sle; drop/recreate around the type change.
DROP VIEW IF EXISTS public.revenue_daily;

ALTER TABLE public.monime_payments
  ALTER COLUMN amount_sle TYPE numeric(14,2)
  USING amount_sle::numeric(14,2);

CREATE VIEW public.revenue_daily
WITH (security_invoker = true)
AS
SELECT
  d::date AS date,
  COALESCE(w.topups, 0) AS wallet_topups,
  COALESCE(w.payments, 0) AS wallet_payments,
  COALESCE(m.monime_amount, 0) AS monime_amount,
  COALESCE(r.receipt_amount, 0) AS receipt_amount,
  (COALESCE(w.topups, 0) + COALESCE(m.monime_amount, 0) + COALESCE(r.receipt_amount, 0)) AS total_inflow,
  COALESCE(w.payments, 0) AS total_outflow
FROM generate_series(
  (date_trunc('day', now()) - interval '90 days')::date,
  date_trunc('day', now())::date,
  interval '1 day'
) AS d
LEFT JOIN (
  SELECT date_trunc('day', created_at)::date AS day,
    SUM(CASE WHEN type = 'topup' AND status = 'completed' THEN amount_sle ELSE 0 END) AS topups,
    SUM(CASE WHEN type = 'payment' AND status = 'completed' THEN ABS(amount_sle) ELSE 0 END) AS payments
  FROM wallet_transactions GROUP BY 1
) w ON w.day = d::date
LEFT JOIN (
  SELECT date_trunc('day', created_at)::date AS day,
    SUM(CASE WHEN status = 'completed' THEN amount_sle ELSE 0 END) AS monime_amount
  FROM monime_payments GROUP BY 1
) m ON m.day = d::date
LEFT JOIN (
  SELECT date_trunc('day', paid_at)::date AS day,
    SUM(amount_sle) AS receipt_amount
  FROM payment_receipts GROUP BY 1
) r ON r.day = d::date
WHERE is_admin();

REVOKE ALL ON public.revenue_daily FROM anon;
GRANT SELECT ON public.revenue_daily TO authenticated;

-- ── Allow booking checkout purpose ──
ALTER TABLE public.monime_payments DROP CONSTRAINT IF EXISTS monime_payments_purpose_check;
ALTER TABLE public.monime_payments
  ADD CONSTRAINT monime_payments_purpose_check
  CHECK (purpose = ANY (ARRAY['invoice'::text, 'wallet_topup'::text, 'subscription'::text, 'booking'::text]));

-- ── Allow admin UUID as recorded_by (dual-control wallet adjustments) ──
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_recorded_by_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_recorded_by_check
  CHECK (
    recorded_by IN ('client', 'admin', 'system', 'monime_webhook', 'monime_verify')
    OR recorded_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- ── Quoted booking total helper ──
CREATE OR REPLACE FUNCTION public.booking_quoted_total(p_details jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(p_details->>'total_sle', '')::numeric,
    NULLIF(p_details->>'price_sle', '')::numeric,
    NULLIF(p_details->>'amount_sle', '')::numeric
  );
$$;

-- ── Pay booking from wallet: lock user ledger, match quoted total ──
CREATE OR REPLACE FUNCTION public.pay_booking_from_wallet(p_booking_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking RECORD;
  v_balance numeric;
  v_quoted numeric;
  v_tx uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in to pay.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || v_uid::text));

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found.');
  END IF;
  IF v_booking.user_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'This booking does not belong to you.');
  END IF;
  IF v_booking.payment_status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid', 'idempotent', true);
  END IF;
  IF v_booking.status IN ('cancelled') OR v_booking.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This booking cannot be paid.');
  END IF;

  v_quoted := public.booking_quoted_total(v_booking.details);
  IF v_quoted IS NOT NULL AND abs(v_quoted - p_amount) > 0.009 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount does not match the booking total.', 'quoted', v_quoted, 'requested', p_amount);
  END IF;

  SELECT COALESCE(SUM(amount_sle), 0) INTO v_balance
  FROM wallet_transactions
  WHERE user_id = v_uid AND status = 'completed';

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance.', 'balance', v_balance, 'requested', p_amount);
  END IF;

  INSERT INTO wallet_transactions (user_id, type, amount_sle, description, method, reference, booking_id, status, recorded_by)
  VALUES (v_uid, 'payment', -p_amount, 'Wallet payment for booking', 'wallet', p_booking_id::text, p_booking_id, 'completed', 'client')
  RETURNING id INTO v_tx;

  INSERT INTO payments (user_id, payable_type, payable_id, amount_sle, method, status)
  VALUES (v_uid, 'booking', p_booking_id, p_amount, 'wallet', 'confirmed');

  UPDATE bookings
  SET payment_method = 'wallet', payment_status = 'paid'
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx, 'balance_after', v_balance - p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_booking_from_wallet(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_booking_from_wallet(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.pay_booking_from_wallet(uuid, numeric) TO authenticated;

-- ── Available balance = completed ledger minus pending/approved withdrawals ──
CREATE OR REPLACE FUNCTION public.wallet_available_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(amount_sle) FROM wallet_transactions
      WHERE user_id = p_user_id AND status = 'completed'
    ), 0)
    - COALESCE((
      SELECT SUM(amount_sle) FROM withdrawal_requests
      WHERE user_id = p_user_id AND status IN ('pending', 'approved')
    ), 0);
$$;

-- ── Reject overdrawn withdrawal insert / approve ──
CREATE OR REPLACE FUNCTION public.enforce_withdrawal_available_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available numeric;
  v_reserved_other numeric;
  v_completed numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('rejected', 'cancelled', 'completed') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status IN ('pending', 'approved')) THEN
    SELECT COALESCE(SUM(amount_sle), 0) INTO v_completed
    FROM wallet_transactions
    WHERE user_id = NEW.user_id AND status = 'completed';

    SELECT COALESCE(SUM(amount_sle), 0) INTO v_reserved_other
    FROM withdrawal_requests
    WHERE user_id = NEW.user_id
      AND status IN ('pending', 'approved')
      AND id IS DISTINCT FROM NEW.id;

    v_available := v_completed - v_reserved_other;
    IF v_available < NEW.amount_sle THEN
      RAISE EXCEPTION 'Insufficient available wallet balance for this withdrawal'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_withdrawal_balance ON public.withdrawal_requests;
CREATE TRIGGER trg_enforce_withdrawal_balance
  BEFORE INSERT OR UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_withdrawal_available_balance();

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_payout_method text,
  p_payout_details jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in.');
  END IF;
  IF p_amount IS NULL OR p_amount < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal is SLE 10.00');
  END IF;
  IF p_payout_method NOT IN ('mobile_money', 'bank_transfer', 'cash') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payout method.');
  END IF;

  INSERT INTO withdrawal_requests (user_id, amount_sle, payout_method, payout_details, status)
  VALUES (v_uid, p_amount, p_payout_method, COALESCE(p_payout_details, '{}'::jsonb), 'pending')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient available wallet balance for this withdrawal');
END;
$$;

REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, jsonb) TO authenticated;

-- ── Dual-control on completion (approver cannot disburse) ──
CREATE OR REPLACE FUNCTION public.process_withdrawal_completion(
  p_withdrawal_id uuid,
  p_monime_payout_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal withdrawal_requests%ROWTYPE;
  v_balance numeric(14,2);
  v_user_id uuid;
  v_is_admin boolean;
  v_method text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_is_admin := public.is_admin();

  SELECT * INTO v_withdrawal FROM withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF v_withdrawal.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already completed');
  END IF;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only an admin can complete this withdrawal');
  END IF;

  IF v_withdrawal.reviewed_by IS NOT NULL AND v_withdrawal.reviewed_by = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'A different admin must send this payout (dual control)');
  END IF;

  IF v_withdrawal.status NOT IN ('approved', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot complete a ' || v_withdrawal.status || ' withdrawal');
  END IF;

  IF v_withdrawal.status = 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal must be approved before completion');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || v_withdrawal.user_id::text));

  SELECT COALESCE(SUM(amount_sle), 0) INTO v_balance
  FROM wallet_transactions
  WHERE user_id = v_withdrawal.user_id AND status = 'completed';

  IF v_balance < v_withdrawal.amount_sle THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  v_method := CASE v_withdrawal.payout_method
    WHEN 'mobile_money' THEN 'monime'
    WHEN 'bank_transfer' THEN 'bank_transfer'
    WHEN 'cash' THEN 'cash'
    ELSE v_withdrawal.payout_method
  END;

  INSERT INTO wallet_transactions (
    user_id, type, amount_sle, description, method, reference,
    status, recorded_by
  ) VALUES (
    v_withdrawal.user_id,
    'payment',
    -v_withdrawal.amount_sle,
    'Withdrawal via ' || v_withdrawal.payout_method,
    v_method,
    p_monime_payout_id,
    'completed',
    'admin'
  );

  UPDATE withdrawal_requests
  SET status = 'completed',
      completed_at = now(),
      reference = COALESCE(p_monime_payout_id, reference),
      monime_payout_id = COALESCE(p_monime_payout_id, monime_payout_id),
      payout_status = 'completed'
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_withdrawal_completion(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_completion(uuid, text) TO authenticated;

-- ── Pay invoice from wallet (finance invoices or Smart Sort) ──
CREATE OR REPLACE FUNCTION public.pay_invoice_from_wallet(
  p_invoice_id uuid,
  p_source text DEFAULT 'finance'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_due numeric;
  v_user uuid;
  v_status text;
  v_tx uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in.');
  END IF;
  IF p_source NOT IN ('finance', 'smart_sort') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid invoice source.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || v_uid::text));

  IF p_source = 'finance' THEN
    SELECT user_id, status, (total - amount_paid) INTO v_user, v_status, v_due
    FROM invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
    END IF;
    IF v_user IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
      RETURN jsonb_build_object('success', false, 'error', 'This invoice does not belong to you.');
    END IF;
    IF v_status = 'paid' THEN
      RETURN jsonb_build_object('success', true, 'message', 'Already paid', 'idempotent', true);
    END IF;
    IF v_status = 'cancelled' THEN
      RETURN jsonb_build_object('success', false, 'error', 'This invoice is cancelled.');
    END IF;
  ELSE
    SELECT user_id, status, (amount_sle - amount_paid_sle) INTO v_user, v_status, v_due
    FROM smart_sort_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
    END IF;
    IF v_user IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
      RETURN jsonb_build_object('success', false, 'error', 'This invoice does not belong to you.');
    END IF;
    IF v_status IN ('paid', 'void') THEN
      RETURN jsonb_build_object('success', true, 'message', 'Already paid', 'idempotent', true);
    END IF;
  END IF;

  IF v_due IS NULL OR v_due <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nothing due on this invoice.');
  END IF;

  SELECT COALESCE(SUM(amount_sle), 0) INTO v_balance
  FROM wallet_transactions
  WHERE user_id = v_user AND status = 'completed';

  IF v_balance < v_due THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance.', 'balance', v_balance, 'requested', v_due);
  END IF;

  INSERT INTO wallet_transactions (user_id, type, amount_sle, description, method, reference, status, recorded_by)
  VALUES (v_user, 'payment', -v_due, 'Wallet payment for invoice', 'wallet', p_invoice_id::text, 'completed', 'client')
  RETURNING id INTO v_tx;

  INSERT INTO payments (user_id, payable_type, payable_id, amount_sle, method, status)
  VALUES (v_user, 'invoice', p_invoice_id, v_due, 'wallet', 'confirmed');

  IF p_source = 'finance' THEN
    UPDATE invoices
    SET amount_paid = total, status = 'paid', paid_at = now(), payment_method = 'wallet'
    WHERE id = p_invoice_id;
  ELSE
    PERFORM increment_invoice_paid(p_invoice_id, round(v_due)::integer);
  END IF;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx, 'amount', v_due);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_invoice_from_wallet(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_invoice_from_wallet(uuid, text) TO authenticated;

-- ── Refund wallet payment when a paid booking is cancelled ──
CREATE OR REPLACE FUNCTION public.refund_booking_to_wallet(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking RECORD;
  v_paid numeric;
  v_existing uuid;
  v_tx uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in.');
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found.');
  END IF;
  IF v_booking.user_id IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This booking does not belong to you.');
  END IF;
  IF v_booking.payment_status = 'refunded' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already refunded', 'idempotent', true);
  END IF;
  IF v_booking.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking is not paid.');
  END IF;
  IF COALESCE(v_booking.payment_method, '') IS DISTINCT FROM 'wallet' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only wallet payments are refunded automatically.');
  END IF;

  SELECT id INTO v_existing
  FROM wallet_transactions
  WHERE user_id = v_booking.user_id
    AND type = 'refund'
    AND reference = p_booking_id::text
    AND status = 'completed'
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE bookings SET payment_status = 'refunded' WHERE id = p_booking_id;
    RETURN jsonb_build_object('success', true, 'message', 'Already refunded', 'idempotent', true);
  END IF;

  SELECT COALESCE(SUM(abs(amount_sle)), 0) INTO v_paid
  FROM wallet_transactions
  WHERE user_id = v_booking.user_id
    AND type = 'payment'
    AND status = 'completed'
    AND (reference = p_booking_id::text OR booking_id = p_booking_id);

  IF v_paid <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No wallet payment found to refund.');
  END IF;

  INSERT INTO wallet_transactions (user_id, type, amount_sle, description, method, reference, booking_id, status, recorded_by)
  VALUES (v_booking.user_id, 'refund', v_paid, 'Refund for cancelled booking', 'wallet', p_booking_id::text, p_booking_id, 'completed', 'system')
  RETURNING id INTO v_tx;

  UPDATE bookings SET payment_status = 'refunded' WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx, 'amount', v_paid);
END;
$$;

REVOKE ALL ON FUNCTION public.refund_booking_to_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_booking_to_wallet(uuid) TO authenticated;
