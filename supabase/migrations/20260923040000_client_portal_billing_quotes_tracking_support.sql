/*
  Client portal: billing pay path, priced quotes, crew location, support tickets.

  - booking_quoted_total also reads quoted_total_sle
  - set_quote_price: admin or same-division staff prices a quote and marks it approved
  - respond_to_quote: the booking owner accepts or declines
  - client_crew_location: latest crew ping for a booking the caller owns
  - support_tickets / support_messages with owner + admin RLS and notifications
*/

CREATE OR REPLACE FUNCTION public.booking_quoted_total(p_details jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(p_details->>'quoted_total_sle', '')::numeric,
    NULLIF(p_details->>'total_sle', '')::numeric,
    NULLIF(p_details->>'price_sle', '')::numeric,
    NULLIF(p_details->>'amount_sle', '')::numeric
  );
$$;

CREATE OR REPLACE FUNCTION public.set_quote_price(p_booking_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking bookings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a price greater than zero.');
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quote not found.');
  END IF;
  IF COALESCE(v_booking.details->>'quote_request', '') NOT IN ('true', 't', '1') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request is not a quote.');
  END IF;
  IF v_booking.status NOT IN ('pending', 'pending_review', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This quote can no longer be priced.');
  END IF;

  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = v_uid
      AND e.service_id = v_booking.service_id
      AND COALESCE(e.status, 'active') = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot price this quote.');
  END IF;

  UPDATE bookings
  SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object(
        'quoted_total_sle', p_amount,
        'price_sle', p_amount
      ),
      status = 'approved',
      reviewed_by = v_uid,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_booking_id;

  IF v_booking.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, booking_id)
    VALUES (
      v_booking.user_id,
      'Your quote is ready',
      'A price is ready on your quote. Open Quotes to accept or decline.',
      'booking_update',
      p_booking_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'amount', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.set_quote_price(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_quote_price(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_quote(p_booking_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking bookings%ROWTYPE;
  v_quoted numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in.');
  END IF;
  IF p_action NOT IN ('accept', 'decline') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose accept or decline.');
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quote not found.');
  END IF;
  IF v_booking.user_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'This quote does not belong to you.');
  END IF;
  IF COALESCE(v_booking.details->>'quote_request', '') NOT IN ('true', 't', '1') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request is not a quote.');
  END IF;

  IF p_action = 'decline' THEN
    IF v_booking.status NOT IN ('pending', 'pending_review', 'approved') THEN
      RETURN jsonb_build_object('success', false, 'error', 'This quote can no longer be declined.');
    END IF;
    UPDATE bookings
    SET status = 'cancelled',
        cancellation_reason = 'Declined by client',
        details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('quote_decision', 'declined'),
        updated_at = now()
    WHERE id = p_booking_id;
    RETURN jsonb_build_object('success', true, 'status', 'cancelled');
  END IF;

  IF v_booking.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wait for a price before accepting.');
  END IF;
  v_quoted := public.booking_quoted_total(v_booking.details);
  IF v_quoted IS NULL OR v_quoted <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'This quote does not have a price yet.');
  END IF;

  UPDATE bookings
  SET status = 'confirmed',
      details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('quote_decision', 'accepted'),
      updated_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'status', 'confirmed', 'amount', v_quoted);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_quote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_quote(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.client_crew_location(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booking bookings%ROWTYPE;
  v_assignment field_assignments%ROWTYPE;
  v_lat double precision;
  v_lng double precision;
  v_at timestamptz;
  v_eta integer;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('available', false, 'error', 'You must be signed in.');
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND OR v_booking.user_id IS DISTINCT FROM v_uid OR v_booking.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('available', false, 'error', 'Booking not found.');
  END IF;
  IF v_booking.status NOT IN ('confirmed', 'in_progress') THEN
    RETURN jsonb_build_object('available', false, 'reason', 'not_active');
  END IF;

  SELECT * INTO v_assignment
  FROM field_assignments
  WHERE booking_id = p_booking_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'unassigned',
      'site_latitude', v_booking.latitude,
      'site_longitude', v_booking.longitude
    );
  END IF;

  SELECT p.latitude, p.longitude, p.created_at
  INTO v_lat, v_lng, v_at
  FROM field_location_pings p
  WHERE p.assignment_id = v_assignment.id
  ORDER BY p.created_at DESC
  LIMIT 1;

  SELECT e.eta_minutes INTO v_eta
  FROM field_job_events e
  WHERE e.assignment_id = v_assignment.id
    AND e.eta_minutes IS NOT NULL
  ORDER BY e.created_at DESC
  LIMIT 1;

  SELECT split_part(emp.full_name, ' ', 1) INTO v_name
  FROM employees emp
  WHERE emp.id = v_assignment.employee_id;

  RETURN jsonb_build_object(
    'available', v_lat IS NOT NULL AND v_lng IS NOT NULL,
    'latitude', v_lat,
    'longitude', v_lng,
    'recorded_at', v_at,
    'eta_minutes', v_eta,
    'crew_name', v_name,
    'assignment_status', v_assignment.status,
    'site_latitude', COALESCE(v_assignment.latitude, v_booking.latitude),
    'site_longitude', COALESCE(v_assignment.longitude, v_booking.longitude)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.client_crew_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_crew_location(uuid) TO authenticated;

-- ── Support tickets ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('billing', 'booking', 'quote', 'technical', 'other')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 140),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  attachment_path text,
  attachment_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_select" ON public.support_tickets;
CREATE POLICY "support_tickets_select" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "support_tickets_insert" ON public.support_tickets;
CREATE POLICY "support_tickets_insert" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'open');

DROP POLICY IF EXISTS "support_tickets_update" ON public.support_tickets;
CREATE POLICY "support_tickets_update" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR user_id = auth.uid())
  WITH CHECK (
    public.is_admin()
    OR (user_id = auth.uid() AND status = 'closed')
  );

DROP POLICY IF EXISTS "support_messages_select" ON public.support_messages;
CREATE POLICY "support_messages_select" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_messages_insert" ON public.support_messages;
CREATE POLICY "support_messages_insert" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.status <> 'closed'
        AND (
          (t.user_id = auth.uid() AND is_staff = false)
          OR (public.is_admin() AND is_staff = true)
        )
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_type_check'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;
END $$;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'booking_update', 'message', 'system',
    'field_dispatch', 'hr_update', 'payment',
    'assignment', 'incident', 'review_prompt',
    'subscription', 'announcement',
    'payslip_issued', 'hr_file_uploaded',
    'support'
  ));

CREATE OR REPLACE FUNCTION public.notify_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
BEGIN
  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, title, body, type, booking_id)
    VALUES (
      v_admin,
      'New support ticket',
      NEW.subject,
      'support',
      NEW.booking_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_support_ticket ON public.support_tickets;
CREATE TRIGGER trg_notify_support_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_support_ticket();

CREATE OR REPLACE FUNCTION public.notify_support_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_admin uuid;
BEGIN
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.is_staff THEN
    INSERT INTO public.notifications (user_id, title, body, type, booking_id)
    VALUES (
      v_ticket.user_id,
      'Support replied',
      left(NEW.body, 180),
      'support',
      v_ticket.booking_id
    );
    UPDATE public.support_tickets
    SET status = CASE WHEN status = 'closed' THEN status ELSE 'waiting' END,
        updated_at = now()
    WHERE id = v_ticket.id;
  ELSE
    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND id IS DISTINCT FROM NEW.sender_id LOOP
      INSERT INTO public.notifications (user_id, title, body, type, booking_id)
      VALUES (
        v_admin,
        'Support ticket updated',
        v_ticket.subject,
        'support',
        v_ticket.booking_id
      );
    END LOOP;
    UPDATE public.support_tickets
    SET status = CASE WHEN status IN ('resolved', 'closed') THEN status ELSE 'open' END,
        updated_at = now()
    WHERE id = v_ticket.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_support_message ON public.support_messages;
CREATE TRIGGER trg_notify_support_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_support_message();

ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
