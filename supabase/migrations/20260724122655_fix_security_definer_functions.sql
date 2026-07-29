-- Fix 1: is_admin() — only used inside RLS policies, never called via RPC.
-- Switch to SECURITY INVOKER and revoke direct EXECUTE so it can't be called
-- as an RPC by authenticated or anon users.
ALTER FUNCTION public.is_admin() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, authenticated, anon;

-- Fix 2: get_employee_email_by_number() — called from the employee login page
-- before the user is authenticated. It needs SECURITY DEFINER to read the
-- employees table (which has RLS), but should only be callable by anon
-- (pre-login), not by authenticated users who could enumerate employee emails.
-- Revoke from everyone, then grant only to anon.
ALTER FUNCTION public.get_employee_email_by_number(p_employee_number text) SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.get_employee_email_by_number(p_employee_number text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_email_by_number(p_employee_number text) TO anon;

-- Fix 3: generate_upcoming_pickups() — called from the SmartSort subscriptions
-- page with the user's own ID. As SECURITY INVOKER, RLS on smart_sort_subscriptions
-- and smart_sort_pickups applies, so users can only read their own subscriptions
-- and insert their own pickups. Safe to switch.
ALTER FUNCTION public.generate_upcoming_pickups(p_user_id uuid) SECURITY INVOKER;
