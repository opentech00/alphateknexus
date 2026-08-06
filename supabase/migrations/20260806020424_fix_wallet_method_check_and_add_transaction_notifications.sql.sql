/*
# Fix wallet_transactions method check + add email/push notifications for all transactions

## Problem 1: CHECK constraint violation on wallet_transactions.method
The `process_withdrawal_completion` function inserts wallet transaction rows with
`method = v_withdrawal.payout_method`. When the payout method is `mobile_money`,
this violates the `wallet_transactions_method_check` constraint, which only allows:
`cash`, `bank_transfer`, `africell_money`, `orange_money`, `qmoney`, `wallet`, `admin`, `monime`, or NULL.

### Fix
Map `mobile_money` → `monime` inside `process_withdrawal_completion` before inserting
the wallet transaction row. This is the correct canonical value per the constraint.

## Problem 2: Wallet transaction notifications are in-app only
The existing `notify_wallet_transaction()` trigger only inserts rows into the
`notifications` table (in-app). It does NOT enqueue into `notification_outbox`,
so email and push notifications are never sent for wallet transactions.

### Fix
Rewrite `notify_wallet_transaction()` to call `enqueue_notification()` for each
wallet transaction, using category `payments` so user preferences are respected.
The existing cron job + `send-notification` edge function will then dispatch
in-app, email, and push notifications automatically.

## Changes
1. `process_withdrawal_completion(uuid, text)` — map payout_method to allowed method values
2. `notify_wallet_transaction()` — enqueue into notification_outbox instead of direct insert
3. Grant EXECUTE on enqueue_notification to the trigger function's caller (already SECURITY DEFINER)
*/

-- ── Fix 1: Map mobile_money → monime in process_withdrawal_completion ──

CREATE OR REPLACE FUNCTION process_withdrawal_completion(
  p_withdrawal_id uuid,
  p_monime_payout_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal withdrawal_requests%ROWTYPE;
  v_balance numeric(14,2);
  v_user_id uuid;
  v_is_admin boolean;
  v_method text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.is_admin();
  IF v_is_admin IS NULL THEN v_is_admin := false; END IF;

  SELECT * INTO v_withdrawal FROM withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF v_withdrawal.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already completed');
  END IF;

  IF v_user_id = v_withdrawal.user_id THEN
    IF v_withdrawal.status <> 'approved' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Your withdrawal must be approved by an admin first');
    END IF;
  ELSIF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner or an admin can complete this withdrawal');
  END IF;

  IF v_is_admin AND v_withdrawal.status NOT IN ('approved', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot complete a ' || v_withdrawal.status || ' withdrawal');
  END IF;

  IF v_withdrawal.status NOT IN ('approved', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot complete a ' || v_withdrawal.status || ' withdrawal');
  END IF;

  SELECT COALESCE(SUM(amount_sle), 0) INTO v_balance
  FROM wallet_transactions
  WHERE user_id = v_withdrawal.user_id AND status = 'completed';

  IF v_balance < v_withdrawal.amount_sle THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  -- Map payout_method to an allowed wallet_transactions.method value
  v_method := CASE v_withdrawal.payout_method
    WHEN 'mobile_money' THEN 'monime'
    WHEN 'bank_transfer' THEN 'bank_transfer'
    WHEN 'cash' THEN 'cash'
    ELSE v_withdrawal.payout_method
  END;

  INSERT INTO wallet_transactions (
    user_id, type, amount_sle, description, method, reference,
    status, recorded_by
  ) VALUES (
    v_withdrawal.user_id,
    'payment',
    -v_withdrawal.amount_sle,
    'Withdrawal via ' || v_withdrawal.payout_method,
    v_method,
    p_monime_payout_id,
    'completed',
    CASE WHEN v_is_admin THEN 'admin' ELSE 'system' END
  );

  UPDATE withdrawal_requests
  SET status = 'completed',
      completed_at = now(),
      reference = COALESCE(p_monime_payout_id, reference),
      monime_payout_id = COALESCE(p_monime_payout_id, monime_payout_id),
      payout_status = 'completed'
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION process_withdrawal_completion(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION process_withdrawal_completion(uuid, text) TO authenticated;

-- ── Fix 2: Rewrite notify_wallet_transaction to use notification_outbox ──

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
BEGIN
  v_amount_label := 'SLE ' || trim(to_char(abs(NEW.amount_sle), '999,999,990.00'));

  IF NEW.type = 'topup' THEN
    v_type_label := 'Wallet Top-Up';
    v_title := 'Wallet Credited';
    v_body := v_type_label || ' of ' || v_amount_label || ' has been added to your wallet.';
    v_event_type := 'wallet_topup';
  ELSIF NEW.type = 'payment' THEN
    v_type_label := 'Payment';
    v_title := 'Payment Processed';
    v_body := 'A payment of ' || v_amount_label || ' was deducted from your wallet.';
    v_event_type := 'wallet_payment';
  ELSIF NEW.type = 'refund' THEN
    v_type_label := 'Refund';
    v_title := 'Refund Received';
    v_body := 'A refund of ' || v_amount_label || ' has been credited to your wallet.';
    v_event_type := 'wallet_refund';
  ELSIF NEW.type = 'adjustment' THEN
    v_type_label := 'Wallet Adjustment';
    v_title := 'Wallet Adjusted';
    v_body := 'An adjustment of ' || v_amount_label || ' was applied to your wallet.';
    v_event_type := 'wallet_adjustment';
  ELSE
    RETURN NEW;
  END IF;

  -- Enqueue into notification_outbox — the cron job + send-notification edge function
  -- will dispatch in-app, email, and push based on user preferences.
  PERFORM enqueue_notification(
    NEW.user_id,
    'client',
    v_event_type,
    v_title,
    v_body,
    'payments',
    jsonb_build_object(
      'service_slug', 'finance',
      'channel_id', 'transactions',
      'click_action', 'OPEN_WALLET',
      'link', '/?page=wallet',
      'amount_sle', NEW.amount_sle,
      'tx_type', NEW.type
    )
  );

  RETURN NEW;
END;
$$;

-- Keep the existing trigger — it now calls the rewritten function
-- (No need to drop/recreate the trigger itself)
