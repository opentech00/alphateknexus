/*
# Cash payment confirmation: auto-generate receipt + notify client

## Overview
When an admin confirms a cash payment (status -> confirmed), a database
trigger automatically:
1. Inserts a row into payment_receipts so the client sees a numbered receipt.
2. Inserts a notification so the client is informed their cash payment was
   confirmed.

This keeps the audit trail complete without relying on the frontend to
remember to create the receipt/notification.

## 1. New Functions
### `generate_cash_receipt_on_confirm()`
AFTER UPDATE trigger on `payments`. Fires only when status transitions
to 'confirmed' AND method = 'cash'. Inserts into payment_receipts using
the existing generate_receipt_number() function, and inserts a
notification row for the client.

## 2. Security
- The trigger function is SECURITY DEFINER so it can insert into
  payment_receipts and notifications regardless of the caller's RLS.
- Idempotent: checks whether a receipt already exists for this payment
  reference before inserting, so re-runs are safe.

## 3. Important Notes
1. Receipts for cash payments use payment_method = 'cash' and the
   payment's reference (CSH-YYYY-NNNN) as the receipt reference.
2. The notification type is 'cash_payment_confirmed' so the client app
   can render a cash-specific message if desired.
3. The trigger only fires on cash payments; Monime payments continue to
   create receipts via their existing edge-function flow.
*/

CREATE OR REPLACE FUNCTION generate_cash_receipt_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_receipt_id uuid;
  purpose_text text;
  desc_text text;
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) AND (NEW.status = 'confirmed') AND (NEW.method = 'cash') THEN
    -- Determine purpose + description from payable_type
    purpose_text := CASE NEW.payable_type
      WHEN 'wallet_topup' THEN 'wallet_topup'
      WHEN 'invoice' THEN 'invoice'
      WHEN 'subscription' THEN 'subscription'
      ELSE 'invoice'
    END;
    desc_text := CASE NEW.payable_type
      WHEN 'booking' THEN 'Cash payment for booking'
      WHEN 'invoice' THEN 'Cash payment for invoice'
      WHEN 'wallet_topup' THEN 'Cash wallet top-up'
      WHEN 'subscription' THEN 'Cash subscription payment'
      ELSE 'Cash payment'
    END;

    -- Idempotency: skip if a receipt already exists for this reference
    SELECT id INTO existing_receipt_id FROM payment_receipts WHERE reference = NEW.reference LIMIT 1;
    IF existing_receipt_id IS NULL THEN
      INSERT INTO payment_receipts (
        user_id, receipt_number, reference, amount_sle, currency,
        purpose, description, payment_method, paid_at
      ) VALUES (
        NEW.user_id,
        generate_receipt_number(),
        NEW.reference,
        NEW.amount_sle,
        'SLE',
        purpose_text,
        desc_text,
        'cash',
        COALESCE(NEW.confirmed_at, now())
      );
    END IF;

    -- Notify the client
    INSERT INTO notifications (user_id, title, body, type)
    VALUES (
      NEW.user_id,
      'Cash Payment Confirmed',
      'Your cash payment of SLE ' || NEW.amount_sle || ' (' || NEW.reference || ') has been confirmed. A receipt is available in your transaction history.',
      'cash_payment_confirmed'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_cash_receipt_on_confirm ON payments;
CREATE TRIGGER payments_cash_receipt_on_confirm AFTER UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION generate_cash_receipt_on_confirm();
