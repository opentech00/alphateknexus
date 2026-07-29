/*
# Add must_change_password to employees

1. Changes
- Adds `must_change_password boolean NOT NULL DEFAULT true` to the `employees` table.
- New employees created by an admin will have this set to `true`, forcing a
  password change on first login to the Employee Portal.
- Existing rows default to `true` as well; admins can clear it manually if needed.

2. Security
- No RLS policy changes. The column is readable by the employee owner
  (existing `select_employees` policy already covers all columns).
- Employees can update their own row via the existing `update_employees`
  policy, so the frontend can clear the flag after a successful password change.
*/

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;
