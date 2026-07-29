/*
# Add admin access policies to smart_sort_subscriptions

1. Problem
  - The smart_sort_subscriptions table only had owner-scoped RLS policies.
  - An admin using the admin dashboard (authenticated, role='admin') could not
    read or update any subscription rows that did not belong to them, so the
    admin Smart Sort > Subscriptions tab appeared empty ("failed to get
    subscriptions").

2. Changes
  - Add `admin_select_all_subs` SELECT policy: any authenticated admin can read
    ALL subscription rows.
  - Add `admin_update_all_subs` UPDATE policy: any authenticated admin can
    update ALL subscription rows (pause/resume/cancel/auto-pay toggles).
  - Existing owner-scoped policies are kept untouched so clients still only see
    and modify their own subscriptions.

3. Security
  - Admin role is verified via the existing profiles.role = 'admin' check used
    throughout the rest of the schema (consistent with bookings/services).
  - No INSERT or DELETE admin policies are added — admins should not create or
    hard-delete client subscriptions; those remain owner-only.
*/

DROP POLICY IF EXISTS "admin_select_all_subs" ON smart_sort_subscriptions;
CREATE POLICY "admin_select_all_subs" ON smart_sort_subscriptions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_all_subs" ON smart_sort_subscriptions;
CREATE POLICY "admin_update_all_subs" ON smart_sort_subscriptions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
