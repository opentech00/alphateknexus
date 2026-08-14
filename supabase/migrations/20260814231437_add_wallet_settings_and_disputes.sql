/*
# Wallet Settings & Disputes

1. Modified Tables
   - `user_preferences`: Add wallet settings columns
     - `low_balance_threshold` (numeric) — threshold in SLE below which a low-balance alert is shown
     - `auto_topup_enabled` (boolean) — whether auto-top-up is active
     - `auto_topup_amount` (numeric) — amount to auto-top-up when balance drops below threshold
     - `auto_topup_method_id` (uuid) — references `payment_methods` for auto-top-up
     - `monthly_budget` (numeric) — monthly spending budget target

2. New Tables
   - `wallet_disputes`
     - `id` (uuid, PK)
     - `user_id` (uuid, FK to auth.users, owner)
     - `transaction_id` (uuid, FK to wallet_transactions)
     - `reason` (text) — dispute reason category
     - `description` (text) — detailed description from user
     - `status` (text) — pending / under_review / resolved / rejected
     - `admin_notes` (text) — admin response/notes
     - `resolved_by` (uuid) — admin who resolved
     - `resolved_at` (timestamptz) — when resolved
     - `refund_amount` (numeric) — amount refunded if applicable
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)

3. Security
   - RLS enabled on `wallet_disputes`
   - Users can read, create, update own disputes
   - Admins can read and update all disputes

4. Notes
   - user_preferences columns added with DO block for idempotency
   - Dispute statuses constrained via CHECK
*/

-- Extend user_preferences with wallet settings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'low_balance_threshold') THEN
    ALTER TABLE user_preferences ADD COLUMN low_balance_threshold numeric DEFAULT 100;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'auto_topup_enabled') THEN
    ALTER TABLE user_preferences ADD COLUMN auto_topup_enabled boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'auto_topup_amount') THEN
    ALTER TABLE user_preferences ADD COLUMN auto_topup_amount numeric DEFAULT 200;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'auto_topup_method_id') THEN
    ALTER TABLE user_preferences ADD COLUMN auto_topup_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'monthly_budget') THEN
    ALTER TABLE user_preferences ADD COLUMN monthly_budget numeric DEFAULT 0;
  END IF;
END $$;

-- Create wallet_disputes table
CREATE TABLE IF NOT EXISTS wallet_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  reason text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'rejected')),
  admin_notes text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  refund_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE wallet_disputes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_wallet_disputes_user ON wallet_disputes(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_disputes_transaction ON wallet_disputes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_wallet_disputes_status ON wallet_disputes(status);

-- User policies: read and create own disputes
DROP POLICY IF EXISTS "select_own_disputes" ON wallet_disputes;
CREATE POLICY "select_own_disputes" ON wallet_disputes FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "insert_own_disputes" ON wallet_disputes;
CREATE POLICY "insert_own_disputes" ON wallet_disputes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_disputes" ON wallet_disputes;
CREATE POLICY "update_disputes" ON wallet_disputes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "delete_own_disputes" ON wallet_disputes;
CREATE POLICY "delete_own_disputes" ON wallet_disputes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
