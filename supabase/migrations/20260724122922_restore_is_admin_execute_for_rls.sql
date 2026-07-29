/*
# Restore EXECUTE on is_admin() for authenticated role

The previous migration (fix_security_definer_functions) revoked EXECUTE on is_admin()
from authenticated. However, RLS policies on profiles, wallet_transactions, bookings,
and other tables call is_admin() during row evaluation. When an authenticated user
queries these tables, PostgreSQL must execute is_admin() — revoking permission broke
all data access.

The function was already switched to SECURITY INVOKER (safe — it runs as the calling
user, not the function owner), so granting EXECUTE back does NOT re-introduce the
original vulnerability. The function simply checks profiles.role for the calling user.

## Changes
- GRANT EXECUTE on public.is_admin() TO authenticated
*/

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
