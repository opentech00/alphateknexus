-- Fix: trigger functions on bookings referenced NEW.service_slug, but the
-- bookings table has no service_slug column (the slug lives in services).
-- This caused "record new has no field service_slug" on every booking insert,
-- breaking quote requests and hire-now submissions for ALL services.

CREATE OR REPLACE FUNCTION public.on_booking_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  SELECT s.slug INTO v_slug FROM public.services s WHERE s.id = NEW.service_id;
  PERFORM public.enqueue_admin_notification(
    'booking_created',
    'New Booking Received',
    'A new booking has been submitted by ' || COALESCE(NEW.contact_name, 'a client') || '.',
    'bookings',
    jsonb_build_object('booking_id', NEW.id, 'service_slug', v_slug)
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
      'Booking Status Updated',
      'Your booking for ' || COALESCE(v_slug, 'service') || ' is now: ' || REPLACE(NEW.status, '_', ' '),
      'bookings',
      jsonb_build_object('booking_id', NEW.id, 'service_slug', v_slug, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_booking_completed_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.user_id IS NOT NULL THEN
    SELECT s.slug INTO v_slug FROM public.services s WHERE s.id = NEW.service_id;
    PERFORM public.enqueue_notification(
      NEW.user_id,
      'client',
      'review_prompt',
      'How was your service?',
      'Your booking is complete. Please take a moment to rate your experience.',
      'bookings',
      jsonb_build_object('booking_id', NEW.id, 'service_slug', v_slug)
    );
  END IF;
  RETURN NEW;
END;
$$;
