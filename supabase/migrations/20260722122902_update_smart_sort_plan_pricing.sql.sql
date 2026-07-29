/*
# Update Smart Sort plans with new bin-size pricing

1. Changes
- Deactivates old placeholder plans (Basic Weekly 25L/Le100, Pro Bi-Weekly 50L/Le200).
- Inserts 8 new plans matching the approved bin-size price list:
  25L=Le15, 50L=Le25, 120L=Le50, 250L=Le90, 350L=Le120, 600L=Le250, 1000L=Le350, Above 1000L=Negotiable (price 0).
- The "Above 1,000L" plan has price_sle = 0 and a feature note "Negotiable pricing".
2. Security
- No RLS policy changes. Existing admin-only policies remain in effect.
*/

UPDATE public.smart_sort_plans SET is_active = false WHERE is_active = true;

INSERT INTO public.smart_sort_plans (name, subtitle, price_sle, bin_size_liters, frequency, features, is_active, sort_order)
VALUES
  ('Starter 25L', 'Compact bin for small households', 15, 25, 'weekly',
    '["25L bin included","Weekly pickup","SMS reminders"]', true, 1),
  ('Standard 50L', 'Everyday household bin', 25, 50, 'weekly',
    '["50L bin included","Weekly pickup","SMS reminders","Impact report"]', true, 2),
  ('Household 120L', 'Popular family size', 50, 120, 'weekly',
    '["120L bin included","Weekly pickup","SMS reminders","Impact report"]', true, 3),
  ('Large 250L', 'For offices and large homes', 90, 250, 'weekly',
    '["250L bin included","Weekly pickup","Priority scheduling","Impact report"]', true, 4),
  ('Extra 350L', 'Commercial and institutional', 120, 350, 'weekly',
    '["350L bin included","Weekly pickup","Priority scheduling","Dedicated support"]', true, 5),
  ('Industrial 600L', 'Heavy-duty operations', 250, 600, 'weekly',
    '["600L bin included","Weekly pickup","Priority scheduling","Dedicated support","Monthly report"]', true, 6),
  ('Bulk 1,000L', 'Large-scale waste generators', 350, 1000, 'weekly',
    '["1,000L container","Weekly pickup","Priority scheduling","Dedicated support","Monthly report"]', true, 7),
  ('Above 1,000L', 'Custom volume — negotiable', 0, 1200, 'weekly',
    '["Custom container sizing","Flexible scheduling","Negotiable pricing","Dedicated support"]', true, 8)
ON CONFLICT (id) DO NOTHING;
