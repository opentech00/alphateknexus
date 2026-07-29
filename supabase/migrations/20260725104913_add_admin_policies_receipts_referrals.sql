/*
# Add admin read policies for receipts, referrals, and monime payments

1. Security Changes
- Add admin SELECT policy on `payment_receipts` so admins can view all receipts.
- Add admin SELECT policy on `referrals` so admins can view all referrals.
- Add admin SELECT policy on `monime_payments` so admins can view all online payments.
- Add admin UPDATE policy on `payment_receipts` so admins can resend receipt emails.

2. Notes
- These use the same admin-detection pattern as wallet_transactions:
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
- Existing owner-scoped policies are preserved; these are additive.
*/

-- payment_receipts: admin can read all + update (for email resend tracking)
DROP POLICY IF EXISTS "admin_select_all_receipts" ON payment_receipts;
CREATE POLICY "admin_select_all_receipts" ON payment_receipts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_update_receipts" ON payment_receipts;
CREATE POLICY "admin_update_receipts" ON payment_receipts FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- referrals: admin can read all
DROP POLICY IF EXISTS "admin_select_all_referrals" ON referrals;
CREATE POLICY "admin_select_all_referrals" ON referrals FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- monime_payments: admin can read all
DROP POLICY IF EXISTS "admin_select_all_monime_payments" ON monime_payments;
CREATE POLICY "admin_select_all_monime_payments" ON monime_payments FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
