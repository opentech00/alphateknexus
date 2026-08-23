/*
  Expand action notifications for clients, field staff, and admins.
  Delivery is handled by the notification_outbox processor.
*/

-- Give admins useful context for every new booking, including quote and hire requests.
CREATE OR REPLACE FUNCTION public.on_booking_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_type text;
BEGIN
  v_request_type := CASE
    WHEN COALESCE(NEW.notes, '') ILIKE '%quote%' THEN 'Quote request'
    ELSE 'Service booking'
  END;

  PERFORM public.enqueue_admin_notification(
    'booking_created',
    'New ' || v_request_type,
    COALESCE(NEW.contact_name, 'A client') || ' submitted a ' || lower(v_request_type) || ' for ' || COALESCE(NEW.service_slug, 'a service') || '.',
    'bookings',
    jsonb_build_object(
      'booking_id', NEW.id,
      'service_slug', NEW.service_slug,
      'request_type', v_request_type,
      'status', NEW.status
    )
  );
  RETURN NEW;
END;
$$;

-- Notify the assigned field worker and all admins about job outcomes.
CREATE OR REPLACE FUNCTION public.on_field_assignment_status_changed_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_title text;
  v_body text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT user_id INTO v_user_id FROM public.employees WHERE id = NEW.employee_id;

    v_title := CASE NEW.status
      WHEN 'completed' THEN 'Job completed successfully'
      WHEN 'approved' THEN 'Job approved'
      WHEN 'rejected' THEN 'Job requires attention'
      WHEN 'pending_review' THEN 'Job submitted for review'
      WHEN 'in_progress' THEN 'Job started'
      ELSE 'Job status updated'
    END;
    v_body := 'The job for ' || COALESCE(NEW.customer_name, 'a client') || ' is now ' || replace(NEW.status, '_', ' ') || '.';

    IF v_user_id IS NOT NULL THEN
      PERFORM public.enqueue_notification(
        v_user_id,
        'field',
        'field_job_' || NEW.status,
        v_title,
        v_body,
        'field_dispatch',
        jsonb_build_object('assignment_id', NEW.id, 'status', NEW.status)
      );
    END IF;

    PERFORM public.enqueue_admin_notification(
      'field_job_' || NEW.status,
      v_title,
      v_body,
      'field_dispatch',
      jsonb_build_object('assignment_id', NEW.id, 'employee_id', NEW.employee_id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure updates replace the older generic implementations.
DROP TRIGGER IF EXISTS on_field_assignment_status_changed_enqueue ON public.field_assignments;
CREATE TRIGGER on_field_assignment_status_changed_enqueue
  AFTER UPDATE OF status ON public.field_assignments
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.on_field_assignment_status_changed_enqueue_notif();

-- Status changes notify the client, while the existing booking-created trigger
-- notifies admins when the client submits a booking or quote request.
CREATE OR REPLACE FUNCTION public.on_booking_status_changed_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.user_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      NEW.user_id,
      'client',
      'booking_status_update',
      CASE NEW.status
        WHEN 'completed' THEN 'Service completed successfully'
        WHEN 'cancelled' THEN 'Booking cancelled'
        ELSE 'Booking status updated'
      END,
      'Your booking for ' || COALESCE(NEW.service_slug, 'your service') || ' is now: ' || replace(NEW.status, '_', ' '),
      'bookings',
      jsonb_build_object('booking_id', NEW.id, 'service_slug', NEW.service_slug, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;
