-- Replace leftover Kenyan shilling labels with Sierra Leone leones (SLE).

UPDATE public.services
SET price_range = regexp_replace(
  regexp_replace(price_range, '\yKShs?\y', 'SLE', 'gi'),
  '\yKES\y',
  'SLE',
  'gi'
)
WHERE price_range ~* '\y(KES|KShs?)\y';

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_articles'
      AND column_name = 'body'
  ) THEN
    UPDATE public.knowledge_articles
    SET
      title = regexp_replace(title, '\yKES\y', 'SLE', 'gi'),
      body = regexp_replace(body, '\yKES\y', 'SLE', 'gi')
    WHERE title ~* '\yKES\y' OR body ~* '\yKES\y';
  END IF;

  FOREACH t IN ARRAY ARRAY['invoices', 'payment_receipts', 'monime_payments', 'hr_payslips']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'currency'
    ) THEN
      EXECUTE format(
        'UPDATE public.%I SET currency = ''SLE'' WHERE upper(trim(currency)) IN (''KES'', ''KSH'', ''LE'')',
        t
      );
    END IF;
  END LOOP;
END $$;
