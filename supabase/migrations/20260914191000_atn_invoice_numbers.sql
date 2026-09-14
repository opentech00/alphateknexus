-- Invoice numbers: atn-inv-001, atn-inv-002, ...
-- Existing INV-YYYY-NNNN rows keep their numbers; new rows use the ATN format.

CREATE OR REPLACE FUNCTION public.generate_atn_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_n integer;
  v_candidate text;
BEGIN
  LOOP
    SELECT COALESCE(MAX((regexp_match(invoice_number, '^atn-inv-(\d+)$'))[1]::integer), 0) + 1
      INTO v_n
    FROM public.invoices;
    v_candidate := 'atn-inv-' || lpad(v_n::text, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.invoices WHERE invoice_number = v_candidate
    );
  END LOOP;
  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.peek_atn_invoice_number()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'atn-inv-' || lpad((
    COALESCE((
      SELECT MAX((regexp_match(invoice_number, '^atn-inv-(\d+)$'))[1]::integer)
      FROM public.invoices
    ), 0) + 1
  )::text, 3, '0');
$$;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number SET DEFAULT public.generate_atn_invoice_number();

REVOKE ALL ON FUNCTION public.peek_atn_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_atn_invoice_number() TO authenticated;
