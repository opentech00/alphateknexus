/*
  # Restrict payment_audit_log inserts to admins

  The `insert_audit_log` INSERT policy had `WITH CHECK (true)`, so any
  authenticated user could insert arbitrary rows into `payment_audit_log`,
  polluting the audit trail or injecting misleading records.

  The audit trail is written by a SECURITY DEFINER trigger
  (`log_payment_status_change`) which bypasses RLS, so the INSERT policy only
  affects direct client inserts. No client code writes to this table; only
  admins should be able to insert directly if ever needed.

  1. Changes
     - Replace `insert_audit_log` with an admin-only INSERT policy.
*/

DROP POLICY IF EXISTS "insert_audit_log" ON public.payment_audit_log;

CREATE POLICY "insert_audit_log" ON public.payment_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
