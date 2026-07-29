/*
# Fix: is_admin() RLS recursion causing storage upload failures

## Problem
The `is_admin()` function reads from `profiles` to check if the current
user is an admin. The `admin_select_all_profiles` RLS policy on `profiles`
calls `is_admin()`. This creates infinite recursion:
  storage INSERT policy -> is_admin() -> profiles SELECT -> admin_select_all_profiles -> is_admin() -> ...

This recursion causes ALL storage uploads to employee-photos and
employee-resumes to fail with "new row violates row-level security policy".

## Fix
Make `is_admin()` SECURITY DEFINER so it runs with the function owner's
privileges and bypasses RLS on `profiles`. This breaks the recursion
because the inner `profiles` SELECT no longer triggers RLS policies.

## Security
- The function only reads (no writes).
- It only checks the role of auth.uid() — no privilege escalation.
- search_path is already set to `public`.
*/

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Recreate the policies that depend on is_admin() so they pick up the new function
-- (policies reference the function by name, so no drop/recreate needed, but we
--  ensure the function is correctly defined.)
