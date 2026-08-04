/*
  # Require admin approval before owner-initiated withdrawal completion

  `process_withdrawal_completion` allowed the withdrawal owner to complete
  directly from `pending` — bypassing admin review. Only admins should be able
  to complete from `pending` (i.e. approve + complete in one step); owners can
  only complete from `approved`.

  1. Changes
     - If the caller is the owner (not admin), the withdrawal must be in
       `approved` status. `pending` returns an error telling the owner to wait
       for admin approval.
     - Admins retain the ability to complete from `approved` or `pending`.
*/

CREATE OR REPLACE FUNCTION public.process_withdrawal_completion(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal  RECORD;
  v_balance     numeric(14,2);
  v_caller_uid  uuid := auth.uid();
  v_is_admin    boolean;
  v_is_owner    boolean;
  v_tx_id       uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller_uid AND role = 'admin'
  ) INTO v_is_admin;

  SELECT * INTO v_withdrawal
  FROM withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  v_is_owner := (v_withdrawal.user_id = v_caller_uid);

  IF NOT v_is_admin AND NOT v_is_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the account owner or an admin can complete this withdrawal');
  END IF;

  IF v_withdrawal.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already completed', 'idempotent', true);
  END IF;

  -- Owners can only complete from 'approved'; admins can complete from 'approved' or 'pending'
  IF v_is_owner AND NOT v_is_admin AND v_withdrawal.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your withdrawal must be approved by an admin before it can be completed');
  END IF;

  IF v_is_admin AND v_withdrawal.status NOT IN ('approved', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot complete a ' || v_withdrawal.status || ' withdrawal');
  END IF;

  SELECT COALESCE(SUM(amount_sle), 0) INTO v_balance
  FROM wallet_transactions
  WHERE user_id = v_withdrawal.user_id
    AND status = 'completed';

  IF v_balance < v_withdrawal.amount_sle THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient wallet balance',
      'balance', v_balance,
      'requested', v_withdrawal.amount_sle
    );
  END IF;

  INSERT INTO wallet_transactions (
    user_id, type, amount_sle, description, method,
    reference, status, recorded_by
  ) VALUES (
    v_withdrawal.user_id,
    'payment',
    -v_withdrawal.amount_sle,
    'Withdrawal via ' || v_withdrawal.payout_method,
    v_withdrawal.payout_method,
    p_withdrawal_id::text,
    'completed',
    CASE WHEN v_is_admin THEN 'admin' ELSE 'self' END
  ) RETURNING id INTO v_tx_id;

  UPDATE withdrawal_requests
  SET status       = 'completed',
      completed_at = now(),
      reviewed_by   = COALESCE(v_withdrawal.reviewed_by, v_caller_uid),
      reviewed_at   = COALESCE(v_withdrawal.reviewed_at, now()),
      updated_at    = now()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'balance_after', v_balance - v_withdrawal.amount_sle
  );
END;
$$;
