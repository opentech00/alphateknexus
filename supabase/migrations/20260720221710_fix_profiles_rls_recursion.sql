/*
# Fix infinite recursion in RLS policies referencing profiles

## Problem
PostgreSQL error 42P17 ("infinite recursion detected in policy for relation profiles")
was thrown on EVERY query to services and bookings, because several admin RLS policies
contained a sub-select back onto the `profiles` table:

    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')

Evaluating a SELECT policy on `profiles` requires reading `profiles`, which re-triggers
the same SELECT policy -> infinite recursion. Because Postgres ORs all applicable SELECT
policies for a table, even tables with a valid non-recursive policy (e.g.
`anyone_can_read_active_services`) were broken whenever the recursive admin policy also
applied to the authenticated user.

## Fix
1. Add a `SECURITY DEFINER` helper `is_admin()` that reads `profiles` as the privileged
   owner, bypassing RLS. This is the canonical Supabase pattern for breaking self-referential
   policy recursion. The function is STABLE and pinned to `search_path = public` to harden
   against search-path hijacking.
2. Rewrite every admin policy on `profiles`, `services`, and `bookings` to call
   `is_admin()` instead of sub-selecting `profiles`. Behavior is unchanged (same
   ownership / admin check), but the recursion is eliminated.

## Tables / policies affected
- `profiles`  -> `admin_select_all_profiles` (rewritten)
- `services`  -> `admin_select_all_services`, `admin_insert_services`,
                 `admin_update_services`, `admin_delete_services` (rewritten)
- `bookings`  -> `admin_select_all_bookings`, `admin_update_all_bookings` (rewritten)

## Security
- RLS remains enabled on all tables.
- Owner-scoped policies (select/insert/update/delete own rows) are untouched.
- The public read policy `anyone_can_read_active_services` is untouched.
- `is_admin()` is SECURITY DEFINER; only grants the ability to read the caller's own
  admin flag. No new write paths are opened.
*/

-- 1. Helper function: breaks the recursion by reading profiles as the function owner.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 2. profiles: replace the self-referential admin SELECT policy.
DROP POLICY IF EXISTS "admin_select_all_profiles" ON public.profiles;
CREATE POLICY "admin_select_all_profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 3. services: replace all admin policies that referenced profiles.
DROP POLICY IF EXISTS "admin_select_all_services" ON public.services;
CREATE POLICY "admin_select_all_services"
  ON public.services FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_services" ON public.services;
CREATE POLICY "admin_insert_services"
  ON public.services FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_services" ON public.services;
CREATE POLICY "admin_update_services"
  ON public.services FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_services" ON public.services;
CREATE POLICY "admin_delete_services"
  ON public.services FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 4. bookings: replace all admin policies that referenced profiles.
DROP POLICY IF EXISTS "admin_select_all_bookings" ON public.bookings;
CREATE POLICY "admin_select_all_bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_update_all_bookings" ON public.bookings;
CREATE POLICY "admin_update_all_bookings"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
