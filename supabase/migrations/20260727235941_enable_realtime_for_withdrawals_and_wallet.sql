-- Enable realtime for withdrawal_requests and wallet_transactions
-- so the user app receives instant updates when admin changes status
-- or when a withdrawal deduction is inserted.

ALTER TABLE withdrawal_requests REPLICA IDENTITY FULL;
ALTER TABLE wallet_transactions REPLICA IDENTITY FULL;

-- Add tables to the realtime publication if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'withdrawal_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE withdrawal_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'wallet_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wallet_transactions;
  END IF;
END $$;
