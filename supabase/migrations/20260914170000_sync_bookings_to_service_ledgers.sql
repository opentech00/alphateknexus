-- Auto-post quote/hire bookings into per-service finance ledgers.
-- Finance can set quoted amounts and record online or offline settlement.

ALTER TABLE public.service_finance_entries
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS settlement text NOT NULL DEFAULT 'recorded',
  ADD COLUMN IF NOT EXISTS request_type text,
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE public.service_finance_entries
  DROP CONSTRAINT IF EXISTS service_finance_entries_source_check;
ALTER TABLE public.service_finance_entries
  ADD CONSTRAINT service_finance_entries_source_check
  CHECK (source IN ('manual', 'booking'));

ALTER TABLE public.service_finance_entries
  DROP CONSTRAINT IF EXISTS service_finance_entries_channel_check;
ALTER TABLE public.service_finance_entries
  ADD CONSTRAINT service_finance_entries_channel_check
  CHECK (channel IS NULL OR channel IN ('online', 'offline', 'unpaid'));

ALTER TABLE public.service_finance_entries
  DROP CONSTRAINT IF EXISTS service_finance_entries_settlement_check;
ALTER TABLE public.service_finance_entries
  ADD CONSTRAINT service_finance_entries_settlement_check
  CHECK (settlement IN ('recorded', 'pending', 'collected', 'void', 'refunded'));

ALTER TABLE public.service_finance_entries
  DROP CONSTRAINT IF EXISTS service_finance_entries_request_type_check;
ALTER TABLE public.service_finance_entries
  ADD CONSTRAINT service_finance_entries_request_type_check
  CHECK (request_type IS NULL OR request_type IN ('quote', 'hire'));

CREATE UNIQUE INDEX IF NOT EXISTS service_finance_entries_one_per_booking
  ON public.service_finance_entries (booking_id)
  WHERE source = 'booking' AND booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_finance_entries_settlement_idx
  ON public.service_finance_entries (service_id, source, settlement);

CREATE OR REPLACE FUNCTION public.sync_service_ledger_from_booking(p_booking public.bookings)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal boolean;
  v_quoted numeric;
  v_request_type text;
  v_channel text;
  v_settlement text;
  v_category text;
  v_desc text;
  v_amount numeric;
  v_method text;
BEGIN
  IF p_booking.id IS NULL OR p_booking.service_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(is_internal, false) INTO v_internal
  FROM public.services
  WHERE id = p_booking.service_id;
  IF v_internal IS TRUE THEN
    RETURN;
  END IF;

  v_quoted := public.booking_quoted_total(p_booking.details);
  v_request_type := CASE
    WHEN COALESCE(p_booking.details->>'quote_request', '') IN ('true', 't', '1')
      OR COALESCE(p_booking.details->>'type', '') ILIKE '%quote%'
    THEN 'quote'
    ELSE 'hire'
  END;
  v_category := CASE WHEN v_request_type = 'quote' THEN 'quote' ELSE 'booking' END;
  v_method := p_booking.payment_method;

  IF v_method IN ('wallet', 'monime') THEN
    v_channel := 'online';
  ELSIF v_method IN ('cash', 'bank') THEN
    v_channel := 'offline';
  ELSE
    v_channel := 'unpaid';
  END IF;

  IF p_booking.deleted_at IS NOT NULL OR p_booking.status = 'cancelled' THEN
    v_settlement := 'void';
    v_amount := 0;
  ELSIF p_booking.payment_status = 'refunded' THEN
    v_settlement := 'refunded';
    v_amount := COALESCE(v_quoted, 0);
  ELSIF p_booking.payment_status IN ('paid', 'verified') THEN
    v_settlement := 'collected';
    v_amount := COALESCE(v_quoted, 0);
  ELSE
    v_settlement := 'pending';
    v_amount := COALESCE(v_quoted, 0);
  END IF;

  v_desc := format(
    '%s — %s',
    CASE WHEN v_request_type = 'quote' THEN 'Quote request' ELSE 'Hire request' END,
    COALESCE(NULLIF(BTRIM(p_booking.contact_name), ''), 'Client')
  );

  INSERT INTO public.service_finance_entries (
    service_id, entry_date, kind, category, amount_sle,
    description, reference, notes, booking_id,
    source, channel, settlement, request_type, payment_method
  ) VALUES (
    p_booking.service_id,
    (p_booking.created_at AT TIME ZONE 'UTC')::date,
    'revenue',
    v_category,
    v_amount,
    v_desc,
    COALESCE(p_booking.payment_status, 'pending'),
    CASE
      WHEN v_settlement = 'void' THEN 'Cancelled'
      WHEN v_settlement = 'refunded' THEN 'Refunded'
      WHEN v_method IS NOT NULL THEN 'Payment: ' || v_method
      ELSE NULL
    END,
    p_booking.id,
    'booking',
    v_channel,
    v_settlement,
    v_request_type,
    v_method
  )
  ON CONFLICT (booking_id) WHERE source = 'booking' AND booking_id IS NOT NULL
  DO UPDATE SET
    service_id = EXCLUDED.service_id,
    kind = 'revenue',
    category = EXCLUDED.category,
    amount_sle = EXCLUDED.amount_sle,
    description = EXCLUDED.description,
    reference = EXCLUDED.reference,
    notes = EXCLUDED.notes,
    source = 'booking',
    channel = EXCLUDED.channel,
    settlement = EXCLUDED.settlement,
    request_type = EXCLUDED.request_type,
    payment_method = EXCLUDED.payment_method,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_booking_to_service_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_service_ledger_from_booking(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booking_to_service_ledger ON public.bookings;
CREATE TRIGGER trg_sync_booking_to_service_ledger
  AFTER INSERT OR UPDATE OF service_id, details, status, payment_status, payment_method, contact_name, deleted_at
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_booking_to_service_ledger();

CREATE OR REPLACE FUNCTION public.finance_can_manage_ledgers()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin()
    OR public.is_admin_finance_staff()
    OR public.has_finance_permission('can_add_transactions')
    OR public.has_finance_permission('can_manage_invoices');
$$;

CREATE OR REPLACE FUNCTION public.finance_set_booking_quote(
  p_booking_id uuid,
  p_amount numeric,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF auth.uid() IS NULL OR NOT public.finance_can_manage_ledgers() THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to set quotes.');
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid amount.');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found.');
  END IF;
  IF v_booking.status = 'cancelled' OR v_booking.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request is cancelled.');
  END IF;

  UPDATE public.bookings
  SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object(
        'total_sle', p_amount,
        'quoted_by_finance', true,
        'quoted_at', now()
      ),
      notes = CASE
        WHEN p_note IS NULL OR BTRIM(p_note) = '' THEN notes
        ELSE COALESCE(notes || E'\n', '') || BTRIM(p_note)
      END
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_settle_booking(
  p_booking_id uuid,
  p_method text,
  p_amount numeric,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_method text;
  v_pay_method text;
  v_booking_method text;
  v_ref text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.finance_can_manage_ledgers() THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to record payments.');
  END IF;

  v_method := lower(BTRIM(COALESCE(p_method, '')));
  IF v_method NOT IN ('cash', 'bank', 'wallet', 'monime') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose cash, bank, wallet, or mobile money.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a payment amount greater than zero.');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found.');
  END IF;
  IF v_booking.status = 'cancelled' OR v_booking.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request is cancelled.');
  END IF;
  IF v_booking.payment_status IN ('paid', 'verified') THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already settled', 'idempotent', true);
  END IF;

  v_pay_method := CASE WHEN v_method = 'bank' THEN 'bank_transfer' ELSE v_method END;
  v_booking_method := CASE WHEN v_method = 'bank' THEN 'bank' ELSE v_method END;
  v_ref := NULLIF(BTRIM(COALESCE(p_reference, '')), '');
  IF v_ref IS NULL THEN
    IF v_method = 'cash' THEN
      v_ref := public.generate_cash_reference();
    ELSE
      v_ref := 'FIN-' || to_char(now(), 'YYYYMMDD') || '-' || substr(p_booking_id::text, 1, 8);
    END IF;
  END IF;

  UPDATE public.bookings
  SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('total_sle', p_amount)
  WHERE id = p_booking_id;

  UPDATE public.payments
  SET status = 'confirmed',
      amount_sle = p_amount,
      method = v_pay_method,
      confirmed_by = auth.uid(),
      confirmed_at = now(),
      reference = COALESCE(NULLIF(reference, ''), v_ref),
      notes = COALESCE(NULLIF(BTRIM(COALESCE(p_notes, '')), ''), notes, 'Recorded from service ledger')
  WHERE id = (
    SELECT p.id FROM public.payments p
    WHERE p.payable_type = 'booking'
      AND p.payable_id = p_booking_id
      AND p.status IN ('pending', 'collected')
    ORDER BY p.created_at DESC
    LIMIT 1
  );

  IF NOT FOUND THEN
    INSERT INTO public.payments (
      user_id, payable_type, payable_id, amount_sle, method, status,
      reference, confirmed_by, confirmed_at, notes
    ) VALUES (
      v_booking.user_id,
      'booking',
      p_booking_id,
      p_amount,
      v_pay_method,
      'confirmed',
      v_ref,
      auth.uid(),
      now(),
      COALESCE(NULLIF(BTRIM(COALESCE(p_notes, '')), ''), 'Recorded from service ledger')
    );
  END IF;

  UPDATE public.bookings
  SET payment_method = v_booking_method,
      payment_status = 'paid'
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'reference', v_ref, 'channel', CASE WHEN v_method IN ('wallet', 'monime') THEN 'online' ELSE 'offline' END);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_service_ledger_from_booking(public.bookings) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_sync_booking_to_service_ledger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_can_manage_ledgers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_set_booking_quote(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_settle_booking(uuid, text, numeric, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.finance_can_manage_ledgers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_set_booking_quote(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_settle_booking(uuid, text, numeric, text, text) TO authenticated;

DO $$
DECLARE
  r public.bookings;
BEGIN
  FOR r IN
    SELECT b.*
    FROM public.bookings b
    JOIN public.services s ON s.id = b.service_id
    WHERE COALESCE(s.is_internal, false) = false
  LOOP
    PERFORM public.sync_service_ledger_from_booking(r);
  END LOOP;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.service_finance_entries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
