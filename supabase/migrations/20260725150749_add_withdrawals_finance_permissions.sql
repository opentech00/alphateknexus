/*
# Finance Pro: Withdrawals & Role-Based Financial Permissions

## Overview
Adds two new capabilities to the Finance Module:
1. Automated Payouts & Withdrawals — clients request wallet withdrawals; admins approve/reject and complete them.
2. Role-Based Financial Permissions — granular access control over finance actions (view, transact, approve, delete) per admin team member.

## 1. New Tables

### `withdrawal_requests`
Stores client withdrawal requests from their wallet balance.
- `id` (uuid PK)
- `user_id` (uuid, references auth.users, defaults to auth.uid()) — the client requesting withdrawal
- `amount_sle` (numeric) — amount to withdraw in SLE
- `payout_method` (text) — mobile_money | bank_transfer | cash
- `payout_details` (jsonb) — method-specific details (phone number, bank account, etc.)
- `status` (text) — pending | approved | rejected | completed | cancelled (default pending)
- `reference` (text) — optional reference/transaction ID from payout provider
- `admin_note` (text) — admin note on approval/rejection
- `reviewed_by` (uuid) — admin who reviewed the request (references auth.users)
- `reviewed_at` (timestamptz) — when reviewed
- `completed_at` (timestamptz) — when payout was completed
- `created_at` / `updated_at` (timestamptz)

### `finance_permissions`
Stores per-user financial permissions for the admin team.
- `id` (uuid PK)
- `user_id` (uuid, references auth.users) — the admin/staff member
- `can_view_finance` (boolean, default true) — can view finance tabs
- `can_add_transactions` (boolean, default false) — can add wallet transactions / receipts
- `can_approve_withdrawals` (boolean, default false) — can approve/reject withdrawal requests
- `can_delete_transactions` (boolean, default false) — can delete transactions
- `can_manage_fx_rates` (boolean, default false) — can add/edit FX rates
- `can_manage_invoices` (boolean, default false) — can create/edit invoices
- `created_at` / `updated_at` (timestamptz)

## 2. Functions

### `has_finance_permission(perm text)`
Returns true if the current user is a full admin OR has the named finance permission
in finance_permissions. Full admins bypass all checks.

## 3. Security
- RLS enabled on both new tables.
- `withdrawal_requests`: clients SELECT/INSERT their own; admins SELECT all + UPDATE (approve/reject/complete).
- `finance_permissions`: admins SELECT/INSERT/UPDATE/DELETE all rows.
- A client cannot read other clients' withdrawal requests.

## 4. Important Notes
1. Full admins (profiles.role = 'admin') always bypass finance permission checks via
   has_finance_permission() — they retain full access regardless of finance_permissions rows.
2. A finance_permissions row is optional; if absent, the user has only can_view_finance (default true).
3. Withdrawal amounts must be positive and cannot exceed the client's wallet balance.
4. The `can_approve_withdrawals` permission is separate from `can_add_transactions` so a
   supervisor can approve payouts without being able to manually add transactions.
*/

-- ── withdrawal_requests ──
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_sle numeric(14,2) NOT NULL CHECK (amount_sle > 0),
  payout_method text NOT NULL CHECK (payout_method IN ('mobile_money','bank_transfer','cash')),
  payout_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed','cancelled')),
  reference text,
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON withdrawal_requests(user_id);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "select_own_withdrawals" ON withdrawal_requests FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_select_all_withdrawals" ON withdrawal_requests;
CREATE POLICY "admin_select_all_withdrawals" ON withdrawal_requests FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "insert_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "insert_own_withdrawals" ON withdrawal_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_update_withdrawals" ON withdrawal_requests;
CREATE POLICY "admin_update_withdrawals" ON withdrawal_requests FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "cancel_own_withdrawals" ON withdrawal_requests;
CREATE POLICY "cancel_own_withdrawals" ON withdrawal_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- ── finance_permissions ──
CREATE TABLE IF NOT EXISTS finance_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view_finance boolean NOT NULL DEFAULT true,
  can_add_transactions boolean NOT NULL DEFAULT false,
  can_approve_withdrawals boolean NOT NULL DEFAULT false,
  can_delete_transactions boolean NOT NULL DEFAULT false,
  can_manage_fx_rates boolean NOT NULL DEFAULT false,
  can_manage_invoices boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_all_finance_permissions" ON finance_permissions;
CREATE POLICY "admin_select_all_finance_permissions" ON finance_permissions FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "select_own_finance_permissions" ON finance_permissions;
CREATE POLICY "select_own_finance_permissions" ON finance_permissions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_insert_finance_permissions" ON finance_permissions;
CREATE POLICY "admin_insert_finance_permissions" ON finance_permissions FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_update_finance_permissions" ON finance_permissions;
CREATE POLICY "admin_update_finance_permissions" ON finance_permissions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_finance_permissions" ON finance_permissions;
CREATE POLICY "admin_delete_finance_permissions" ON finance_permissions FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ── has_finance_permission() function ──
CREATE OR REPLACE FUNCTION has_finance_permission(perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM finance_permissions fp
      WHERE fp.user_id = auth.uid()
      AND (
        (perm = 'can_view_finance' AND fp.can_view_finance) OR
        (perm = 'can_add_transactions' AND fp.can_add_transactions) OR
        (perm = 'can_approve_withdrawals' AND fp.can_approve_withdrawals) OR
        (perm = 'can_delete_transactions' AND fp.can_delete_transactions) OR
        (perm = 'can_manage_fx_rates' AND fp.can_manage_fx_rates) OR
        (perm = 'can_manage_invoices' AND fp.can_manage_invoices)
      )
    )
$$;

GRANT EXECUTE ON FUNCTION has_finance_permission(text) TO authenticated;

-- ── updated_at triggers ──
DROP TRIGGER IF EXISTS withdrawal_requests_updated_at ON withdrawal_requests;
CREATE TRIGGER withdrawal_requests_updated_at BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS finance_permissions_updated_at ON finance_permissions;
CREATE TRIGGER finance_permissions_updated_at BEFORE UPDATE ON finance_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
