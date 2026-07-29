-- Allow 'monime_webhook' as a recorded_by value and 'monime' as a method
-- so the webhook / polling edge function can insert wallet top-up transactions.

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_recorded_by_check;
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_method_check;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_recorded_by_check
  CHECK (recorded_by IN ('client', 'admin', 'system', 'monime_webhook'));

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_method_check
  CHECK (method IN ('cash', 'bank_transfer', 'africell_money', 'orange_money', 'qmoney', 'wallet', 'admin', 'monime') OR method IS NULL);
