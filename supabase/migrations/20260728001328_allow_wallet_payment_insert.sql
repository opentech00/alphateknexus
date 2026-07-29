-- Allow authenticated users to insert wallet payment rows (type='payment')
-- so they can pay for bookings from their wallet balance.

CREATE POLICY "insert_own_wallet_payment"
  ON wallet_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND type = 'payment'
    AND amount_sle < 0
    AND recorded_by = 'client'
  );
