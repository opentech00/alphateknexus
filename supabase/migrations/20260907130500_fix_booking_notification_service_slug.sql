/*
  Fix runtime trigger error:
  record "new" has no field "service_slug"

  bookings table does not have service_slug. Derive it from services via service_id.
  This applies to all services.
*/

CREATE OR REPLACE FUNCTION public.on_booking_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_request_type text;
BEGIN
  SELECT s.slug INTO v_slug FROM public.services s WHERE s.id = NEW.service_id;
  v_request_type := CASE
    WHEN COALESCE(NEW.notes, '') ILIKE '%quote%' THEN 'Quote request'
    ELSE 'Service booking'
  END;

  PERFORM public.enqueue_admin_notification(
    'booking_created',
    'New ' || v_request_type,
    COALESCE(NEW.contact_name, 'A client') || ' submitted a ' || lower(v_request_type) || ' for ' || COALESCE(v_slug, 'a service') || '.',
    'bookings',
    jsonb_build_object(
      'booking_id', NEW.id,
      'service_slug', v_slug,
      'request_type', v_request_type,
      'status', NEW.status
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_booking_status_changed_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.user_id IS NOT NULL THEN
    SELECT s.slug INTO v_slug FROM public.services s WHERE s.id = NEW.service_id;
    PERFORM public.enqueue_notification(
      NEW.user_id,
      'client',
      'booking_status_update',
      CASE NEW.status
        WHEN 'completed' THEN 'Service completed successfully'
        WHEN 'cancelled' THEN 'Booking cancelled'
        ELSE 'Booking status updated'
      END,
      'Your booking for ' || COALESCE(v_slug, 'your service') || ' is now: ' || replace(NEW.status, '_', ' '),
      'bookings',
      jsonb_build_object('booking_id', NEW.id, 'service_slug', v_slug, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;
