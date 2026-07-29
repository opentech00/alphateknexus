/*
# Create smart_sort_plans table

1. New Tables
  - `smart_sort_plans`
    - `id` (uuid, primary key)
    - `name` (text, not null) - display name e.g. "Basic Weekly"
    - `subtitle` (text) - short marketing tagline
    - `price_sle` (integer, not null) - monthly price in SLE (Leones)
    - `bin_size_liters` (integer, not null) - default bin capacity for this plan
    - `frequency` (text, not null) - pickup frequency: daily/weekly/bi-weekly/monthly etc.
    - `features` (jsonb) - list of included features for marketing display
    - `is_active` (boolean, default true) - soft-delete / hide from clients
    - `sort_order` (integer, default 0) - display ordering
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - RLS enabled.
  - Anyone (anon + authenticated) can read active plans so the client portal can display them.
  - Only admins can insert/update/delete plans.

3. Seed Data
  - Two starter plans matching the previous hardcoded values (Basic weekly, Pro Bi-weekly).
*/

CREATE TABLE IF NOT EXISTS smart_sort_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subtitle text,
  price_sle integer NOT NULL,
  bin_size_liters integer NOT NULL DEFAULT 25,
  frequency text NOT NULL DEFAULT 'weekly',
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE smart_sort_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_read_active_plans" ON smart_sort_plans;
CREATE POLICY "anyone_can_read_active_plans" ON smart_sort_plans FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_insert_plans" ON smart_sort_plans;
CREATE POLICY "admin_insert_plans" ON smart_sort_plans FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_plans" ON smart_sort_plans;
CREATE POLICY "admin_update_plans" ON smart_sort_plans FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_plans" ON smart_sort_plans;
CREATE POLICY "admin_delete_plans" ON smart_sort_plans FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

INSERT INTO smart_sort_plans (name, subtitle, price_sle, bin_size_liters, frequency, features, sort_order) VALUES
  ('Basic Weekly', 'Perfect for small households', 100, 25, 'weekly',
    '["Weekly pickup","25L bin included","SMS reminders","Impact report"]'::jsonb, 1),
  ('Pro Bi-Weekly', 'Best value for busy offices', 200, 50, 'bi-weekly',
    '["Bi-weekly pickup","50L bin included","Priority scheduling","SMS reminders","Monthly impact report","Dedicated support"]'::jsonb, 2)
ON CONFLICT DO NOTHING;
