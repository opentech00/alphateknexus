/*
  # Bind dispatch offer responses to the calling worker

  `accept_dispatch_offer` and `decline_dispatch_offer` trusted the
  `p_employee_id` argument, so any signed-in caller could accept or decline a
  job on behalf of another worker. The employee is now resolved from the
  session and the argument is only accepted when it matches.

  1. Changes
    - both functions resolve the caller's employee row via `auth.uid()`
    - the caller must actually have been offered the job
    - `search_path` pinned; `anon` cannot execute
    - `expire_stale_dispatch_offers` is internal-only
*/

CREATE OR REPLACE FUNCTION accept_dispatch_offer(p_offer_id uuid, p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer RECORD;
  v_booking RECORD;
  v_assignment_id uuid;
  v_service_name text;
  v_employee_id uuid;
  v_was_offered boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    v_employee_id := p_employee_id;
  ELSE
    SELECT id INTO v_employee_id FROM employees
    WHERE user_id = auth.uid() AND status = 'active'
    LIMIT 1;

    IF v_employee_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorised');
    END IF;
    IF p_employee_id IS NOT NULL AND p_employee_id <> v_employee_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorised');
    END IF;
  END IF;

  SELECT * INTO v_offer FROM dispatch_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer not found');
  END IF;
  IF v_offer.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer is no longer available');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM dispatch_offer_responses
    WHERE offer_id = p_offer_id AND employee_id = v_employee_id
  ) INTO v_was_offered;
  IF NOT v_was_offered THEN
    RETURN jsonb_build_object('success', false, 'error', 'This job was not offered to you');
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
    v_employee_id,
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
      accepted_by_employee_id = v_employee_id,
      assignment_id = v_assignment_id,
      updated_at = now()
  WHERE id = p_offer_id;

  UPDATE dispatch_offer_responses
  SET status = 'accepted', responded_at = now()
  WHERE offer_id = p_offer_id AND employee_id = v_employee_id;

  UPDATE dispatch_offer_responses
  SET status = 'declined', responded_at = now()
  WHERE offer_id = p_offer_id AND employee_id != v_employee_id AND status = 'pending';

  UPDATE bookings SET status = 'confirmed', updated_at = now() WHERE id = v_offer.booking_id;

  PERFORM enqueue_notification(
    v_booking.user_id, 'client', 'booking_confirmed',
    'Job Confirmed', 'A field worker has accepted your booking. They will arrive at the scheduled time.',
    'bookings', jsonb_build_object('booking_id', v_offer.booking_id, 'assignment_id', v_assignment_id)
  );

  PERFORM enqueue_admin_notification(
    'dispatch_accepted', 'Dispatch Offer Accepted',
    'Worker ' || COALESCE((SELECT full_name FROM employees WHERE id = v_employee_id), 'Unknown') ||
    ' accepted the dispatch offer for booking ' || v_offer.booking_id::text,
    'field_dispatch',
    jsonb_build_object('offer_id', p_offer_id, 'booking_id', v_offer.booking_id, 'assignment_id', v_assignment_id)
  );

  RETURN jsonb_build_object('success', true, 'assignment_id', v_assignment_id, 'offer_id', p_offer_id);
END $$;

CREATE OR REPLACE FUNCTION decline_dispatch_offer(p_offer_id uuid, p_employee_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer RECORD;
  v_remaining_count integer;
  v_employee_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    v_employee_id := p_employee_id;
  ELSE
    SELECT id INTO v_employee_id FROM employees
    WHERE user_id = auth.uid() AND status = 'active'
    LIMIT 1;

    IF v_employee_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorised');
    END IF;
    IF p_employee_id IS NOT NULL AND p_employee_id <> v_employee_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorised');
    END IF;
  END IF;

  SELECT * INTO v_offer FROM dispatch_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer not found');
  END IF;
  IF v_offer.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offer is no longer available');
  END IF;

  UPDATE dispatch_offer_responses
  SET status = 'declined', responded_at = now()
  WHERE offer_id = p_offer_id AND employee_id = v_employee_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'This job was not offered to you');
  END IF;

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

CREATE OR REPLACE FUNCTION expire_stale_dispatch_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION accept_dispatch_offer(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION decline_dispatch_offer(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION expire_stale_dispatch_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION accept_dispatch_offer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_dispatch_offer(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION expire_stale_dispatch_offers() TO service_role;
