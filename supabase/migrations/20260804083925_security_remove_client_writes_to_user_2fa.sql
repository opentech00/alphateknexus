/*
  # Remove direct client writes to two-factor records

  All two-factor enrolment, verification and disabling goes through the
  `manage-2fa` edge function using the service role, which re-verifies the
  session and the TOTP code. The client-side DELETE and UPDATE policies let a
  signed-in user disable their own second factor (or clear its verified flag
  and attempt counters) without presenting a code, so they are removed.

  Reading remains available for the panel; inserts stay for backwards
  compatibility with enrolment through the function only.
*/

DROP POLICY IF EXISTS "delete_own_2fa" ON public.user_2fa;
DROP POLICY IF EXISTS "update_own_2fa" ON public.user_2fa;
DROP POLICY IF EXISTS "insert_own_2fa" ON public.user_2fa;

REVOKE INSERT, UPDATE, DELETE ON public.user_2fa FROM authenticated, anon;
