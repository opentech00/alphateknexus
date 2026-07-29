-- Auto-notify all admin users when a new booking is created or a client sends a message.
-- This powers the unread-count badge in the admin dashboard's NotificationsPanel.

-- Helper: insert a notification row for every admin profile.
CREATE OR REPLACE FUNCTION public.notify_admins(
  p_title text,
  p_body text,
  p_type text DEFAULT 'system',
  p_booking_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, type, booking_id)
  SELECT id, p_title, p_body, p_type, p_booking_id
  FROM public.profiles
  WHERE role = 'admin';
END;
$$;

-- Trigger: new booking -> notify admins
CREATE OR REPLACE FUNCTION public.on_booking_created_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.notify_admins(
    'New Booking Received',
    'A new booking has been submitted by ' || COALESCE(NEW.contact_name, 'a client') || '.',
    'booking_update',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_created_notify_admins ON public.bookings;
CREATE TRIGGER on_booking_created_notify_admins
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.on_booking_created_notify_admins();

-- Trigger: new client message -> notify admins (skip admin-authored messages)
CREATE OR REPLACE FUNCTION public.on_message_created_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_admin = false THEN
    PERFORM public.notify_admins(
      'New Message',
      COALESCE(NEW.sender_name, 'A client') || ' sent a new message.',
      'message',
      NEW.booking_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_created_notify_admins ON public.messages;
CREATE TRIGGER on_message_created_notify_admins
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_created_notify_admins();
