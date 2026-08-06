/*
# Receipts for all wallet transaction types

## 1. Receipts for all transaction types
Currently receipts are only created for Monime wallet top-ups (in the monime-webhook edge function).
This migration extends receipt creation to ALL completed wallet transactions: withdrawals, payments,
refunds, and adjustments.

### Changes:
- Add `wallet_transaction_id` column to `payment_receipts` for linking and idempotency
- Add unique partial index on `wallet_transaction_id` for dedup
- Rewrite `notify_wallet_transaction()` to create a receipt row for completed transactions
- Idempotent: checks for existing receipt by wallet_transaction_id or reference
- For Monime top-ups, the webhook already creates a receipt with the same reference -> skip

## 2. Security
- No new tables, no RLS changes (trigger is SECURITY DEFINER, existing policies apply)
- `wallet_transaction_id` has a unique partial index for idempotency
*/

-- Add wallet_transaction_id column to link receipts to wallet transactions
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL;

-- Unique partial index for idempotency: one receipt per wallet transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_wtx
  ON payment_receipts(wallet_transaction_id)
  WHERE wallet_transaction_id IS NOT NULL;

-- Rewrite notify_wallet_transaction to also create a receipt for completed transactions
CREATE OR REPLACE FUNCTION notify_wallet_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type_label text;
  v_amount_label text;
  v_title text;
  v_body text;
  v_event_type text;
  v_purpose text;
  v_receipt_num text;
  v_reference text;
  v_existing_id uuid;
BEGIN
  v_amount_label := 'SLE ' || trim(to_char(abs(NEW.amount_sle), '999,999,990.00'));

  IF NEW.type = 'topup' THEN
    v_type_label := 'Wallet Top-Up';
    v_title := 'Wallet Credited';
    v_body := v_type_label || ' of ' || v_amount_label || ' has been added to your wallet.';
    v_event_type := 'wallet_topup';
    v_purpose := 'wallet_topup';
  ELSIF NEW.type = 'payment' THEN
    v_type_label := 'Payment';
    v_title := 'Payment Processed';
    v_body := 'A payment of ' || v_amount_label || ' was deducted from your wallet.';
    v_event_type := 'wallet_payment';
    v_purpose := 'wallet_payment';
  ELSIF NEW.type = 'refund' THEN
    v_type_label := 'Refund';
    v_title := 'Refund Received';
    v_body := 'A refund of ' || v_amount_label || ' has been credited to your wallet.';
    v_event_type := 'wallet_refund';
    v_purpose := 'wallet_refund';
  ELSIF NEW.type = 'adjustment' THEN
    v_type_label := 'Wallet Adjustment';
    v_title := 'Wallet Adjusted';
    v_body := 'An adjustment of ' || v_amount_label || ' was applied to your wallet.';
    v_event_type := 'wallet_adjustment';
    v_purpose := 'wallet_adjustment';
  ELSE
    RETURN NEW;
  END IF;

  -- Enqueue notification (in-app + email + push via outbox cron)
  PERFORM enqueue_notification(
    NEW.user_id, 'client', v_event_type, v_title, v_body, 'payments',
    jsonb_build_object(
      'service_slug', 'finance',
      'channel_id', 'transactions',
      'click_action', 'OPEN_WALLET',
      'link', '/?page=wallet',
      'amount_sle', NEW.amount_sle,
      'tx_type', NEW.type
    )
  );

  -- Create receipt for completed transactions (idempotent)
  IF NEW.status = 'completed' THEN
    SELECT id INTO v_existing_id FROM payment_receipts
    WHERE wallet_transaction_id = NEW.id LIMIT 1;

    IF v_existing_id IS NULL AND NEW.reference IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM payment_receipts
      WHERE reference = NEW.reference LIMIT 1;
    END IF;

    IF v_existing_id IS NULL THEN
      v_receipt_num := generate_receipt_number();
      IF v_receipt_num IS NOT NULL THEN
        v_reference := COALESCE(NEW.reference, 'wt-' || NEW.id::text);

        INSERT INTO payment_receipts (
          user_id, wallet_transaction_id, receipt_number, reference,
          amount_sle, currency, purpose, description,
          payment_method, payment_id, paid_at
        ) VALUES (
          NEW.user_id, NEW.id, v_receipt_num, v_reference,
          ROUND(abs(NEW.amount_sle))::int, 'SLE', v_purpose,
          NEW.description, COALESCE(NEW.method, 'system'),
          NEW.reference, NEW.created_at
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
