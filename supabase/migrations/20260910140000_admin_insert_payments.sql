-- Allow admins to record invoice/cash payments on behalf of a client.
DROP POLICY IF EXISTS "admin_insert_payments" ON public.payments;
CREATE POLICY "admin_insert_payments" ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
