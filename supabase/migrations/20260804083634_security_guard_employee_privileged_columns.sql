/*
  # Guard privileged employee columns

  Employees can update their own row (needed to clear the forced password
  change flag). That row also carries privilege and performance fields, so a
  non-admin session must not be able to alter them.

  1. New function
    - `guard_employee_privileged_columns()` rejects changes to role, service,
      status, employee number, performance, reporting line, ownership and the
      forced-password flag being switched back on, unless the session is an
      admin or the service role.
  2. Trigger
    - BEFORE UPDATE on `employees`.
*/

CREATE OR REPLACE FUNCTION public.guard_employee_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service role / internal jobs have no auth.uid()
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.employee_number IS DISTINCT FROM OLD.employee_number
     OR NEW.performance_score IS DISTINCT FROM OLD.performance_score
     OR NEW.jobs_completed IS DISTINCT FROM OLD.jobs_completed
     OR NEW.reports_to IS DISTINCT FROM OLD.reports_to
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR (NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
         AND NEW.must_change_password = true)
  THEN
    RAISE EXCEPTION 'insufficient_privilege: this field can only be changed by an administrator';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_privileged_columns ON public.employees;
CREATE TRIGGER trg_guard_employee_privileged_columns
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.guard_employee_privileged_columns();

REVOKE UPDATE, INSERT, DELETE ON public.employees FROM anon;
