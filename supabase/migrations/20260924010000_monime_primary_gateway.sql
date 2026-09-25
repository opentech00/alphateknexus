-- Monime as primary client payment rail: webhook uniqueness, ledger precision, admin metadata.

ALTER TABLE public.monime_payments
  ADD COLUMN IF NOT EXISTS webhook_event_id text,
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS channel text;

CREATE UNIQUE INDEX IF NOT EXISTS monime_payments_webhook_event_id_uidx
  ON public.monime_payments (webhook_event_id)
  WHERE webhook_event_id IS NOT NULL;

-- Keep one Smart Sort payment per Monime session.
DELETE FROM public.smart_sort_payments a
USING public.smart_sort_payments b
WHERE a.monime_payment_id IS NOT NULL
  AND a.monime_payment_id = b.monime_payment_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS smart_sort_payments_monime_payment_id_uidx
  ON public.smart_sort_payments (monime_payment_id)
  WHERE monime_payment_id IS NOT NULL;

-- Numeric increment so SLE fractions are not rounded away.
-- Drop the integer overload so PostgREST/rpc has a single signature.
DROP FUNCTION IF EXISTS public.increment_invoice_paid(uuid, integer);

CREATE OR REPLACE FUNCTION public.increment_invoice_paid(p_invoice_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.smart_sort_invoices
  SET amount_paid_sle = COALESCE(amount_paid_sle, 0) + p_amount,
      updated_at = now(),
      status = CASE
        WHEN status = 'void' THEN status
        WHEN COALESCE(amount_paid_sle, 0) + p_amount >= amount_sle THEN 'paid'
        WHEN COALESCE(amount_paid_sle, 0) + p_amount > 0 THEN 'partial'
        ELSE status
      END,
      paid_at = CASE
        WHEN status <> 'void' AND COALESCE(amount_paid_sle, 0) + p_amount >= amount_sle
          THEN COALESCE(paid_at, now())
        ELSE paid_at
      END
  WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_invoice_paid(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_invoice_paid(uuid, numeric) TO service_role;
