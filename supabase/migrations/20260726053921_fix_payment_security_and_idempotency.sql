-- Add unique constraint on monime_payments.reference
ALTER TABLE monime_payments ADD CONSTRAINT monime_payments_reference_unique UNIQUE (reference);

-- Add 'monime' to smart_sort_payments method CHECK constraint
ALTER TABLE smart_sort_payments DROP CONSTRAINT IF EXISTS smart_sort_payments_method_check;
ALTER TABLE smart_sort_payments ADD CONSTRAINT smart_sort_payments_method_check
  CHECK (method IN ('cash','bank_transfer','africell_money','orange_money','qmoney','monime','other'));

-- Atomic increment function for invoice amount_paid_sle (avoids lost updates)
CREATE OR REPLACE FUNCTION increment_invoice_paid(p_invoice_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE smart_sort_invoices
  SET amount_paid_sle = COALESCE(amount_paid_sle, 0) + p_amount,
      updated_at = now()
  WHERE id = p_invoice_id;
END;
$$;

-- Restrict generate_receipt_number to service role only (revoke from authenticated)
REVOKE EXECUTE ON FUNCTION generate_receipt_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION generate_receipt_number() FROM anon;
