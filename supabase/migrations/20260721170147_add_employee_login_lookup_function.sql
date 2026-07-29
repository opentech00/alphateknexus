/*
# Employee login by employee number

1. Purpose
   - The employee portal login now uses an Employee ID (employee_number, e.g. ATN-0001) instead of an email address.
   - Supabase Auth still requires email + password, so we need a way to resolve an employee_number to its email before calling signInWithPassword.
   - The employees table is locked behind RLS (is_admin() OR user_id = auth.uid()), so an unauthenticated employee cannot read it directly.

2. New Function
   - `get_employee_email_by_number(p_employee_number text)` returns `text` (the email).
   - SECURITY DEFINER so it bypasses RLS.
   - Returns NULL if no match, so the caller can show "invalid employee ID".
   - Accessible to `anon` and `authenticated` (the login screen runs as anon).

3. Security
   - Only exposes the email column for a given employee_number — not the password hash or any other row data.
   - The caller still must supply the correct password to Supabase Auth to obtain a session.
*/

CREATE OR REPLACE FUNCTION get_employee_email_by_number(p_employee_number text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM employees WHERE employee_number = p_employee_number LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_employee_email_by_number(text) TO anon, authenticated;
