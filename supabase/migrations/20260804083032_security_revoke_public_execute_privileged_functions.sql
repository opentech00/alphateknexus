/*
  # Restrict privileged database routines (F6, F10, F11)

  `increment_invoice_paid`, `enqueue_notification` and `enqueue_admin_notification`
  are SECURITY DEFINER and were executable by PUBLIC/anon/authenticated, letting any
  caller mark invoices paid and forge notifications. Their only legitimate callers are
  the payment webhook / verifier and database triggers, all of which run as the service
  role or as the function owner.
*/

REVOKE ALL ON FUNCTION public.increment_invoice_paid(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_invoice_paid(uuid, integer) TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('enqueue_notification', 'enqueue_admin_notification')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
