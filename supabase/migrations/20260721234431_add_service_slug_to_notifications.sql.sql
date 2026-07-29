-- Add service_slug to notifications so each division's badge can filter its own unread count.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS service_slug text;

-- Backfill existing notifications from their booking's service slug.
UPDATE public.notifications n
SET service_slug = s.slug
FROM public.bookings b
JOIN public.services s ON s.id = b.service_id
WHERE n.booking_id = b.id
  AND n.service_slug IS NULL;

-- Update notify_admins to accept an optional service slug.
CREATE OR REPLACE FUNCTION public.notify_admins(
  p_title text,
  p_body text,
  p_type text DEFAULT 'system',
  p_booking_id uuid DEFAULT NULL,
  p_service_slug text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, type, booking_id, service_slug)
  SELECT id, p_title, p_body, p_type, p_booking_id, p_service_slug
  FROM public.profiles
  WHERE role = 'admin';
END;
$$;

-- Booking trigger: resolve the service slug from the booking's service_id.
CREATE OR REPLACE FUNCTION public.on_booking_created_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slug text;
BEGIN
  SELECT slug INTO v_slug FROM public.services WHERE id = NEW.service_id;
  PERFORM public.notify_admins(
    'New Booking Received',
    'A new booking has been submitted by ' || COALESCE(NEW.contact_name, 'a client') || '.',
    'booking_update',
    NEW.id,
    v_slug
  );
  RETURN NEW;
END;
$$;

-- Message trigger: resolve the service slug from the booking the message belongs to.
CREATE OR REPLACE FUNCTION public.on_message_created_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slug text;
BEGIN
  IF NEW.is_admin = false THEN
    SELECT s.slug INTO v_slug
    FROM public.bookings b
    JOIN public.services s ON s.id = b.service_id
    WHERE b.id = NEW.booking_id;

    PERFORM public.notify_admins(
      'New Message',
      COALESCE(NEW.sender_name, 'A client') || ' sent a new message.',
      'message',
      NEW.booking_id,
      v_slug
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Reattach triggers (idempotent).
DROP TRIGGER IF EXISTS on_booking_created_notify_admins ON public.bookings;
CREATE TRIGGER on_booking_created_notify_admins
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.on_booking_created_notify_admins();

DROP TRIGGER IF EXISTS on_message_created_notify_admins ON public.messages;
CREATE TRIGGER on_message_created_notify_admins
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_created_notify_admins();
