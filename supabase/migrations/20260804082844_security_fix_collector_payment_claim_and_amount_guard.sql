/*
  # Cash collector permissions (F21, follow-up)

  - Allow a collector to claim an unassigned pending cash payment (the flow the
    employee app actually uses) while still forbidding self-confirmation.
  - Add a guard trigger so a non-admin cannot rewrite the amount of a payment.
*/

DROP POLICY IF EXISTS "collector_update_payments" ON public.payments;
CREATE POLICY "collector_update_payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (status = 'pending' AND (collector_id IS NULL OR collector_id = auth.uid()))
  WITH CHECK (collector_id = auth.uid() AND status = 'collected');

CREATE OR REPLACE FUNCTION public.guard_payment_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount_sle IS DISTINCT FROM OLD.amount_sle THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Permission denied: the payment amount cannot be changed'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payment_amount ON public.payments;
CREATE TRIGGER trg_guard_payment_amount
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_amount();
