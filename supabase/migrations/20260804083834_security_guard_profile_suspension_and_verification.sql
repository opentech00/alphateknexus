/*
  # Guard privileged profile columns

  `update_own_profile` lets a user update every column of their own profile
  row, including the suspension and verification flags that are meant to be
  set by staff only. The existing role guard is extended to cover them.
*/

CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Permission denied: only admins can change user roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.is_suspended IS DISTINCT FROM NEW.is_suspended THEN
    RAISE EXCEPTION 'Permission denied: only admins can change suspension state'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.is_verified IS DISTINCT FROM NEW.is_verified THEN
    RAISE EXCEPTION 'Permission denied: only admins can change verification state'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
