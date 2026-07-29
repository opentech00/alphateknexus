/*
# Create Monime Payments Table

1. New Tables
- `monime_payments` — tracks every Monime checkout session and its result
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users, defaults to auth.uid())
  - `checkout_session_id` (text, unique) — Monime's session ID
  - `payment_id` (text, nullable) — Monime's payment ID once completed
  - `reference` (text) — internal reference e.g. INV-2026-001 or WALLET-TOPUP-uuid
  - `amount_sle` (integer, not null) — amount in Sierra Leone Leones
  - `currency` (text, default 'SLE')
  - `status` (text, default 'pending') — pending | completed | failed | cancelled
  - `purpose` (text, not null) — 'invoice' | 'wallet_topup' | 'subscription'
  - `related_id` (uuid, nullable) — invoice_id or wallet_transaction_id
  - `checkout_url` (text, nullable) — URL the customer was redirected to
  - `paid_at` (timestamptz, nullable)
  - `raw_payload` (jsonb, nullable) — full webhook payload for audit
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Modified Tables
- `wallet_transactions` — add `monime_payment_id` column (nullable uuid) to link wallet top-ups to Monime payments
- `smart_sort_payments` — add `monime_payment_id` column (nullable uuid) to link invoice payments to Monime payments

3. Security
- Enable RLS on `monime_payments`.
- Owner-scoped CRUD: authenticated users can only access their own payment records.
- Service role (edge functions) bypasses RLS for webhook processing.

4. Important Notes
1. The `monime_payments` table is the central ledger for all Monime transactions.
2. The webhook edge function uses the service role key to update records without RLS restrictions.
3. The `checkout_session_id` unique constraint prevents duplicate session creation.
4. The `raw_payload` jsonb column stores the full webhook event for audit and dispute resolution.
*/

CREATE TABLE IF NOT EXISTS public.monime_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  checkout_session_id text UNIQUE,
  payment_id text,
  reference text NOT NULL,
  amount_sle integer NOT NULL,
  currency text DEFAULT 'SLE',
  status text DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])),
  purpose text NOT NULL CHECK (purpose = ANY (ARRAY['invoice'::text, 'wallet_topup'::text, 'subscription'::text])),
  related_id uuid,
  checkout_url text,
  paid_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.monime_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_monime_payments" ON public.monime_payments;
CREATE POLICY "select_own_monime_payments" ON public.monime_payments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_monime_payments" ON public.monime_payments;
CREATE POLICY "insert_own_monime_payments" ON public.monime_payments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_monime_payments" ON public.monime_payments;
CREATE POLICY "update_own_monime_payments" ON public.monime_payments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_monime_payments" ON public.monime_payments;
CREATE POLICY "delete_own_monime_payments" ON public.monime_payments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add monime_payment_id to wallet_transactions (nullable, no data loss)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'monime_payment_id'
  ) THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN monime_payment_id uuid;
  END IF;
END $$;

-- Add monime_payment_id to smart_sort_payments (nullable, no data loss)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'smart_sort_payments' AND column_name = 'monime_payment_id'
  ) THEN
    ALTER TABLE public.smart_sort_payments ADD COLUMN monime_payment_id uuid;
  END IF;
END $$;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_monime_payments_user_id ON public.monime_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_monime_payments_reference ON public.monime_payments(reference);
CREATE INDEX IF NOT EXISTS idx_monime_payments_status ON public.monime_payments(status);
