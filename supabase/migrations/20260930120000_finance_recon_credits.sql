-- Daily finance recon, audited wallet credits (no Monime refunds API),
-- persist last failed Monime attempt on bookings/invoices,
-- and a SQL cron so recon does not depend on the HTTP job worker URL.

-- ── 1. Audited wallet credits ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_sle numeric(12,2) NOT NULL CHECK (amount_sle > 0),
  kind text NOT NULL CHECK (kind IN ('refund', 'adjustment')),
  reason text NOT NULL,
  related_type text CHECK (related_type IS NULL OR related_type IN ('booking', 'invoice', 'monime', 'dispute', 'none')),
  related_id uuid,
  wallet_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  issued_by uuid NOT NULL REFERENCES auth.users(id),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_credits_idempotency_uidx
  ON public.finance_credits (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_credits_user_created_idx
  ON public.finance_credits (user_id, created_at DESC);

ALTER TABLE public.finance_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_credits_select" ON public.finance_credits;
CREATE POLICY "finance_credits_select" ON public.finance_credits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.finance_can_manage_ledgers());

CREATE OR REPLACE FUNCTION public.issue_wallet_credit(
  p_user_id uuid,
  p_amount numeric,
  p_kind text,
  p_reason text,
  p_related_type text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_kind text := lower(trim(COALESCE(p_kind, '')));
  v_reason text := trim(COALESCE(p_reason, ''));
  v_key text := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
  v_related text := NULLIF(lower(trim(COALESCE(p_related_type, ''))), '');
  v_existing public.finance_credits;
  v_tx uuid;
  v_credit uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.finance_can_manage_ledgers() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only finance staff can issue wallet credits.');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client is required.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a positive amount.');
  END IF;
  IF v_kind NOT IN ('refund', 'adjustment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kind must be refund or adjustment.');
  END IF;
  IF length(v_reason) < 12 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Write a reason of at least 12 characters.');
  END IF;
  IF v_related IS NOT NULL AND v_related NOT IN ('booking', 'invoice', 'monime', 'dispute', 'none') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid related type.');
  END IF;
  IF v_related = 'none' THEN
    v_related := NULL;
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.finance_credits WHERE idempotency_key = v_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true, 'idempotent', true,
        'credit_id', v_existing.id,
        'wallet_transaction_id', v_existing.wallet_transaction_id
      );
    END IF;
  END IF;

  INSERT INTO public.wallet_transactions (
    user_id, type, amount_sle, description, method, reference, status, recorded_by
  ) VALUES (
    p_user_id,
    v_kind,
    round(p_amount, 2),
    v_reason,
    'other',
    COALESCE(v_key, 'CR-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    'completed',
    v_actor::text
  )
  RETURNING id INTO v_tx;

  INSERT INTO public.finance_credits (
    user_id, amount_sle, kind, reason, related_type, related_id,
    wallet_transaction_id, issued_by, idempotency_key
  ) VALUES (
    p_user_id, round(p_amount, 2), v_kind, v_reason, v_related, p_related_id,
    v_tx, v_actor, v_key
  )
  RETURNING id INTO v_credit;

  RETURN jsonb_build_object(
    'success', true,
    'credit_id', v_credit,
    'wallet_transaction_id', v_tx,
    'amount_sle', round(p_amount, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_wallet_credit(uuid, numeric, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_wallet_credit(uuid, numeric, text, text, text, uuid, text) TO authenticated;

-- ── 2. Daily recon snapshots ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_recon_days (
  day date PRIMARY KEY,
  monime_settled_sle numeric(14,2) NOT NULL DEFAULT 0,
  monime_settled_count int NOT NULL DEFAULT 0,
  monime_attempted_sle numeric(14,2) NOT NULL DEFAULT 0,
  monime_failed_count int NOT NULL DEFAULT 0,
  monime_cancelled_count int NOT NULL DEFAULT 0,
  monime_pending_count int NOT NULL DEFAULT 0,
  wallet_monime_sle numeric(14,2) NOT NULL DEFAULT 0,
  invoice_monime_sle numeric(14,2) NOT NULL DEFAULT 0,
  booking_monime_sle numeric(14,2) NOT NULL DEFAULT 0,
  wallet_credits_sle numeric(14,2) NOT NULL DEFAULT 0,
  wallet_debits_sle numeric(14,2) NOT NULL DEFAULT 0,
  unmatched_open_count int NOT NULL DEFAULT 0,
  unmatched_created_count int NOT NULL DEFAULT 0,
  payouts_completed_sle numeric(14,2) NOT NULL DEFAULT 0,
  payouts_failed_count int NOT NULL DEFAULT 0,
  ledger_gap_sle numeric(14,2) NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text NOT NULL DEFAULT 'system'
);

ALTER TABLE public.finance_recon_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_recon_select" ON public.finance_recon_days;
CREATE POLICY "finance_recon_select" ON public.finance_recon_days
  FOR SELECT TO authenticated
  USING (public.finance_can_manage_ledgers());

CREATE OR REPLACE FUNCTION public.run_finance_recon(p_day date DEFAULT (CURRENT_DATE - 1))
RETURNS public.finance_recon_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := COALESCE(p_day, CURRENT_DATE - 1);
  v_start timestamptz := v_day::timestamp AT TIME ZONE 'UTC';
  v_end timestamptz := v_start + interval '1 day';
  v_row public.finance_recon_days;
  v_who text := COALESCE(auth.uid()::text, 'cron');
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.finance_can_manage_ledgers() THEN
    RAISE EXCEPTION 'Only finance staff can run reconciliation.';
  END IF;

  INSERT INTO public.finance_recon_days AS r (
    day,
    monime_settled_sle, monime_settled_count,
    monime_attempted_sle, monime_failed_count, monime_cancelled_count, monime_pending_count,
    wallet_monime_sle, invoice_monime_sle, booking_monime_sle,
    wallet_credits_sle, wallet_debits_sle,
    unmatched_open_count, unmatched_created_count,
    payouts_completed_sle, payouts_failed_count,
    ledger_gap_sle, generated_at, generated_by
  )
  SELECT
    v_day,
    COALESCE((
      SELECT sum(amount_sle) FROM public.monime_payments
      WHERE status = 'completed'
        AND COALESCE(paid_at, ledger_applied_at, created_at) >= v_start
        AND COALESCE(paid_at, ledger_applied_at, created_at) < v_end
    ), 0),
    COALESCE((
      SELECT count(*) FROM public.monime_payments
      WHERE status = 'completed'
        AND COALESCE(paid_at, ledger_applied_at, created_at) >= v_start
        AND COALESCE(paid_at, ledger_applied_at, created_at) < v_end
    ), 0)::int,
    COALESCE((
      SELECT sum(amount_sle) FROM public.monime_payments
      WHERE created_at >= v_start AND created_at < v_end
    ), 0),
    COALESCE((
      SELECT count(*) FROM public.monime_payments
      WHERE status = 'failed' AND created_at >= v_start AND created_at < v_end
    ), 0)::int,
    COALESCE((
      SELECT count(*) FROM public.monime_payments
      WHERE status = 'cancelled' AND created_at >= v_start AND created_at < v_end
    ), 0)::int,
    COALESCE((
      SELECT count(*) FROM public.monime_payments
      WHERE status = 'pending' AND created_at >= v_start AND created_at < v_end
    ), 0)::int,
    COALESCE((
      SELECT sum(amount_sle) FROM public.monime_payments
      WHERE purpose = 'wallet_topup' AND status = 'completed'
        AND COALESCE(paid_at, ledger_applied_at, created_at) >= v_start
        AND COALESCE(paid_at, ledger_applied_at, created_at) < v_end
    ), 0),
    COALESCE((
      SELECT sum(amount_sle) FROM public.monime_payments
      WHERE purpose = 'invoice' AND status = 'completed'
        AND COALESCE(paid_at, ledger_applied_at, created_at) >= v_start
        AND COALESCE(paid_at, ledger_applied_at, created_at) < v_end
    ), 0),
    COALESCE((
      SELECT sum(amount_sle) FROM public.monime_payments
      WHERE purpose = 'booking' AND status = 'completed'
        AND COALESCE(paid_at, ledger_applied_at, created_at) >= v_start
        AND COALESCE(paid_at, ledger_applied_at, created_at) < v_end
    ), 0),
    COALESCE((
      SELECT sum(amount_sle) FROM public.wallet_transactions
      WHERE status = 'completed' AND amount_sle > 0
        AND created_at >= v_start AND created_at < v_end
    ), 0),
    COALESCE((
      SELECT sum(abs(amount_sle)) FROM public.wallet_transactions
      WHERE status = 'completed' AND amount_sle < 0
        AND created_at >= v_start AND created_at < v_end
    ), 0),
    COALESCE((SELECT count(*) FROM public.monime_webhook_unmatched WHERE status = 'open'), 0)::int,
    COALESCE((
      SELECT count(*) FROM public.monime_webhook_unmatched
      WHERE created_at >= v_start AND created_at < v_end
    ), 0)::int,
    COALESCE((
      SELECT sum(amount_sle) FROM public.withdrawal_requests
      WHERE payout_status = 'completed'
        AND COALESCE(completed_at, reviewed_at, created_at) >= v_start
        AND COALESCE(completed_at, reviewed_at, created_at) < v_end
    ), 0),
    COALESCE((
      SELECT count(*) FROM public.withdrawal_requests
      WHERE payout_status = 'failed'
        AND COALESCE(reviewed_at, created_at) >= v_start
        AND COALESCE(reviewed_at, created_at) < v_end
    ), 0)::int,
    0,
    now(),
    v_who
  ON CONFLICT (day) DO UPDATE SET
    monime_settled_sle = EXCLUDED.monime_settled_sle,
    monime_settled_count = EXCLUDED.monime_settled_count,
    monime_attempted_sle = EXCLUDED.monime_attempted_sle,
    monime_failed_count = EXCLUDED.monime_failed_count,
    monime_cancelled_count = EXCLUDED.monime_cancelled_count,
    monime_pending_count = EXCLUDED.monime_pending_count,
    wallet_monime_sle = EXCLUDED.wallet_monime_sle,
    invoice_monime_sle = EXCLUDED.invoice_monime_sle,
    booking_monime_sle = EXCLUDED.booking_monime_sle,
    wallet_credits_sle = EXCLUDED.wallet_credits_sle,
    wallet_debits_sle = EXCLUDED.wallet_debits_sle,
    unmatched_open_count = EXCLUDED.unmatched_open_count,
    unmatched_created_count = EXCLUDED.unmatched_created_count,
    payouts_completed_sle = EXCLUDED.payouts_completed_sle,
    payouts_failed_count = EXCLUDED.payouts_failed_count,
    generated_at = now(),
    generated_by = EXCLUDED.generated_by
  RETURNING * INTO v_row;

  UPDATE public.finance_recon_days
  SET ledger_gap_sle = round(
    monime_settled_sle - (wallet_monime_sle + invoice_monime_sle + booking_monime_sle),
    2
  )
  WHERE day = v_day
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.run_finance_recon(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_finance_recon(date) TO authenticated, service_role;

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'finance_recon_daily';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
  PERFORM cron.schedule(
    'finance_recon_daily',
    '25 0 * * *',
    $cron$SELECT public.run_finance_recon((CURRENT_DATE - 1));$cron$
  );
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;

-- ── 3. Persist last failed attempt on the related booking/invoice ─────────

CREATE OR REPLACE FUNCTION public.trg_persist_monime_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('failed', 'cancelled') THEN
    RETURN NEW;
  END IF;
  v_payload := jsonb_build_object(
    'code', NEW.failure_code,
    'reason', NEW.failure_reason,
    'status', NEW.status,
    'reference', NEW.reference,
    'amount_sle', NEW.amount_sle,
    'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  IF NEW.purpose = 'booking' AND NEW.related_id IS NOT NULL THEN
    UPDATE public.bookings
    SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('last_payment_failure', v_payload)
    WHERE id = NEW.related_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS monime_payments_persist_failure ON public.monime_payments;
CREATE TRIGGER monime_payments_persist_failure
  AFTER INSERT OR UPDATE OF status, failure_code, failure_reason
  ON public.monime_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_persist_monime_failure();
