-- One in-app reminder before a Smart Sort invoice is due, and one when it becomes overdue.
ALTER TABLE public.smart_sort_invoices
  ADD COLUMN IF NOT EXISTS due_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS overdue_notice_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.notify_smart_sort_invoice_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT id, user_id, invoice_number, due_date, amount_sle, amount_paid_sle
    FROM public.smart_sort_invoices
    WHERE status IN ('pending', 'partial')
      AND due_reminder_sent_at IS NULL
      AND due_date >= CURRENT_DATE
      AND due_date <= CURRENT_DATE + 3
      AND amount_paid_sle < amount_sle
  LOOP
    PERFORM public.enqueue_notification(
      v_row.user_id,
      'client',
      'smart_sort_invoice_due',
      'Smart Sort invoice due soon',
      v_row.invoice_number || ' is due on ' || to_char(v_row.due_date, 'DD Mon YYYY') || '. SLE '
        || (v_row.amount_sle - v_row.amount_paid_sle)::text || ' is still unpaid.',
      'smart_sort',
      jsonb_build_object('invoice_id', v_row.id, 'invoice_number', v_row.invoice_number)
    );
    UPDATE public.smart_sort_invoices
    SET due_reminder_sent_at = now()
    WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;

  FOR v_row IN
    SELECT id, user_id, invoice_number, due_date, amount_sle, amount_paid_sle
    FROM public.smart_sort_invoices
    WHERE status = 'overdue'
      AND overdue_notice_sent_at IS NULL
      AND amount_paid_sle < amount_sle
  LOOP
    PERFORM public.enqueue_notification(
      v_row.user_id,
      'client',
      'smart_sort_invoice_overdue',
      'Smart Sort invoice overdue',
      v_row.invoice_number || ' is overdue. SLE '
        || (v_row.amount_sle - v_row.amount_paid_sle)::text || ' is still unpaid.',
      'smart_sort',
      jsonb_build_object('invoice_id', v_row.id, 'invoice_number', v_row.invoice_number)
    );
    UPDATE public.smart_sort_invoices
    SET overdue_notice_sent_at = now()
    WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_smart_sort_invoice_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_smart_sort_invoice_reminders() TO service_role;

DO $$
DECLARE
  job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'smart_sort_nightly_invoices';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
  PERFORM cron.schedule(
    'smart_sort_nightly_invoices',
    '30 2 * * *',
    $cron$SELECT public.generate_smart_sort_invoices(); SELECT public.mark_overdue_smart_sort_invoices(); SELECT public.notify_smart_sort_invoice_reminders();$cron$
  );
END $$;
