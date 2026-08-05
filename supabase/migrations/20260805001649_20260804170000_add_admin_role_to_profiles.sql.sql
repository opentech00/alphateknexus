/*
# Grant Admin Access to Employees via HR Roles

## Purpose
Currently the admin panel uses a binary check: profiles.role = 'admin' grants
full access to every page. The HR permissions matrix (hr_role_permissions)
exists but is not enforced. This migration connects the two systems:

1. Adds `admin_role_id` to profiles — links a user's admin access to an HR role
2. Creates a SECURITY DEFINER function `grant_admin_access(employee_id, role_id)`
   that promotes an employee to admin by setting profiles.role = 'admin' and
   linking the HR role. Only callable by existing admins.
3. Creates a SECURITY DEFINER function `revoke_admin_access(employee_id)` that
   removes admin access by resetting profiles.role to 'user' and clearing
   admin_role_id. Only callable by existing admins.
4. Adds a SELECT policy so authenticated users can read their own admin_role_id
   (needed by the frontend to know which pages they can access).

## Security
- The grant/revoke functions check is_admin() internally — only existing admins
  can promote or revoke admin access.
- profiles.role is locked down (only the SECURITY DEFINER functions can change it)
  per the existing security hardening migrations.
- The admin_role_id column allows NULL — users with role='admin' and NULL
  admin_role_id are super admins with full access (backward compatible).

## Backward Compatibility
- Existing admins with no admin_role_id retain full access (super admin behavior)
- Only employees with a linked HR role get scoped permissions
*/

-- Add admin_role_id column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_role_id uuid;

-- Add foreign key constraint (IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_admin_role_id_fkey'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_admin_role_id_fkey
      FOREIGN KEY (admin_role_id) REFERENCES hr_roles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Grant admin access function
CREATE OR REPLACE FUNCTION grant_admin_access(target_employee_id uuid, role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only existing admins can grant admin access
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can grant admin access';
  END IF;

  -- Update the profile linked to this employee's user_id
  UPDATE profiles
  SET role = 'admin',
      admin_role_id = role_id
  WHERE id = (
    SELECT user_id FROM employees WHERE id = target_employee_id
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee has no linked user account';
  END IF;
END;
$$;

-- Revoke admin access function
CREATE OR REPLACE FUNCTION revoke_admin_access(target_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only existing admins can revoke admin access
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can revoke admin access';
  END IF;

  -- Reset the profile to regular user
  UPDATE profiles
  SET role = 'user',
      admin_role_id = NULL
  WHERE id = (
    SELECT user_id FROM employees WHERE id = target_employee_id
  );
END;
$$;

-- Revoke public execute and grant only to authenticated
REVOKE EXECUTE ON FUNCTION grant_admin_access(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION revoke_admin_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_admin_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_admin_access(uuid) TO authenticated;

-- Allow users to read their own admin_role_id (already covered by existing
-- self-read policy on profiles, but make sure admin_role_id is included)
-- The existing policy "Users can view own profile" already does SELECT *
-- so admin_role_id is already readable by the owner.