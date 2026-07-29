CREATE TABLE smart_sort_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  waste_type TEXT NOT NULL,
  bin_size_liters INTEGER NOT NULL DEFAULT 25,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  time_slot TEXT NOT NULL DEFAULT 'morning',
  address TEXT NOT NULL,
  landmark TEXT,
  contact_phone TEXT NOT NULL,
  special_instructions TEXT,
  plan_name TEXT,
  plan_price_sle INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  auto_pay BOOLEAN NOT NULL DEFAULT true,
  paused_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE smart_sort_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_subs" ON smart_sort_subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_subs" ON smart_sort_subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_subs" ON smart_sort_subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_subs" ON smart_sort_subscriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
