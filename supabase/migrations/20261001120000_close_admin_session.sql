/*
# Close latest admin session on logout

PostgREST cannot `.order().limit(1)` on UPDATE, so the client previously
failed to stamp logout_at. This RPC closes the newest open session for
the caller. close_all_admin_sessions marks every open row for sign-out-all.
*/

CREATE OR REPLACE FUNCTION public.close_latest_admin_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_sessions
  SET logout_at = now()
  WHERE id = (
    SELECT id
    FROM public.admin_sessions
    WHERE user_id = auth.uid()
      AND logout_at IS NULL
    ORDER BY login_at DESC
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_all_admin_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_sessions
  SET logout_at = now()
  WHERE user_id = auth.uid()
    AND logout_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.close_latest_admin_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_all_admin_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_latest_admin_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_all_admin_sessions() TO authenticated;
