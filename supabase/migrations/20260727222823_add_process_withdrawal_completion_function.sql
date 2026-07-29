/*
# Process Withdrawal Completion

## Overview
Adds a SECURITY DEFINER function `process_withdrawal_completion(p_withdrawal_id uuid)`
that an admin calls to mark a withdrawal as completed. It atomically:
1. Locks the withdrawal_requests row.
2. Validates the withdrawal is in 'approved' status (or 'pending' as a shortcut).
3. Computes the user's current wallet balance from completed wallet_transactions.
4. Checks the user has enough balance to cover the withdrawal (prevents overdraft).
5. Inserts a negative `withdrawal` wallet_transaction (type='payment', method=payout_method).
6. Updates the withdrawal_requests row to 'completed' with completed_at.

## Security
- SECURITY DEFINER so it can insert into wallet_transactions on behalf of the admin
  (wallet_transactions RLS would otherwise block admin inserts in some configs).
- Caller must be an admin (profiles.role = 'admin') — checked inside the function.
- The wallet_transactions row uses the withdrawal's user_id, not auth.uid().

## Notes
- Idempotent: if the withdrawal is already 'completed', returns success without re-deducting.
- If the withdrawal is 'rejected' or 'cancelled', returns an error.
- If insufficient balance, returns an error and does NOT update the withdrawal.
*/

CREATE OR REPLACE FUNCTION process_withdrawal_completion(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal  RECORD;
  v_balance     numeric(14,2);
  v_admin_uid   uuid := auth.uid();
  v_is_admin    boolean;
  v_tx_id       uuid;
BEGIN
  -- Permission check: must be admin
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_admin_uid AND role = 'admin'
  ) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admins can complete withdrawals');
  END IF;

  -- Lock the withdrawal row
  SELECT * INTO v_withdrawal
  FROM withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  -- Idempotent: already completed
  IF v_withdrawal.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already completed', 'idempotent', true);
  END IF;

  -- Can only complete from 'approved' or 'pending'
  IF v_withdrawal.status NOT IN ('approved', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot complete a ' || v_withdrawal.status || ' withdrawal');
  END IF;

  -- Compute current wallet balance
  SELECT COALESCE(SUM(amount_sle), 0) INTO v_balance
  FROM wallet_transactions
  WHERE user_id = v_withdrawal.user_id
    AND status = 'completed';

  -- Prevent overdraft
  IF v_balance < v_withdrawal.amount_sle THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient wallet balance',
      'balance', v_balance,
      'requested', v_withdrawal.amount_sle
    );
  END IF;

  -- Insert the deduction wallet transaction
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
    'admin'
  ) RETURNING id INTO v_tx_id;

  -- Mark withdrawal as completed
  UPDATE withdrawal_requests
  SET status       = 'completed',
      completed_at = now(),
      reviewed_by  = v_admin_uid,
      reviewed_at  = COALESCE(v_withdrawal.reviewed_at, now()),
      updated_at   = now()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'balance_after', v_balance - v_withdrawal.amount_sle
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_withdrawal_completion(uuid) TO authenticated;
