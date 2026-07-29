/*
# Create payment_methods table

1. New Tables
- `payment_methods`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to auth.uid(), references auth.users)
  - `type` (text: 'card' or 'mobile')
  - `provider` (text: e.g. 'visa', 'mastercard', 'orange', 'afrimoney', 'qmoney')
  - `label` (text: display label, e.g. "VISA •••• 4242")
  - `detail` (text: last 4 digits for cards, phone number for mobile money)
  - `holder_name` (text, nullable: cardholder name for cards)
  - `exp_month` (int, nullable)
  - `exp_year` (int, nullable)
  - `is_default` (boolean, default false)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `payment_methods`.
- Owner-scoped CRUD: each authenticated user can only access their own rows.
- `user_id` defaults to `auth.uid()` so inserts that omit it still satisfy the WITH CHECK.
*/

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('card', 'mobile')),
  provider text NOT NULL,
  label text NOT NULL,
  detail text,
  holder_name text,
  exp_month integer,
  exp_year integer,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_payment_methods" ON payment_methods;
CREATE POLICY "select_own_payment_methods" ON payment_methods FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_payment_methods" ON payment_methods;
CREATE POLICY "insert_own_payment_methods" ON payment_methods FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_payment_methods" ON payment_methods;
CREATE POLICY "update_own_payment_methods" ON payment_methods FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_payment_methods" ON payment_methods;
CREATE POLICY "delete_own_payment_methods" ON payment_methods FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
