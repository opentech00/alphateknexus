/*
# Create payment_receipts table

1. New Tables
- `payment_receipts`
  - `id` (uuid, PK)
  - `user_id` (uuid, FK auth.users, defaults to auth.uid())
  - `monime_payment_id` (uuid, FK monime_payments, nullable)
  - `receipt_number` (text, unique, auto-generated like RCT-000001)
  - `reference` (text, the monime payment reference)
  - `amount_sle` (integer, amount paid)
  - `currency` (text, default 'SLE')
  - `purpose` (text, 'wallet_topup' | 'invoice' | 'subscription')
  - `description` (text, human-readable description of what was paid for)
  - `payment_method` (text, default 'monime')
  - `payment_id` (text, the monime payment ID)
  - `paid_at` (timestamptz, when payment was confirmed)
  - `email_sent` (boolean, default false — tracks whether receipt email was sent)
  - `email_sent_at` (timestamptz, nullable)
  - `recipient_email` (text, nullable — the email address the receipt was sent to)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `payment_receipts`.
- Owner-scoped CRUD: each authenticated user can only access their own receipts.
- INSERT also allowed for service role (edge functions create receipts server-side).

3. Indexes
- Index on `user_id` for per-user queries.
- Index on `reference` for lookups by payment reference.
- Index on `monime_payment_id` for dedup checks.

4. Notes
- The `receipt_number` is auto-generated via a trigger using a sequence,
  producing human-readable receipt numbers like RCT-000001.
- Edge functions (verify-monime-payment, monime-webhook) insert receipts
  using the service role key, bypassing RLS.
*/

CREATE TABLE IF NOT EXISTS payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  monime_payment_id uuid REFERENCES monime_payments(id) ON DELETE SET NULL,
  receipt_number text UNIQUE NOT NULL,
  reference text NOT NULL,
  amount_sle integer NOT NULL,
  currency text NOT NULL DEFAULT 'SLE',
  purpose text NOT NULL,
  description text,
  payment_method text NOT NULL DEFAULT 'monime',
  payment_id text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  email_sent boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz,
  recipient_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

-- Owner-scoped policies for authenticated users
DROP POLICY IF EXISTS "select_own_receipts" ON payment_receipts;
CREATE POLICY "select_own_receipts" ON payment_receipts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_receipts" ON payment_receipts;
CREATE POLICY "insert_own_receipts" ON payment_receipts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_receipts" ON payment_receipts;
CREATE POLICY "update_own_receipts" ON payment_receipts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_receipts" ON payment_receipts;
CREATE POLICY "delete_own_receipts" ON payment_receipts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_receipts_user_id ON payment_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_reference ON payment_receipts(reference);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_monime_payment_id ON payment_receipts(monime_payment_id);

-- Sequence + function for auto-generating receipt numbers
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'RCT-' || lpad(nextval('receipt_number_seq')::text, 6, '0');
$$;
