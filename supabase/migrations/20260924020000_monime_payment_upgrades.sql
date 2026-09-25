/*
  Monime payment upgrades
  1. Server-locked amounts: bookings track amount_paid_sle; ledger credit is atomic and partial-aware.
  2. Resume: attempt-scoped sessions (handled in Edge Functions).
  3. Unmatched webhook inbox for finance.
  4. Quote deposits: details.deposit_sle, payment_status 'deposit_paid'.
  5. Field collection: monime_payments.initiated_by / kind = 'field'.
*/

-- ── Helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.safe_numeric(p_value text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_value ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN p_value::numeric
    ELSE NULL
  END;
$$;

-- Mirrors src/lib/bookingPay.ts bookingPayAmount (without the client fallback).
CREATE OR REPLACE FUNCTION public.booking_total_sle(p_details jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(public.safe_numeric(p_details->>'quoted_total_sle'), 0),
    NULLIF(public.safe_numeric(p_details->>'total_sle'), 0),
    NULLIF(public.safe_numeric(p_details->>'price_sle'), 0),
    NULLIF(public.safe_numeric(p_details->>'amount_sle'), 0)
  );
$$;

-- ── Bookings: running total + deposit status ──────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS amount_paid_sle numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN (
    'pending', 'pending_cash', 'deposit_paid', 'paid',
    'pending_verification', 'verified', 'rejected', 'refunded'
  ));

UPDATE public.bookings
SET amount_paid_sle = COALESCE(public.booking_total_sle(details), 0)
WHERE payment_status IN ('paid', 'verified')
  AND amount_paid_sle = 0;

CREATE OR REPLACE FUNCTION public.sync_booking_amount_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trusted boolean := auth.uid() IS NULL
    OR public.is_admin()
    OR current_setting('app.booking_payment_rpc', true) = 'on';
  v_total numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT v_trusted THEN
      NEW.amount_paid_sle := 0;
      IF NEW.payment_status = 'deposit_paid' THEN
        NEW.payment_status := 'pending';
      END IF;
    END IF;
  ELSE
    IF NOT v_trusted AND (
      NEW.amount_paid_sle IS DISTINCT FROM OLD.amount_paid_sle
      OR (NEW.payment_status = 'deposit_paid' AND OLD.payment_status IS DISTINCT FROM 'deposit_paid')
    ) THEN
      RAISE EXCEPTION 'Permission denied: booking payments are recorded by the server'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.payment_status IN ('paid', 'verified')
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    v_total := public.booking_total_sle(NEW.details);
    IF v_total IS NOT NULL AND NEW.amount_paid_sle < v_total THEN
      NEW.amount_paid_sle := v_total;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booking_amount_paid ON public.bookings;
CREATE TRIGGER trg_sync_booking_amount_paid
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_amount_paid();

REVOKE ALL ON FUNCTION public.sync_booking_amount_paid() FROM PUBLIC, anon, authenticated;

-- ── Monime payments: kind, field initiator, ledger claim ──────────────────
ALTER TABLE public.monime_payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ledger_applied_at timestamptz;

ALTER TABLE public.monime_payments DROP CONSTRAINT IF EXISTS monime_payments_kind_check;
ALTER TABLE public.monime_payments ADD CONSTRAINT monime_payments_kind_check
  CHECK (kind IN ('full', 'deposit', 'balance', 'field'));

-- Rows completed before this migration were credited by the old TS fulfillment.
UPDATE public.monime_payments
SET ledger_applied_at = COALESCE(paid_at, updated_at, now())
WHERE status = 'completed' AND ledger_applied_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_monime_payments_related_pending
  ON public.monime_payments (related_id, purpose)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_monime_payments_initiated_by
  ON public.monime_payments (initiated_by)
  WHERE initiated_by IS NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS monime_payment_id uuid REFERENCES public.monime_payments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_monime_payment_id_uidx
  ON public.payments (monime_payment_id)
  WHERE monime_payment_id IS NOT NULL;

-- Credit booking / invoice ledgers exactly once per completed Monime payment.
CREATE OR REPLACE FUNCTION public.apply_monime_ledger(p_monime_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.monime_payments;
  b public.bookings;
  inv public.invoices;
  v_total numeric;
  v_paid numeric;
  v_status text;
  v_ss uuid;
BEGIN
  UPDATE public.monime_payments
  SET ledger_applied_at = now()
  WHERE id = p_monime_payment_id
    AND status = 'completed'
    AND ledger_applied_at IS NULL
  RETURNING * INTO m;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false);
  END IF;

  IF m.purpose = 'booking' AND m.related_id IS NOT NULL THEN
    SELECT * INTO b FROM public.bookings WHERE id = m.related_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('applied', false, 'error', 'booking_not_found');
    END IF;

    INSERT INTO public.payments (
      user_id, payable_type, payable_id, amount_sle, method, status,
      reference, monime_payment_id, collector_id, confirmed_at
    ) VALUES (
      m.user_id, 'booking', b.id, m.amount_sle, 'monime', 'confirmed',
      m.reference, m.id, m.initiated_by, now()
    )
    ON CONFLICT (monime_payment_id) WHERE monime_payment_id IS NOT NULL DO NOTHING;

    v_total := public.booking_total_sle(b.details);
    v_paid := COALESCE(b.amount_paid_sle, 0) + m.amount_sle;
    v_status := CASE
      WHEN b.payment_status IN ('paid', 'verified') THEN b.payment_status
      WHEN v_total IS NULL OR v_paid >= v_total - 0.009 THEN 'paid'
      ELSE 'deposit_paid'
    END;

    UPDATE public.bookings
    SET amount_paid_sle = v_paid,
        payment_status = v_status,
        payment_method = 'monime'
    WHERE id = b.id;

    RETURN jsonb_build_object('applied', true, 'purpose', 'booking', 'amount_paid', v_paid, 'payment_status', v_status);
  END IF;

  IF m.purpose = 'invoice' AND m.related_id IS NOT NULL THEN
    SELECT * INTO inv FROM public.invoices WHERE id = m.related_id FOR UPDATE;
    IF FOUND THEN
      v_paid := COALESCE(inv.amount_paid, 0) + m.amount_sle;
      UPDATE public.invoices
      SET amount_paid = v_paid,
          status = CASE WHEN v_paid >= COALESCE(total, 0) - 0.009 THEN 'paid' ELSE status END,
          paid_at = CASE WHEN v_paid >= COALESCE(total, 0) - 0.009 THEN COALESCE(paid_at, now()) ELSE paid_at END,
          payment_method = 'monime'
      WHERE id = inv.id;

      INSERT INTO public.payments (
        user_id, payable_type, payable_id, amount_sle, method, status,
        reference, monime_payment_id, confirmed_at
      ) VALUES (
        m.user_id, 'invoice', inv.id, m.amount_sle, 'monime', 'confirmed',
        m.reference, m.id, now()
      )
      ON CONFLICT (monime_payment_id) WHERE monime_payment_id IS NOT NULL DO NOTHING;

      RETURN jsonb_build_object('applied', true, 'purpose', 'invoice', 'amount_paid', v_paid);
    END IF;

    INSERT INTO public.smart_sort_payments (
      invoice_id, user_id, amount_sle, method, reference, status, monime_payment_id
    ) VALUES (
      m.related_id, m.user_id, m.amount_sle, 'monime', m.reference, 'confirmed', m.id
    )
    ON CONFLICT (monime_payment_id) WHERE monime_payment_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_ss;

    IF v_ss IS NOT NULL THEN
      PERFORM public.increment_invoice_paid(m.related_id, m.amount_sle);
    END IF;
    RETURN jsonb_build_object('applied', true, 'purpose', 'smart_sort_invoice');
  END IF;

  RETURN jsonb_build_object('applied', true, 'purpose', m.purpose, 'ledger', 'external');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_monime_ledger(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_monime_ledger(uuid) TO service_role;

-- ── Wallet pays the remaining balance (after a deposit) ───────────────────
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
  v_total numeric;
  v_due numeric;
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
  IF v_booking.payment_status IN ('paid', 'verified') THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid', 'idempotent', true);
  END IF;
  IF v_booking.status IN ('cancelled') OR v_booking.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This booking cannot be paid.');
  END IF;

  v_total := public.booking_total_sle(v_booking.details);
  IF v_total IS NOT NULL THEN
    v_due := GREATEST(v_total - COALESCE(v_booking.amount_paid_sle, 0), 0);
    IF abs(v_due - p_amount) > 0.009 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Amount does not match the balance due.', 'due', v_due, 'requested', p_amount);
    END IF;
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

  PERFORM set_config('app.booking_payment_rpc', 'on', true);
  UPDATE bookings
  SET payment_method = 'wallet',
      payment_status = 'paid',
      amount_paid_sle = COALESCE(amount_paid_sle, 0) + p_amount
  WHERE id = p_booking_id;
  PERFORM set_config('app.booking_payment_rpc', 'off', true);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx, 'balance_after', v_balance - p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_booking_from_wallet(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_booking_from_wallet(uuid, numeric) TO authenticated;

-- ── Quote deposits ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_quote_deposit(p_booking_id uuid, p_deposit numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_total numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in.');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found.');
  END IF;

  IF NOT public.finance_can_manage_ledgers() AND NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = v_uid
      AND e.service_id = v_booking.service_id
      AND COALESCE(e.status, 'active') = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot set a deposit on this booking.');
  END IF;

  IF COALESCE(v_booking.amount_paid_sle, 0) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A payment has already been made on this booking.');
  END IF;

  IF p_deposit IS NULL OR p_deposit <= 0 THEN
    UPDATE public.bookings SET details = COALESCE(details, '{}'::jsonb) - 'deposit_sle' WHERE id = p_booking_id;
    RETURN jsonb_build_object('success', true, 'deposit', null);
  END IF;

  v_total := public.booking_total_sle(v_booking.details);
  IF v_total IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Set the price before the deposit.');
  END IF;
  IF p_deposit >= v_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'The deposit must be less than the total.');
  END IF;

  UPDATE public.bookings
  SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('deposit_sle', round(p_deposit, 2))
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'deposit', round(p_deposit, 2));
END;
$$;

REVOKE ALL ON FUNCTION public.set_quote_deposit(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_quote_deposit(uuid, numeric) TO authenticated;

-- ── Unmatched webhook inbox ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monime_webhook_unmatched (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE,
  event_name text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT 'ignored',
  session_id text,
  reference text,
  related_id text,
  amount_minor bigint,
  payload jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  matched_payment_id uuid REFERENCES public.monime_payments(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monime_webhook_unmatched_open
  ON public.monime_webhook_unmatched (created_at DESC)
  WHERE status = 'open';

ALTER TABLE public.monime_webhook_unmatched ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_select_monime_unmatched" ON public.monime_webhook_unmatched;
CREATE POLICY "finance_select_monime_unmatched" ON public.monime_webhook_unmatched
  FOR SELECT TO authenticated
  USING (public.finance_can_manage_ledgers());

DROP POLICY IF EXISTS "finance_update_monime_unmatched" ON public.monime_webhook_unmatched;
CREATE POLICY "finance_update_monime_unmatched" ON public.monime_webhook_unmatched
  FOR UPDATE TO authenticated
  USING (public.finance_can_manage_ledgers())
  WITH CHECK (public.finance_can_manage_ledgers());
