/*
# Wallet & Payments System

1. Purpose
  Platform-wide wallet for clients to top up credit (mobile money / cash / bank)
  and spend it across all five divisions. Replaces the "Coming Soon" wallet
  placeholder on AccountPage and the non-functional banner on ServicesPage.
  Admins can view all wallets, record top-ups, and adjust balances.

2. New Tables
  - `wallet_transactions`
    - `id` uuid PK
    - `user_id` uuid NOT NULL DEFAULT auth.uid() — owner
    - `type` text NOT NULL — 'topup' | 'payment' | 'refund' | 'adjustment'
    - `amount_sle` numeric(12,2) NOT NULL — positive = credit in, negative = debit
    - `balance_after` numeric(12,2) — snapshot of balance after this txn
    - `description` text — human-readable note
    - `method` text — 'cash' | 'bank_transfer' | 'africell_money' | 'orange_money' | 'qmoney' | 'wallet' | 'admin'
    - `reference` text — transaction reference / receipt number
    - `booking_id` uuid nullable — links to bookings table when paying for a booking
    - `status` text NOT NULL DEFAULT 'completed' — 'pending' | 'completed' | 'failed'
    - `recorded_by` text — 'client' | 'admin' | 'system'
    - `created_at` timestamptz DEFAULT now()

  The wallet balance for a user = SUM(amount_sle) WHERE user_id = X AND status = 'completed'.
  No separate wallet table needed — the balance is derived from transactions.

3. Security
  - Enable RLS on wallet_transactions.
  - Clients can SELECT only their own transactions.
  - Clients can INSERT only their own top-up requests (type must be 'topup', recorded_by 'client').
  - Admins (role check via profiles) can SELECT all transactions and INSERT/UPDATE any.
  - No DELETE — transactions are immutable for audit trail.

4. Notes
  - Admin role is checked via: EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  - Balance is computed client-side by summing completed transactions.
  - Admin top-ups/adjustments insert rows with recorded_by = 'admin'.
*/

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('topup', 'payment', 'refund', 'adjustment')),
  amount_sle numeric(12,2) NOT NULL,
  balance_after numeric(12,2),
  description text,
  method text CHECK (method IN ('cash', 'bank_transfer', 'africell_money', 'orange_money', 'qmoney', 'wallet', 'admin') OR method IS NULL),
  reference text,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  recorded_by text NOT NULL DEFAULT 'client' CHECK (recorded_by IN ('client', 'admin', 'system')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_txn_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_created ON wallet_transactions(created_at DESC);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Clients: read own transactions
DROP POLICY IF EXISTS "select_own_wallet" ON wallet_transactions;
CREATE POLICY "select_own_wallet" ON wallet_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Clients: insert own top-up requests
DROP POLICY IF EXISTS "insert_own_wallet_topup" ON wallet_transactions;
CREATE POLICY "insert_own_wallet_topup" ON wallet_transactions FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND type = 'topup'
    AND recorded_by = 'client'
  );

-- Admins: read all transactions
DROP POLICY IF EXISTS "admin_select_all_wallet" ON wallet_transactions;
CREATE POLICY "admin_select_all_wallet" ON wallet_transactions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Admins: insert transactions (top-ups, adjustments, payments)
DROP POLICY IF EXISTS "admin_insert_wallet" ON wallet_transactions;
CREATE POLICY "admin_insert_wallet" ON wallet_transactions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Admins: update transactions (e.g. change status from pending to completed)
DROP POLICY IF EXISTS "admin_update_wallet" ON wallet_transactions;
CREATE POLICY "admin_update_wallet" ON wallet_transactions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
