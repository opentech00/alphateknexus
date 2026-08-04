/*
  # Narrow get_employee_email_by_number to active employees

  The staff login lookup function returned email for any employee matching the
  number, including suspended or inactive staff. Tighten it to active employees
  only so deactivated staff cannot use the login flow.

  anon EXECUTE is retained because this runs before the caller has a session
  (pre-auth staff login).
*/

CREATE OR REPLACE FUNCTION public.get_employee_email_by_number(p_employee_number text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM employees
  WHERE employee_number = p_employee_number
    AND status = 'active'
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_employee_email_by_number(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_email_by_number(text) TO anon, authenticated;
