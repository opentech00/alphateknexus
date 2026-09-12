-- Smart Sort wallet auto-pay + low-balance / auto-topup notifications.
-- Monime cannot charge silently; auto-topup notifies the client to complete checkout.

ALTER TABLE public.smart_sort_payments DROP CONSTRAINT IF EXISTS smart_sort_payments_method_check;
ALTER TABLE public.smart_sort_payments ADD CONSTRAINT smart_sort_payments_method_check
  CHECK (method IN ('cash','bank_transfer','africell_money','orange_money','qmoney','monime','wallet','other'));

ALTER TABLE public.smart_sort_invoices
  ADD COLUMN IF NOT EXISTS auto_pay_attempted_at timestamptz;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS low_balance_alerted_at timestamptz;

-- Mark Smart Sort invoices paid/partial when amount_paid_sle is incremented
CREATE OR REPLACE FUNCTION public.increment_invoice_paid(p_invoice_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.smart_sort_invoices
  SET amount_paid_sle = COALESCE(amount_paid_sle, 0) + p_amount,
      updated_at = now(),
      status = CASE
        WHEN status = 'void' THEN status
        WHEN COALESCE(amount_paid_sle, 0) + p_amount >= amount_sle THEN 'paid'
        WHEN COALESCE(amount_paid_sle, 0) + p_amount > 0 THEN 'partial'
        ELSE status
      END,
      paid_at = CASE
        WHEN status <> 'void' AND COALESCE(amount_paid_sle, 0) + p_amount >= amount_sle
          THEN COALESCE(paid_at, now())
        ELSE paid_at
      END
  WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_invoice_paid(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_invoice_paid(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_feature_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT wallet_enabled FROM public.app_settings WHERE id = 1), true);
$$;

-- Shared Smart Sort wallet debit (no auth.uid() check — callers authorize)
CREATE OR REPLACE FUNCTION public.debit_wallet_for_smart_sort_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.smart_sort_invoices%ROWTYPE;
  v_due numeric;
  v_balance numeric;
  v_tx uuid;
  v_existing uuid;
BEGIN
  IF NOT public.wallet_feature_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet is disabled.');
  END IF;

  SELECT * INTO v_inv FROM public.smart_sort_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
  END IF;
  IF v_inv.status IN ('paid', 'void') THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid', 'idempotent', true);
  END IF;

  v_due := COALESCE(v_inv.amount_sle, 0) - COALESCE(v_inv.amount_paid_sle, 0);
  IF v_due <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nothing due on this invoice.');
  END IF;

  SELECT id INTO v_existing
  FROM public.wallet_transactions
  WHERE user_id = v_inv.user_id
    AND type = 'payment'
    AND status = 'completed'
    AND reference = p_invoice_id::text
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE public.smart_sort_invoices
    SET status = CASE WHEN COALESCE(amount_paid_sle, 0) >= amount_sle THEN 'paid' ELSE status END,
        paid_at = CASE WHEN COALESCE(amount_paid_sle, 0) >= amount_sle THEN COALESCE(paid_at, now()) ELSE paid_at END,
        updated_at = now()
    WHERE id = p_invoice_id;
    RETURN jsonb_build_object('success', true, 'message', 'Already paid', 'idempotent', true, 'transaction_id', v_existing);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || v_inv.user_id::text));

  v_balance := public.wallet_available_balance(v_inv.user_id);
  IF v_balance < v_due THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient wallet balance.',
      'balance', v_balance,
      'requested', v_due
    );
  END IF;

  INSERT INTO public.wallet_transactions (user_id, type, amount_sle, description, method, reference, status, recorded_by)
  VALUES (
    v_inv.user_id, 'payment', -v_due,
    'Wallet payment for Smart Sort invoice ' || v_inv.invoice_number,
    'wallet', p_invoice_id::text, 'completed', 'system'
  )
  RETURNING id INTO v_tx;

  INSERT INTO public.payments (user_id, payable_type, payable_id, amount_sle, method, status)
  VALUES (v_inv.user_id, 'invoice', p_invoice_id, v_due, 'wallet', 'confirmed');

  INSERT INTO public.smart_sort_payments (invoice_id, user_id, amount_sle, method, reference, status)
  VALUES (p_invoice_id, v_inv.user_id, round(v_due)::integer, 'wallet', v_tx::text, 'confirmed');

  PERFORM public.increment_invoice_paid(p_invoice_id, round(v_due)::integer);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx, 'amount', v_due);
END;
$$;

REVOKE ALL ON FUNCTION public.debit_wallet_for_smart_sort_invoice(uuid) FROM PUBLIC, anon, authenticated;

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

  IF p_source = 'smart_sort' THEN
    SELECT user_id INTO v_user FROM public.smart_sort_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
    END IF;
    IF v_user IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
      RETURN jsonb_build_object('success', false, 'error', 'This invoice does not belong to you.');
    END IF;
    RETURN public.debit_wallet_for_smart_sort_invoice(p_invoice_id);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || v_uid::text));

  SELECT user_id, status, (total - amount_paid) INTO v_user, v_status, v_due
  FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
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
  IF v_due IS NULL OR v_due <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nothing due on this invoice.');
  END IF;

  SELECT COALESCE(SUM(amount_sle), 0) INTO v_balance
  FROM public.wallet_transactions
  WHERE user_id = v_user AND status = 'completed';

  IF v_balance < v_due THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance.', 'balance', v_balance, 'requested', v_due);
  END IF;

  INSERT INTO public.wallet_transactions (user_id, type, amount_sle, description, method, reference, status, recorded_by)
  VALUES (v_user, 'payment', -v_due, 'Wallet payment for invoice', 'wallet', p_invoice_id::text, 'completed', 'client')
  RETURNING id INTO v_tx;

  INSERT INTO public.payments (user_id, payable_type, payable_id, amount_sle, method, status)
  VALUES (v_user, 'invoice', p_invoice_id, v_due, 'wallet', 'confirmed');

  UPDATE public.invoices
  SET amount_paid = total, status = 'paid', paid_at = now(), payment_method = 'wallet'
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx, 'amount', v_due);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_invoice_from_wallet(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_invoice_from_wallet(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.auto_pay_smart_sort_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.smart_sort_invoices%ROWTYPE;
  v_sub public.smart_sort_subscriptions%ROWTYPE;
  v_result jsonb;
  v_due numeric;
  v_balance numeric;
  v_should_notify boolean := false;
BEGIN
  IF NOT public.wallet_feature_enabled() THEN
    RETURN jsonb_build_object('success', false, 'skipped', true, 'error', 'Wallet is disabled.');
  END IF;

  SELECT * INTO v_inv FROM public.smart_sort_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
  END IF;

  SELECT * INTO v_sub FROM public.smart_sort_subscriptions WHERE id = v_inv.subscription_id;
  IF NOT FOUND OR NOT v_sub.auto_pay OR v_sub.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('success', false, 'skipped', true, 'error', 'Auto-pay is off for this subscription.');
  END IF;
  IF v_sub.paused_until IS NOT NULL AND v_sub.paused_until >= CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'skipped', true, 'error', 'Subscription is paused.');
  END IF;

  v_should_notify := (
    v_inv.auto_pay_attempted_at IS NULL
    OR v_inv.auto_pay_attempted_at < now() - interval '20 hours'
  );

  UPDATE public.smart_sort_invoices
  SET auto_pay_attempted_at = now()
  WHERE id = p_invoice_id;

  v_result := public.debit_wallet_for_smart_sort_invoice(p_invoice_id);

  IF COALESCE((v_result->>'success')::boolean, false) THEN
    IF COALESCE((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
      PERFORM public.enqueue_notification(
        v_inv.user_id,
        'client',
        'smart_sort_auto_pay',
        'Smart Sort invoice paid',
        'Invoice ' || v_inv.invoice_number || ' was paid from your wallet.',
        'payments',
        jsonb_build_object(
          'service_slug', 'smart-sort',
          'click_action', 'OPEN_WALLET',
          'link', '/?page=subscriptions',
          'invoice_id', p_invoice_id,
          'amount_sle', v_result->'amount'
        )
      );
    END IF;
    RETURN v_result;
  END IF;

  IF v_should_notify AND (v_result->>'error') = 'Insufficient wallet balance.' THEN
    v_due := COALESCE((v_result->>'requested')::numeric, 0);
    v_balance := COALESCE((v_result->>'balance')::numeric, 0);
    PERFORM public.enqueue_notification(
      v_inv.user_id,
      'client',
      'wallet_low_balance',
      'Smart Sort auto-pay needs a top-up',
      'Invoice ' || v_inv.invoice_number || ' needs SLE ' || trim(to_char(v_due, '999,999,990.00'))
        || ' but your available wallet balance is SLE ' || trim(to_char(v_balance, '999,999,990.00'))
        || '. Top up to pay automatically.',
      'payments',
      jsonb_build_object(
        'service_slug', 'finance',
        'click_action', 'OPEN_WALLET',
        'link', '/?page=wallet',
        'invoice_id', p_invoice_id,
        'requested', v_due,
        'balance', v_balance
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_pay_smart_sort_invoice(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_pay_smart_sort_invoice(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.process_smart_sort_auto_pay()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  IF NOT public.wallet_feature_enabled() THEN
    RETURN 0;
  END IF;

  FOR v_id IN
    SELECT i.id
    FROM public.smart_sort_invoices i
    JOIN public.smart_sort_subscriptions s ON s.id = i.subscription_id
    WHERE i.status IN ('pending', 'partial', 'overdue')
      AND i.amount_sle > COALESCE(i.amount_paid_sle, 0)
      AND s.auto_pay
      AND s.status = 'active'
      AND (s.paused_until IS NULL OR s.paused_until < CURRENT_DATE)
      AND (i.auto_pay_attempted_at IS NULL OR i.auto_pay_attempted_at < now() - interval '12 hours')
    ORDER BY i.due_date ASC
    LIMIT 200
  LOOP
    PERFORM public.auto_pay_smart_sort_invoice(v_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.process_smart_sort_auto_pay() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_smart_sort_auto_pay() TO service_role;

CREATE OR REPLACE FUNCTION public.process_smart_sort_auto_pay_for_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_paid integer := 0;
  v_failed integer := 0;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in.');
  END IF;
  IF NOT public.wallet_feature_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet is disabled.');
  END IF;

  FOR v_id IN
    SELECT i.id
    FROM public.smart_sort_invoices i
    JOIN public.smart_sort_subscriptions s ON s.id = i.subscription_id
    WHERE i.user_id = v_uid
      AND i.status IN ('pending', 'partial', 'overdue')
      AND i.amount_sle > COALESCE(i.amount_paid_sle, 0)
      AND s.auto_pay
      AND s.status = 'active'
    ORDER BY i.due_date ASC
    LIMIT 50
  LOOP
    v_result := public.auto_pay_smart_sort_invoice(v_id);
    IF COALESCE((v_result->>'success')::boolean, false) THEN
      v_paid := v_paid + 1;
    ELSE
      v_failed := v_failed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'paid', v_paid, 'failed', v_failed);
END;
$$;

REVOKE ALL ON FUNCTION public.process_smart_sort_auto_pay_for_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_smart_sort_auto_pay_for_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_smart_sort_invoice_auto_pay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('pending', 'partial', 'overdue') THEN
    BEGIN
      PERFORM public.auto_pay_smart_sort_invoice(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'smart_sort auto-pay failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_smart_sort_invoice_auto_pay ON public.smart_sort_invoices;
CREATE TRIGGER trg_smart_sort_invoice_auto_pay
  AFTER INSERT ON public.smart_sort_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_smart_sort_invoice_auto_pay();

-- Low-balance + auto-topup prompt (notification only; Monime still needs the client)
CREATE OR REPLACE FUNCTION public.maybe_notify_low_wallet_balance(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold numeric;
  v_auto boolean;
  v_amount numeric;
  v_available numeric;
  v_alerted timestamptz;
  v_title text;
  v_body text;
BEGIN
  IF p_user_id IS NULL OR NOT public.wallet_feature_enabled() THEN
    RETURN;
  END IF;

  SELECT low_balance_threshold, auto_topup_enabled, auto_topup_amount, low_balance_alerted_at
  INTO v_threshold, v_auto, v_amount, v_alerted
  FROM public.user_preferences
  WHERE user_id = p_user_id;

  IF NOT FOUND OR v_threshold IS NULL OR v_threshold <= 0 THEN
    RETURN;
  END IF;

  v_available := public.wallet_available_balance(p_user_id);

  IF v_available >= v_threshold THEN
    IF v_alerted IS NOT NULL THEN
      UPDATE public.user_preferences
      SET low_balance_alerted_at = NULL
      WHERE user_id = p_user_id;
    END IF;
    RETURN;
  END IF;

  IF v_alerted IS NOT NULL AND v_alerted > now() - interval '24 hours' THEN
    RETURN;
  END IF;

  v_amount := GREATEST(5, LEAST(10000, COALESCE(NULLIF(v_amount, 0), 200)));

  IF COALESCE(v_auto, false) THEN
    v_title := 'Complete your auto top-up';
    v_body := 'Your wallet is below SLE ' || trim(to_char(v_threshold, '999,999,990.00'))
      || '. Open Wallet and confirm a Monime top-up of SLE ' || trim(to_char(v_amount, '999,999,990.00'))
      || ' — mobile money still needs your approval.';
  ELSE
    v_title := 'Wallet balance is low';
    v_body := 'Your available balance is SLE ' || trim(to_char(v_available, '999,999,990.00'))
      || ', below your alert of SLE ' || trim(to_char(v_threshold, '999,999,990.00'))
      || '. Top up so Smart Sort auto-pay can keep working.';
  END IF;

  PERFORM public.enqueue_notification(
    p_user_id,
    'client',
    'wallet_low_balance',
    v_title,
    v_body,
    'payments',
    jsonb_build_object(
      'service_slug', 'finance',
      'click_action', 'OPEN_WALLET',
      'link', '/?page=wallet',
      'auto_topup', COALESCE(v_auto, false),
      'auto_topup_amount', v_amount,
      'threshold', v_threshold,
      'balance', v_available
    )
  );

  UPDATE public.user_preferences
  SET low_balance_alerted_at = now()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.maybe_notify_low_wallet_balance(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_wallet_low_balance_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    PERFORM public.maybe_notify_low_wallet_balance(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_low_balance_alert ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_low_balance_alert
  AFTER INSERT OR UPDATE OF status, amount_sle
  ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_wallet_low_balance_alert();

DO $$
DECLARE
  job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'process_smart_sort_auto_pay';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
  PERFORM cron.schedule(
    'process_smart_sort_auto_pay',
    '20 * * * *',
    $cron$SELECT public.process_smart_sort_auto_pay();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule process_smart_sort_auto_pay: %', SQLERRM;
END $$;
