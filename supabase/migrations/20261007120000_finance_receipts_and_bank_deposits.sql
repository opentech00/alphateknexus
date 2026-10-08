/*
  Official receipts for every confirmed payment method.
  Bank deposit proofs stay on payment_verifications (client photo of the slip).
  Approving a bank slip confirms the matching payments row so a numbered receipt is issued.
*/

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('monime', 'cash', 'wallet', 'bank_transfer', 'bank', 'card'));

CREATE OR REPLACE FUNCTION public.generate_cash_receipt_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_receipt_id uuid;
  purpose_text text;
  desc_text text;
  v_invoice_number text;
  v_title text;
  v_method text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  purpose_text := CASE NEW.payable_type
    WHEN 'wallet_topup' THEN 'wallet_topup'
    WHEN 'invoice' THEN 'invoice'
    WHEN 'subscription' THEN 'subscription'
    WHEN 'booking' THEN 'booking'
    ELSE COALESCE(NULLIF(NEW.payable_type, ''), 'invoice')
  END;

  v_method := COALESCE(NULLIF(NEW.method, ''), 'cash');

  IF NEW.payable_type = 'invoice' AND NEW.payable_id IS NOT NULL THEN
    SELECT invoice_number INTO v_invoice_number FROM public.invoices WHERE id = NEW.payable_id;
  END IF;

  desc_text := CASE NEW.payable_type
    WHEN 'booking' THEN 'Payment for booking'
    WHEN 'invoice' THEN COALESCE('Payment for invoice ' || v_invoice_number, 'Payment for invoice')
    WHEN 'wallet_topup' THEN 'Wallet top-up'
    WHEN 'subscription' THEN 'Subscription payment'
    ELSE 'Payment received'
  END;

  SELECT id INTO existing_receipt_id
  FROM public.payment_receipts
  WHERE (NEW.reference IS NOT NULL AND reference = NEW.reference)
     OR (v_invoice_number IS NOT NULL AND reference = v_invoice_number)
  LIMIT 1;

  IF existing_receipt_id IS NULL THEN
    INSERT INTO public.payment_receipts (
      user_id, receipt_number, reference, amount_sle, currency,
      purpose, description, payment_method, paid_at
    ) VALUES (
      NEW.user_id,
      public.generate_receipt_number(),
      COALESCE(NEW.reference, 'pay-' || NEW.id::text),
      ROUND(NEW.amount_sle)::integer,
      'SLE',
      purpose_text,
      desc_text,
      v_method,
      COALESCE(NEW.confirmed_at, now())
    );
  END IF;

  v_title := CASE v_method
    WHEN 'cash' THEN 'Cash Payment Confirmed'
    WHEN 'bank' THEN 'Bank Deposit Confirmed'
    WHEN 'bank_transfer' THEN 'Bank Deposit Confirmed'
    ELSE 'Payment Confirmed'
  END;

  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (
    NEW.user_id,
    v_title,
    'Your payment of SLE ' || trim(to_char(NEW.amount_sle, '999,999,990.00')) ||
      ' (' || COALESCE(NEW.reference, NEW.id::text) || ') has been confirmed. A receipt is available in your transaction history.',
    CASE
      WHEN v_method = 'cash' THEN 'cash_payment_confirmed'
      ELSE 'payment_confirmed'
    END
  );

  RETURN NEW;
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
  v_now timestamptz := now();
  v_pay_count int := 0;
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
    SET status = 'verified', verified_by = auth.uid(), verified_at = v_now, updated_at = v_now
    WHERE id = p_id;

    UPDATE public.bookings
    SET payment_status = 'verified', payment_method = COALESCE(payment_method, 'bank')
    WHERE id = v_row.booking_id;

    UPDATE public.payments
    SET
      status = 'confirmed',
      confirmed_by = auth.uid(),
      confirmed_at = v_now,
      method = COALESCE(NULLIF(method, ''), 'bank')
    WHERE payable_type = 'booking'
      AND payable_id = v_row.booking_id
      AND method IN ('bank', 'bank_transfer')
      AND status IN ('pending', 'collected');
    GET DIAGNOSTICS v_pay_count = ROW_COUNT;

    IF v_pay_count = 0 THEN
      INSERT INTO public.payments (
        user_id, payable_type, payable_id, amount_sle, method, status,
        confirmed_by, confirmed_at, notes
      ) VALUES (
        v_row.user_id,
        'booking',
        v_row.booking_id,
        COALESCE(v_row.amount_sle, 0),
        'bank',
        'confirmed',
        auth.uid(),
        v_now,
        'Confirmed from client bank deposit photo'
      );
    END IF;
  ELSE
    IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Give a rejection reason.');
    END IF;
    UPDATE public.payment_verifications
    SET status = 'rejected', rejection_reason = BTRIM(p_reason), updated_at = v_now
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

-- Backfill official receipts for confirmed payments that never received one.
INSERT INTO public.payment_receipts (
  user_id, receipt_number, reference, amount_sle, currency,
  purpose, description, payment_method, paid_at
)
SELECT
  p.user_id,
  public.generate_receipt_number(),
  COALESCE(p.reference, 'pay-' || p.id::text),
  ROUND(p.amount_sle)::integer,
  'SLE',
  CASE p.payable_type
    WHEN 'wallet_topup' THEN 'wallet_topup'
    WHEN 'invoice' THEN 'invoice'
    WHEN 'subscription' THEN 'subscription'
    WHEN 'booking' THEN 'booking'
    ELSE COALESCE(NULLIF(p.payable_type, ''), 'invoice')
  END,
  COALESCE(p.notes, 'Payment received'),
  COALESCE(NULLIF(p.method, ''), 'cash'),
  COALESCE(p.confirmed_at, p.created_at, now())
FROM public.payments p
WHERE p.status = 'confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_receipts pr
    WHERE (p.reference IS NOT NULL AND pr.reference = p.reference)
       OR pr.reference = ('pay-' || p.id::text)
  );
