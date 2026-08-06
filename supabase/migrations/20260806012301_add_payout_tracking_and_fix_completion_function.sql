-- Add payout tracking columns to withdrawal_requests
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS monime_payout_id text;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS payout_status text CHECK (payout_status IN ('pending', 'sent', 'completed', 'failed'));

-- Prevent duplicate Monime payouts
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_monime_payout_id_unique
  ON withdrawal_requests (monime_payout_id)
  WHERE monime_payout_id IS NOT NULL;

-- Update the process_withdrawal_completion function to accept an optional payout_id
-- and to store it on the withdrawal row. Also tighten: owner can only complete
-- cash pickups (no payout_id); admin can complete any approved withdrawal.
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

  -- Owner may only complete if admin approved first (or cash pickup with payout_id null)
  IF v_user_id = v_withdrawal.user_id THEN
    IF v_withdrawal.status <> 'approved' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Your withdrawal must be approved by an admin first');
    END IF;
  ELSIF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner or an admin can complete this withdrawal');
  END IF;

  -- Admin can complete from approved or pending
  IF v_is_admin AND v_withdrawal.status NOT IN ('approved', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot complete a ' || v_withdrawal.status || ' withdrawal');
  END IF;

  IF v_withdrawal.status NOT IN ('approved', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot complete a ' || v_withdrawal.status || ' withdrawal');
  END IF;

  -- Compute current wallet balance from completed transactions
  SELECT COALESCE(SUM(amount_sle), 0) INTO v_balance
  FROM wallet_transactions
  WHERE user_id = v_withdrawal.user_id AND status = 'completed';

  IF v_balance < v_withdrawal.amount_sle THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  -- Debit the wallet
  INSERT INTO wallet_transactions (
    user_id, type, amount_sle, description, method, reference,
    status, recorded_by
  ) VALUES (
    v_withdrawal.user_id,
    'payment',
    -v_withdrawal.amount_sle,
    'Withdrawal via ' || v_withdrawal.payout_method,
    v_withdrawal.payout_method,
    p_monime_payout_id,
    'completed',
    CASE WHEN v_is_admin THEN 'admin' ELSE 'system' END
  );

  -- Mark withdrawal completed and store payout id
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

-- Re-grant EXECUTE to authenticated only (revoke from anon/PUBLIC)
REVOKE EXECUTE ON FUNCTION process_withdrawal_completion(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION process_withdrawal_completion(uuid, text) TO authenticated;

-- Drop the old single-param version if it exists
DROP FUNCTION IF EXISTS process_withdrawal_completion(uuid);
