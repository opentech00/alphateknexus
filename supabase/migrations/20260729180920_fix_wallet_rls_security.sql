/*
# Fix Wallet Security: RLS Policy Hardening + User-Scoped Access

## Problem
1. Admin RLS policies on wallet_transactions and withdrawal_requests used
   `EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')`
   instead of the hardened `is_admin()` SECURITY DEFINER function. This can cause
   RLS recursion and potential policy bypass.
2. The wallet_transactions INSERT policy for payments allowed any authenticated
   user to insert payment rows for ANY user_id, not just their own. The policy
   only checked `auth.uid() = user_id` on topup inserts but the payment insert
   policy added later also checked `auth.uid() = user_id` — however the admin
   insert policy had NO user_id check at all, meaning an admin could insert
   transactions attributed to any user. While admin access is intentional,
   the policy should be explicit.
3. No DELETE policy existed for clients — the "Clear History" button in the
   wallet UI silently failed because there was no DELETE policy. This is
   actually safer (transactions should be immutable) but the UI should not
   offer the button.

## Changes
1. Replace all `EXISTS (SELECT 1 FROM profiles ... role = 'admin')` checks with
   `is_admin()` in wallet_transactions and withdrawal_requests policies.
2. Add an explicit client DELETE policy on wallet_transactions that only
   allows deleting the user's OWN non-completed (pending/failed) transactions
   — completed transactions are immutable for audit.
3. Tighten the admin INSERT policy to require either is_admin() OR the
   existing client ownership check (preventing any gap).
4. Add a client UPDATE policy for withdrawal_requests cancel action that
   is already present but ensure it uses is_admin() for admin updates.

## Security
- All admin policies now use is_admin() (SECURITY DEFINER, no recursion).
- Clients can only ever see/modify their own rows.
- Completed wallet transactions cannot be deleted by clients (audit trail).
- Withdrawal requests: clients can cancel their own pending requests;
  admins can update any (approve/reject/complete).
*/

-- ============================================================
-- 1. wallet_transactions: rebuild all policies with is_admin()
-- ============================================================

-- SELECT: clients see own, admins see all
DROP POLICY IF EXISTS "select_own_wallet" ON wallet_transactions;
CREATE POLICY "select_own_wallet" ON wallet_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

-- Remove old admin-only select policy (now merged into select_own_wallet)
DROP POLICY IF EXISTS "admin_select_all_wallet" ON wallet_transactions;

-- INSERT: clients insert own topups/payments, admins insert any
DROP POLICY IF EXISTS "insert_own_wallet_topup" ON wallet_transactions;
CREATE POLICY "insert_own_wallet_topup" ON wallet_transactions FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND type = 'topup'
    AND recorded_by = 'client'
  );

DROP POLICY IF EXISTS "insert_own_wallet_payment" ON wallet_transactions;
CREATE POLICY "insert_own_wallet_payment" ON wallet_transactions FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND type = 'payment'
    AND amount_sle < 0
    AND recorded_by = 'client'
  );

DROP POLICY IF EXISTS "admin_insert_wallet" ON wallet_transactions;
CREATE POLICY "admin_insert_wallet" ON wallet_transactions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

-- UPDATE: admins only
DROP POLICY IF EXISTS "admin_update_wallet" ON wallet_transactions;
CREATE POLICY "admin_update_wallet" ON wallet_transactions FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: clients can delete their own pending/failed transactions only
-- (completed transactions are immutable for audit trail)
DROP POLICY IF EXISTS "client_delete_own_pending_wallet" ON wallet_transactions;
CREATE POLICY "client_delete_own_pending_wallet" ON wallet_transactions FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id
    AND status IN ('pending', 'failed')
  );

-- Admin delete (for admin cleanup)
DROP POLICY IF EXISTS "admin_delete_wallet" ON wallet_transactions;
CREATE POLICY "admin_delete_wallet" ON wallet_transactions FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- 2. withdrawal_requests: rebuild admin policies with is_admin()
-- ============================================================

-- SELECT: clients see own, admins see all
DROP POLICY IF EXISTS "select_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "select_own_withdrawals" ON withdrawal_requests FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "admin_select_all_withdrawals" ON withdrawal_requests;

-- INSERT: clients insert own
DROP POLICY IF EXISTS "insert_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "insert_own_withdrawals" ON withdrawal_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- UPDATE: admins update any; clients can cancel own pending
DROP POLICY IF EXISTS "admin_update_withdrawals" ON withdrawal_requests;
CREATE POLICY "admin_update_withdrawals" ON withdrawal_requests FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "cancel_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "cancel_own_withdrawals" ON withdrawal_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- ============================================================
-- 3. finance_permissions: use is_admin()
-- ============================================================

DROP POLICY IF EXISTS "admin_select_all_finance_permissions" ON finance_permissions;
CREATE POLICY "admin_select_all_finance_permissions" ON finance_permissions FOR SELECT
  TO authenticated USING (is_admin() OR auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_insert_finance_permissions" ON finance_permissions;
CREATE POLICY "admin_insert_finance_permissions" ON finance_permissions FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_finance_permissions" ON finance_permissions;
CREATE POLICY "admin_update_finance_permissions" ON finance_permissions FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_finance_permissions" ON finance_permissions;
CREATE POLICY "admin_delete_finance_permissions" ON finance_permissions FOR DELETE
  TO authenticated USING (is_admin());
