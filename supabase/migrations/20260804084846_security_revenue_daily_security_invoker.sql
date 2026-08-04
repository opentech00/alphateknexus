/*
  # Make revenue_daily run with the caller's rights

  The revenue_daily view aggregated wallet_transactions, monime_payments and
  payment_receipts with the view owner's privileges, so its rows were produced
  without row level security applied to the underlying tables. The only guard was
  a `WHERE is_admin()` predicate inside the view body.

  1. Changes
     - `revenue_daily` now uses `security_invoker = true`, so the underlying
       tables' RLS policies apply to whoever selects from the view. Admins keep
       full visibility through the existing `admin_select_all_*` /
       `select_own_wallet (… OR is_admin())` policies.
     - SELECT is revoked from `anon`; only authenticated admins need it.
*/

ALTER VIEW public.revenue_daily SET (security_invoker = true);

REVOKE ALL ON public.revenue_daily FROM anon;
GRANT SELECT ON public.revenue_daily TO authenticated;
