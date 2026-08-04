/*
  # Security hardening: wallet ledger and booking payment state

  1. Wallet top-ups (F1)
     - Drop `insert_own_wallet_topup`: it allowed any signed-in user to insert a
       `completed` top-up of any amount for themselves. All legitimate top-ups are
       created server-side (monime webhook / verify function / admin), which bypass RLS.

  2. Wallet deletions (F2)
     - Drop the two unrestricted DELETE policies. `client_delete_own_pending_wallet`
       already covers the legitimate case (own pending/failed rows).

  3. Wallet payments (F3)
     - Drop `insert_own_wallet_payment` (no server-side balance check) and add
       `pay_booking_from_wallet()` which verifies ownership, recomputes the balance,
       writes the debit, the confirmed payment and the booking state atomically.

  4. Booking payment state (F4)
     - Add `guard_booking_payment_status()` so a customer cannot mark their own
       booking paid unless an authoritative payment record exists.

  5. Client payment rows (F5)
     - `insert_own_payments` now requires `status = 'pending'`.

  6. Cash collector (F21)
     - `collector_update_payments` WITH CHECK is now as strict as its USING clause.
*/

-- F1
DROP POLICY IF EXISTS "insert_own_wallet_topup" ON public.wallet_transactions;

-- F2
DROP POLICY IF EXISTS "delete_own_wallet" ON public.wallet_transactions;
DROP POLICY IF EXISTS "delete_own_wallet_transactions" ON public.wallet_transactions;

-- F3
DROP POLICY IF EXISTS "insert_own_wallet_payment" ON public.wallet_transactions;

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
  v_tx uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in to pay.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount.');
  END IF;

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

  SELECT COALESCE(SUM(amount_sle), 0) INTO v_balance
  FROM wallet_transactions
  WHERE user_id = v_uid AND status = 'completed';

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance.', 'balance', v_balance, 'requested', p_amount);
  END IF;

  INSERT INTO wallet_transactions (user_id, type, amount_sle, description, method, reference, status, recorded_by)
  VALUES (v_uid, 'payment', -p_amount, 'Wallet payment for booking', 'wallet', p_booking_id::text, 'completed', 'client')
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

-- F4
CREATE OR REPLACE FUNCTION public.guard_booking_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status IN ('paid', 'refunded', 'confirmed', 'completed', 'verified') THEN

    -- service role / internal (no end-user session) and admins are trusted
    IF auth.uid() IS NULL OR public.is_admin() THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
         SELECT 1 FROM wallet_transactions w
         WHERE w.reference = NEW.id::text
           AND w.user_id = NEW.user_id
           AND w.type = 'payment'
           AND w.status = 'completed'
       )
       OR EXISTS (
         SELECT 1 FROM monime_payments m
         WHERE m.related_id = NEW.id AND m.status = 'completed'
       )
       OR EXISTS (
         SELECT 1 FROM payments p
         WHERE p.payable_id = NEW.id
           AND p.status IN ('confirmed', 'completed')
       )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Permission denied: a booking can only be marked paid once its payment is confirmed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_payment_status ON public.bookings;
CREATE TRIGGER trg_guard_booking_payment_status
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_payment_status();

REVOKE UPDATE (reviewed_by, reviewed_at, user_id, service_id) ON public.bookings FROM authenticated;
REVOKE UPDATE ON public.bookings FROM anon;
REVOKE INSERT, DELETE ON public.bookings FROM anon;

-- F5
DROP POLICY IF EXISTS "insert_own_payments" ON public.payments;
CREATE POLICY "insert_own_payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- F21
DROP POLICY IF EXISTS "collector_update_payments" ON public.payments;
CREATE POLICY "collector_update_payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (auth.uid() = collector_id AND status = 'pending')
  WITH CHECK (auth.uid() = collector_id AND status = 'collected');
