/*
  Store why a Monime checkout failed so the client can show Retry / Cancel
  with a specific reason (insufficient funds, declined, expired, cancelled).
*/

ALTER TABLE public.monime_payments
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS failure_reason text;

ALTER TABLE public.monime_payments DROP CONSTRAINT IF EXISTS monime_payments_failure_code_check;
ALTER TABLE public.monime_payments ADD CONSTRAINT monime_payments_failure_code_check
  CHECK (failure_code IS NULL OR failure_code IN (
    'insufficient_funds', 'declined', 'expired', 'cancelled', 'timeout', 'unknown'
  ));

CREATE INDEX IF NOT EXISTS idx_monime_payments_user_failed
  ON public.monime_payments (user_id, created_at DESC)
  WHERE status IN ('failed', 'cancelled');
