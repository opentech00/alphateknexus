-- Fix 1: The notify_wallet_transaction trigger function is missing RETURN NEW,
-- causing "control reached end of trigger procedure without RETURN" on every insert.
-- This silently killed ALL wallet transaction inserts (not just Monime).

CREATE OR REPLACE FUNCTION public.notify_wallet_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  type_label text;
  amount_label text;
BEGIN
  type_label := CASE NEW.type
    WHEN 'topup' THEN 'Wallet Top-Up'
    WHEN 'payment' THEN 'Payment'
    WHEN 'refund' THEN 'Refund'
    WHEN 'adjustment' THEN 'Wallet Adjustment'
    ELSE 'Transaction'
  END;
  amount_label := 'SLE ' || trim(to_char(abs(NEW.amount_sle), '999,999,990.00'));

  IF NEW.type = 'topup' THEN
    INSERT INTO notifications (user_id, title, body, type, read, service_slug)
    VALUES (NEW.user_id, 'Wallet Credited', type_label || ' of ' || amount_label || ' has been added to your wallet.', 'system', false, 'finance');
  ELSIF NEW.type = 'payment' THEN
    INSERT INTO notifications (user_id, title, body, type, read, service_slug)
    VALUES (NEW.user_id, 'Payment Processed', 'A payment of ' || amount_label || ' was deducted from your wallet.', 'system', false, 'finance');
  ELSIF NEW.type = 'refund' THEN
    INSERT INTO notifications (user_id, title, body, type, read, service_slug)
    VALUES (NEW.user_id, 'Refund Received', 'A refund of ' || amount_label || ' has been credited to your wallet.', 'system', false, 'finance');
  END IF;

  RETURN NEW;
END;
$function$;

-- Fix 2: Allow 'monime_verify' as a recorded_by value (the verify edge function uses it).
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_recorded_by_check;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_recorded_by_check
  CHECK (recorded_by IN ('client', 'admin', 'system', 'monime_webhook', 'monime_verify'));

-- Fix 3: Backfill completed wallet top-up payments that were never credited.
INSERT INTO public.wallet_transactions (user_id, type, amount_sle, method, reference, description, status, recorded_by, monime_payment_id)
SELECT
  mp.user_id,
  'topup',
  mp.amount_sle,
  'monime',
  mp.reference,
  'Top-up via Monime (backfilled)',
  'completed',
  'monime_verify',
  mp.id
FROM public.monime_payments mp
WHERE mp.purpose = 'wallet_topup'
  AND mp.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions wt
    WHERE wt.monime_payment_id = mp.id
  );