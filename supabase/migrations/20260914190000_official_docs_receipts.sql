/*
  Generate official payment receipts for every confirmed payment
  (cash, bank transfer, wallet, monime) on INSERT or UPDATE.

  Previously receipts were only created when a cash payment was UPDATED
  to confirmed, so invoice "mark paid" inserts never produced a receipt.
*/

CREATE OR REPLACE FUNCTION public.generate_cash_receipt_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_receipt_id uuid;
  purpose_text text;
  desc_text text;
  v_invoice_number text;
  v_title text;
  v_method text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  purpose_text := CASE NEW.payable_type
    WHEN 'wallet_topup' THEN 'wallet_topup'
    WHEN 'invoice' THEN 'invoice'
    WHEN 'subscription' THEN 'subscription'
    ELSE 'invoice'
  END;

  v_method := COALESCE(NULLIF(NEW.method, ''), 'cash');

  IF NEW.payable_type = 'invoice' AND NEW.payable_id IS NOT NULL THEN
    SELECT invoice_number INTO v_invoice_number FROM public.invoices WHERE id = NEW.payable_id;
  END IF;

  desc_text := CASE NEW.payable_type
    WHEN 'booking' THEN 'Payment for booking'
    WHEN 'invoice' THEN COALESCE('Payment for invoice ' || v_invoice_number, 'Payment for invoice')
    WHEN 'wallet_topup' THEN 'Wallet top-up'
    WHEN 'subscription' THEN 'Subscription payment'
    ELSE 'Payment received'
  END;

  SELECT id INTO existing_receipt_id
  FROM public.payment_receipts
  WHERE reference = NEW.reference
     OR (v_invoice_number IS NOT NULL AND reference = v_invoice_number)
  LIMIT 1;

  IF existing_receipt_id IS NULL THEN
    INSERT INTO public.payment_receipts (
      user_id, receipt_number, reference, amount_sle, currency,
      purpose, description, payment_method, paid_at
    ) VALUES (
      NEW.user_id,
      public.generate_receipt_number(),
      NEW.reference,
      ROUND(NEW.amount_sle)::integer,
      'SLE',
      purpose_text,
      desc_text,
      v_method,
      COALESCE(NEW.confirmed_at, now())
    );
  END IF;

  v_title := CASE v_method
    WHEN 'cash' THEN 'Cash Payment Confirmed'
    ELSE 'Payment Confirmed'
  END;

  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (
    NEW.user_id,
    v_title,
    'Your payment of SLE ' || trim(to_char(NEW.amount_sle, '999,999,990.00')) ||
      ' (' || NEW.reference || ') has been confirmed. A receipt is available in your transaction history.',
    CASE WHEN v_method = 'cash' THEN 'cash_payment_confirmed' ELSE 'payment_confirmed' END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_cash_receipt_on_confirm ON public.payments;
CREATE TRIGGER payments_cash_receipt_on_confirm
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_cash_receipt_on_confirm();

CREATE OR REPLACE FUNCTION public.generate_receipt_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF NOT (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  SELECT pr.id INTO existing_id
  FROM public.payment_receipts pr
  WHERE pr.user_id = NEW.user_id
    AND (
      pr.reference = NEW.invoice_number
      OR pr.reference IN (
        SELECT p.reference FROM public.payments p
        WHERE p.payable_type = 'invoice' AND p.payable_id = NEW.id
      )
    )
  LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.payment_receipts (
      user_id, receipt_number, reference, amount_sle, currency,
      purpose, description, payment_method, paid_at
    ) VALUES (
      NEW.user_id,
      public.generate_receipt_number(),
      NEW.invoice_number,
      ROUND(COALESCE(NEW.amount_paid, NEW.total, 0))::integer,
      COALESCE(NEW.currency, 'SLE'),
      'invoice',
      'Payment for invoice ' || NEW.invoice_number,
      COALESCE(NEW.payment_method, 'bank_transfer'),
      COALESCE(NEW.paid_at, now())
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_paid_receipt ON public.invoices;
CREATE TRIGGER trg_invoice_paid_receipt
  AFTER UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_receipt_on_invoice_paid();

CREATE OR REPLACE FUNCTION public.finance_invoice_from_booking(
  p_booking_id uuid,
  p_due_days integer DEFAULT 14,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_amount numeric;
  v_item text;
  v_desc text;
  v_approval uuid;
  v_invoice uuid;
  v_due integer;
  v_bill_name text;
  v_bill_addr text;
  v_notes text;
  v_lines jsonb;
BEGIN
  IF NOT public.finance_can_manage_ledgers() THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to invoice this request.');
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE booking_id = p_booking_id AND status <> 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request already has an invoice.');
  END IF;
  v_amount := COALESCE(public.booking_quoted_total(v_booking.details), 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Set a quote amount before invoicing.');
  END IF;
  v_due := GREATEST(COALESCE(p_due_days, 14), 1);
  v_item := COALESCE(
    NULLIF(v_booking.details->>'service_name', ''),
    CASE WHEN COALESCE(v_booking.details->>'quote_request', '') IN ('true', 't', '1') THEN 'Quoted service' ELSE 'Hired service' END
  );
  v_desc := COALESCE(
    NULLIF(BTRIM(COALESCE(v_booking.details->>'quote_notes', v_booking.notes, '')), ''),
    CASE WHEN COALESCE(v_booking.details->>'quote_request', '') IN ('true', 't', '1')
      THEN 'Quoted service'
      ELSE 'Hired service'
    END
  );
  v_bill_name := NULLIF(BTRIM(COALESCE(v_booking.details->>'company_name', v_booking.details->>'company', '')), '');
  v_bill_addr := NULLIF(BTRIM(COALESCE(v_booking.location, v_booking.details->>'address', '')), '');
  v_notes := jsonb_build_object(
    'bill_to_name', v_bill_name,
    'bill_to_address', v_bill_addr,
    'notes', NULLIF(BTRIM(COALESCE(p_note, '')), '')
  )::text;
  v_lines := jsonb_build_array(jsonb_build_object(
    'item', v_item,
    'description', v_desc,
    'unit_price', v_amount,
    'quantity', 1,
    'trips', '1',
    'total', v_amount
  ));

  IF public.is_super_admin() THEN
    INSERT INTO public.invoices (
      user_id, status, issue_date, due_date, currency,
      subtotal, tax_rate, tax_amount, total, amount_paid, notes, line_items, created_by, booking_id
    ) VALUES (
      v_booking.user_id, 'sent', CURRENT_DATE, CURRENT_DATE + v_due, 'SLE',
      v_amount, 0, 0, v_amount, 0,
      v_notes,
      v_lines,
      auth.uid()::text,
      p_booking_id
    )
    RETURNING id INTO v_invoice;
    PERFORM public.link_invoice_to_booking(v_invoice, p_booking_id);
    RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice, 'queued', false);
  END IF;

  v_approval := public.create_finance_approval(
    'invoice',
    jsonb_build_object(
      'user_id', v_booking.user_id,
      'booking_id', p_booking_id,
      'status', 'sent',
      'issue_date', CURRENT_DATE,
      'due_date', CURRENT_DATE + v_due,
      'currency', 'SLE',
      'subtotal', v_amount,
      'tax_rate', 0,
      'tax_amount', 0,
      'total', v_amount,
      'notes', v_notes,
      'line_items', v_lines
    ),
    p_booking_id,
    p_note,
    true
  );
  RETURN jsonb_build_object('success', true, 'approval_id', v_approval, 'queued', true);
END;
$$;
