/*
  Restore EXECUTE on generate_cash_reference() for authenticated users.

  payments.reference defaults to generate_cash_reference(). PostgreSQL
  evaluates column defaults as the inserting role, so cash top-ups, cash
  bookings, and bank-slip inserts fail with:

    permission denied for function generate_cash_reference

  after the 20260804 revoke of authenticated EXECUTE. The function is
  SECURITY DEFINER and only returns a sequential CSH-YYYY-NNNN string.
  Sequence access stays with the function owner / service_role.
*/

GRANT EXECUTE ON FUNCTION public.generate_cash_reference() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_cash_reference() TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cash_payment_ref_seq TO service_role;
