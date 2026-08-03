/*
# Uber-style Dispatch Offers System for Field Workers

## Purpose
When a client books a dispatch service, the system automatically broadcasts a "dispatch offer"
to all eligible field workers in that division. Workers can accept or decline directly from
their app — no admin needed for initial assignment. If all workers decline or the offer
expires, admins are notified to manually assign.

## New Tables
- `dispatch_offers` — main offer record (booking_id, service_id, status, expires_at, accepted_by)
- `dispatch_offer_responses` — per-worker response (offer_id, employee_id, status: pending/accepted/declined)

## Triggers
- `trg_booking_create_dispatch_offer` (AFTER INSERT on bookings) — creates offer + broadcasts to workers + sends notifications
- Helper functions: `accept_dispatch_offer`, `decline_dispatch_offer`, `expire_stale_dispatch_offers`

## Security
- Admins: full CRUD on both tables
- Workers: SELECT offers where they have a response row; UPDATE only their own response
- Clients: SELECT offers for their own bookings
*/

-- ═════════════════════════════════════════════════════════════
-- 1. Create dispatch_offers table (no RLS yet)
-- ═════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dispatch_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz,
  accepted_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES field_assignments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_offers_status ON dispatch_offers(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_offers_booking ON dispatch_offers(booking_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_offers_service ON dispatch_offers(service_id);

-- ═════════════════════════════════════════════════════════════
-- 2. Create dispatch_offer_responses table
-- ═════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dispatch_offer_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES dispatch_offers(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_offer_responses_unique
  ON dispatch_offer_responses(offer_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_offer_responses_employee ON dispatch_offer_responses(employee_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_offer_responses_status ON dispatch_offer_responses(status);

-- ═════════════════════════════════════════════════════════════
-- 3. Enable RLS on both tables
-- ═════════════════════════════════════════════════════════════

ALTER TABLE dispatch_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_offer_responses ENABLE ROW LEVEL SECURITY;

-- Policies for dispatch_offers
DROP POLICY IF EXISTS "admin_all_dispatch_offers" ON dispatch_offers;
CREATE POLICY "admin_all_dispatch_offers" ON dispatch_offers
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "worker_select_dispatch_offers" ON dispatch_offers;
CREATE POLICY "worker_select_dispatch_offers" ON dispatch_offers
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM dispatch_offer_responses dor
      WHERE dor.offer_id = dispatch_offers.id
      AND dor.employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = dispatch_offers.booking_id
      AND b.user_id = auth.uid()
    )
  );

-- Policies for dispatch_offer_responses
DROP POLICY IF EXISTS "admin_all_offer_responses" ON dispatch_offer_responses;
CREATE POLICY "admin_all_offer_responses" ON dispatch_offer_responses
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "worker_select_own_responses" ON dispatch_offer_responses;
CREATE POLICY "worker_select_own_responses" ON dispatch_offer_responses
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "worker_update_own_response" ON dispatch_offer_responses;
CREATE POLICY "worker_update_own_response" ON dispatch_offer_responses
  FOR UPDATE TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

-- ═════════════════════════════════════════════════════════════
-- 4. Helper: accept_dispatch_offer
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION accept_dispatch_offer(p_offer_id uuid, p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offer RECORD;
  v_booking RECORD;
  v_assignment_id uuid;
  v_service_name text;
BEGIN
  SELECT * INTO v_offer FROM dispatch_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer not found');
  END IF;
  IF v_offer.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer is no longer available');
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = v_offer.booking_id;
  IF v_booking IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  SELECT name INTO v_service_name FROM services WHERE id = v_offer.service_id;

  INSERT INTO field_assignments (
    employee_id, service_id, service_name, customer_name, address,
    scheduled_date, scheduled_time, instructions, status, booking_id
  ) VALUES (
    p_employee_id,
    v_offer.service_id,
    COALESCE(v_service_name, 'Service'),
    v_booking.contact_name,
    COALESCE(v_booking.location, ''),
    v_booking.scheduled_date,
    COALESCE(v_booking.scheduled_time::text, ''),
    COALESCE(v_booking.notes, ''),
    'accepted',
    v_offer.booking_id
  )
  RETURNING id INTO v_assignment_id;

  UPDATE dispatch_offers
  SET status = 'accepted',
      accepted_by_employee_id = p_employee_id,
      assignment_id = v_assignment_id,
      updated_at = now()
  WHERE id = p_offer_id;

  UPDATE dispatch_offer_responses
  SET status = 'accepted', responded_at = now()
  WHERE offer_id = p_offer_id AND employee_id = p_employee_id;

  UPDATE dispatch_offer_responses
  SET status = 'declined', responded_at = now()
  WHERE offer_id = p_offer_id AND employee_id != p_employee_id AND status = 'pending';

  UPDATE bookings SET status = 'confirmed', updated_at = now() WHERE id = v_offer.booking_id;

  PERFORM enqueue_notification(
    v_booking.user_id, 'client', 'booking_confirmed',
    'Job Confirmed', 'A field worker has accepted your booking. They will arrive at the scheduled time.',
    'bookings', jsonb_build_object('booking_id', v_offer.booking_id, 'assignment_id', v_assignment_id)
  );

  PERFORM enqueue_admin_notification(
    'dispatch_accepted', 'Dispatch Offer Accepted',
    'Worker ' || COALESCE((SELECT full_name FROM employees WHERE id = p_employee_id), 'Unknown') ||
    ' accepted the dispatch offer for booking ' || v_offer.booking_id::text,
    'field_dispatch',
    jsonb_build_object('offer_id', p_offer_id, 'booking_id', v_offer.booking_id, 'assignment_id', v_assignment_id)
  );

  RETURN jsonb_build_object('success', true, 'assignment_id', v_assignment_id, 'offer_id', p_offer_id);
END $$;

-- ═════════════════════════════════════════════════════════════
-- 5. Helper: decline_dispatch_offer
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION decline_dispatch_offer(p_offer_id uuid, p_employee_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offer RECORD;
  v_remaining_count integer;
BEGIN
  SELECT * INTO v_offer FROM dispatch_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer not found');
  END IF;
  IF v_offer.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer is no longer available');
  END IF;

  UPDATE dispatch_offer_responses
  SET status = 'declined', responded_at = now()
  WHERE offer_id = p_offer_id AND employee_id = p_employee_id;

  SELECT COUNT(*) INTO v_remaining_count
  FROM dispatch_offer_responses
  WHERE offer_id = p_offer_id AND status = 'pending';

  IF v_remaining_count = 0 THEN
    PERFORM enqueue_admin_notification(
      'dispatch_all_declined', 'All Workers Declined — Manual Assignment Needed',
      'All field workers declined the dispatch offer for booking ' || v_offer.booking_id::text ||
      '. Please assign manually from the dispatch dashboard.',
      'field_dispatch',
      jsonb_build_object('offer_id', p_offer_id, 'booking_id', v_offer.booking_id, 'reason', 'all_declined')
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'remaining_pending', v_remaining_count);
END $$;

-- ═════════════════════════════════════════════════════════════
-- 6. Helper: expire_stale_dispatch_offers
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION expire_stale_dispatch_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offer RECORD;
  v_count integer := 0;
BEGIN
  FOR v_offer IN
    SELECT * FROM dispatch_offers
    WHERE status = 'open' AND expires_at < now()
  LOOP
    UPDATE dispatch_offers SET status = 'expired', updated_at = now() WHERE id = v_offer.id;

    PERFORM enqueue_admin_notification(
      'dispatch_expired', 'Dispatch Offer Expired — Manual Assignment Needed',
      'The dispatch offer for booking ' || v_offer.booking_id::text ||
      ' has expired with no acceptances. Please assign manually.',
      'field_dispatch',
      jsonb_build_object('offer_id', v_offer.id, 'booking_id', v_offer.booking_id, 'reason', 'expired')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION accept_dispatch_offer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_dispatch_offer(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION expire_stale_dispatch_offers() TO authenticated;

-- ═════════════════════════════════════════════════════════════
-- 7. Trigger: create dispatch offer on new booking
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_dispatch_offer_for_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offer_id uuid;
  v_employee RECORD;
  v_expires_at timestamptz;
  v_service_name text;
BEGIN
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  v_expires_at := LEAST(
    NEW.scheduled_date::timestamptz + COALESCE(NEW.scheduled_time, '09:00'::time) - interval '30 minutes',
    now() + interval '2 hours'
  );
  IF v_expires_at < now() THEN
    v_expires_at := now() + interval '30 minutes';
  END IF;

  SELECT name INTO v_service_name FROM services WHERE id = NEW.service_id;

  INSERT INTO dispatch_offers (booking_id, service_id, status, expires_at)
  VALUES (NEW.id, NEW.service_id, 'open', v_expires_at)
  RETURNING id INTO v_offer_id;

  FOR v_employee IN
    SELECT e.id, e.user_id, e.full_name
    FROM employees e
    WHERE e.service_id = NEW.service_id
    AND e.status = 'active'
    AND e.user_id IS NOT NULL
  LOOP
    INSERT INTO dispatch_offer_responses (offer_id, employee_id, status)
    VALUES (v_offer_id, v_employee.id, 'pending')
    ON CONFLICT (offer_id, employee_id) DO NOTHING;

    PERFORM enqueue_notification(
      v_employee.user_id,
      'field',
      'dispatch_offer',
      'New Job Available',
      'A new dispatch job is available: ' || COALESCE(v_service_name, 'Service') ||
      ' for ' || COALESCE(NEW.contact_name, 'Customer') ||
      ' on ' || NEW.scheduled_date::text ||
      CASE WHEN NEW.scheduled_time IS NOT NULL THEN ' at ' || NEW.scheduled_time::text ELSE '' END ||
      '. Location: ' || COALESCE(NEW.location, 'TBA'),
      'field_dispatch',
      jsonb_build_object(
        'offer_id', v_offer_id,
        'booking_id', NEW.id,
        'service_slug', (SELECT slug FROM services WHERE id = NEW.service_id),
        'customer_name', NEW.contact_name,
        'scheduled_date', NEW.scheduled_date,
        'location', NEW.location
      )
    );
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_create_dispatch_offer ON bookings;
CREATE TRIGGER trg_booking_create_dispatch_offer
  AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION create_dispatch_offer_for_booking();

-- ═════════════════════════════════════════════════════════════
-- 8. Enable realtime for dispatch tables
-- ═════════════════════════════════════════════════════════════

ALTER TABLE dispatch_offers REPLICA IDENTITY FULL;
ALTER TABLE dispatch_offer_responses REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dispatch_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dispatch_offers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dispatch_offer_responses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dispatch_offer_responses;
  END IF;
END $$;
