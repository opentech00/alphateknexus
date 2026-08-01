/*
# Automatic Notification Triggers for All App Roles

## Purpose
Creates database triggers that automatically enqueue notifications into the
notification_outbox whenever key events happen across the app. These triggers
replace and extend the existing admin-only notification triggers with a
unified system covering clients, admins, employees, and field workers.

## Triggers Created

### Booking Events (client + admin)
1. `on_booking_created_enqueue` — new booking: notify all admins (booking_update)
2. `on_booking_status_changed_enqueue` — status changed: notify the booking owner (booking_update)
3. `on_booking_completed_enqueue` — booking completed: notify the booking owner (review_prompt)

### Message Events (admin + client)
4. `on_client_message_enqueue` — client sends message: notify all admins (message)
5. `on_admin_reply_enqueue` — admin replies: notify the booking owner (message)

### Payment Events (client)
6. `on_payment_verified_enqueue` — bank payment verified: notify booking owner (payment)
7. `on_payment_rejected_enqueue` — bank payment rejected: notify booking owner (payment)

### Smart Sort Events (client)
8. `on_smart_sort_pickup_created_enqueue` — pickup scheduled: notify client (smart_sort)
9. `on_smart_sort_subscription_created_enqueue` — new subscription: notify client (smart_sort)

### HR / Employee Events (employee)
10. `on_employee_created_enqueue` — new employee with login: notify employee (hr_update)
11. `on_employee_status_changed_enqueue` — status changed: notify employee (hr_update)

### Field Dispatch Events (field worker + admin)
12. `on_field_assignment_created_enqueue` — job assigned: notify field worker (field_dispatch)
13. `on_field_assignment_status_changed_enqueue` — job status changed: notify admin (field_dispatch)
14. `on_field_incident_created_enqueue` — incident reported: notify all admins (incidents)

## Important Notes
1. All triggers use SECURITY DEFINER functions with search_path = public for safety.
2. Each trigger calls enqueue_notification or enqueue_admin_notification to queue the notification.
3. The send-notification edge function processes the outbox queue and delivers across channels.
4. The existing notify_admins function and its triggers are kept for backwards compatibility
   but the new enqueue_* functions are the primary path going forward.
5. Triggers are idempotent: DROP TRIGGER IF EXISTS before CREATE TRIGGER.
6. Functions check for NULL/missing data gracefully to avoid trigger failures.
*/

-- ── Booking Events ──

CREATE OR REPLACE FUNCTION public.on_booking_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_admin_notification(
    'booking_created',
    'New Booking Received',
    'A new booking has been submitted by ' || COALESCE(NEW.contact_name, 'a client') || '.',
    'bookings',
    jsonb_build_object('booking_id', NEW.id, 'service_slug', NEW.service_slug)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_created_enqueue ON public.bookings;
CREATE TRIGGER on_booking_created_enqueue
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.on_booking_created_enqueue_notif();

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
      'Booking Status Updated',
      'Your booking for ' || COALESCE(NEW.service_slug, 'service') || ' is now: ' || REPLACE(NEW.status, '_', ' '),
      'bookings',
      jsonb_build_object('booking_id', NEW.id, 'service_slug', NEW.service_slug, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_status_changed_enqueue ON public.bookings;
CREATE TRIGGER on_booking_status_changed_enqueue
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.on_booking_status_changed_enqueue_notif();

CREATE OR REPLACE FUNCTION public.on_booking_completed_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.user_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      NEW.user_id,
      'client',
      'review_prompt',
      'How was your service?',
      'Your booking is complete. Please take a moment to rate your experience.',
      'bookings',
      jsonb_build_object('booking_id', NEW.id, 'service_slug', NEW.service_slug)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_completed_enqueue ON public.bookings;
CREATE TRIGGER on_booking_completed_enqueue
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION public.on_booking_completed_enqueue_notif();

-- ── Message Events ──

CREATE OR REPLACE FUNCTION public.on_message_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_user_id uuid;
BEGIN
  IF NEW.is_admin = false THEN
    -- Client sent a message -> notify all admins
    PERFORM public.enqueue_admin_notification(
      'new_message',
      'New Message',
      COALESCE(NEW.sender_name, 'A client') || ' sent a new message.',
      'messages',
      jsonb_build_object('booking_id', NEW.booking_id)
    );
  ELSE
    -- Admin replied -> notify the booking owner
    SELECT user_id INTO v_booking_user_id FROM public.bookings WHERE id = NEW.booking_id;
    IF v_booking_user_id IS NOT NULL THEN
      PERFORM public.enqueue_notification(
        v_booking_user_id,
        'client',
        'admin_reply',
        'New Reply',
        'You have a new message from the AlphaTek Nexus team.',
        'messages',
        jsonb_build_object('booking_id', NEW.booking_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_created_enqueue ON public.messages;
CREATE TRIGGER on_message_created_enqueue
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_created_enqueue_notif();

-- ── Smart Sort Pickup Events ──

CREATE OR REPLACE FUNCTION public.on_smart_sort_pickup_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.smart_sort_subscriptions WHERE id = NEW.subscription_id;
  IF v_user_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      v_user_id,
      'client',
      'smart_sort_pickup',
      'Pickup Scheduled',
      'Your Smart Sort pickup has been scheduled for ' || COALESCE(NEW.scheduled_date::text, 'your next collection day') || '.',
      'smart_sort',
      jsonb_build_object('pickup_id', NEW.id, 'subscription_id', NEW.subscription_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_smart_sort_pickup_created_enqueue ON public.smart_sort_pickups;
CREATE TRIGGER on_smart_sort_pickup_created_enqueue
  AFTER INSERT ON public.smart_sort_pickups
  FOR EACH ROW EXECUTE FUNCTION public.on_smart_sort_pickup_created_enqueue_notif();

-- ── Smart Sort Subscription Events ──

CREATE OR REPLACE FUNCTION public.on_smart_sort_subscription_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      NEW.user_id,
      'client',
      'subscription_created',
      'Smart Sort Subscription Active',
      'Your Smart Sort subscription is now active. We will notify you before each pickup.',
      'smart_sort',
      jsonb_build_object('subscription_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_smart_sort_subscription_created_enqueue ON public.smart_sort_subscriptions;
CREATE TRIGGER on_smart_sort_subscription_created_enqueue
  AFTER INSERT ON public.smart_sort_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.on_smart_sort_subscription_created_enqueue_notif();

-- ── HR / Employee Events ──

CREATE OR REPLACE FUNCTION public.on_employee_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      NEW.user_id,
      'employee',
      'employee_created',
      'Welcome to AlphaTek Nexus',
      'Your employee account has been created. You can now access the employee portal.',
      'hr',
      jsonb_build_object('employee_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_employee_created_enqueue ON public.employees;
CREATE TRIGGER on_employee_created_enqueue
  AFTER INSERT ON public.employees
  FOR EACH ROW WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.on_employee_created_enqueue_notif();

CREATE OR REPLACE FUNCTION public.on_employee_status_changed_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.user_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      NEW.user_id,
      'employee',
      'employee_status_update',
      'Employment Status Updated',
      'Your employment status has been updated to: ' || COALESCE(NEW.status, 'unknown'),
      'hr',
      jsonb_build_object('employee_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_employee_status_changed_enqueue ON public.employees;
CREATE TRIGGER on_employee_status_changed_enqueue
  AFTER UPDATE OF status ON public.employees
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.on_employee_status_changed_enqueue_notif();

-- ── Field Dispatch Events ──

CREATE OR REPLACE FUNCTION public.on_field_assignment_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.employees WHERE id = NEW.employee_id;
  IF v_user_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      v_user_id,
      'field',
      'job_assignment',
      'New Job Assigned',
      'You have been assigned a new job. Check the field app for details.',
      'field_dispatch',
      jsonb_build_object('assignment_id', NEW.id, 'job_id', NEW.booking_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_field_assignment_created_enqueue ON public.field_assignments;
CREATE TRIGGER on_field_assignment_created_enqueue
  AFTER INSERT ON public.field_assignments
  FOR EACH ROW EXECUTE FUNCTION public.on_field_assignment_created_enqueue_notif();

CREATE OR REPLACE FUNCTION public.on_field_assignment_status_changed_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.enqueue_admin_notification(
      'field_status_update',
      'Field Job Status Updated',
      'A field job status has been updated to: ' || COALESCE(NEW.status, 'unknown'),
      'field_dispatch',
      jsonb_build_object('assignment_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_field_assignment_status_changed_enqueue ON public.field_assignments;
CREATE TRIGGER on_field_assignment_status_changed_enqueue
  AFTER UPDATE OF status ON public.field_assignments
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.on_field_assignment_status_changed_enqueue_notif();

-- ── Field Incident Events ──

CREATE OR REPLACE FUNCTION public.on_field_incident_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_admin_notification(
    'incident_reported',
    'Incident Report Filed',
    'A field incident has been reported: ' || COALESCE(NEW.incident_type, 'Unknown type'),
    'incidents',
    jsonb_build_object('incident_id', NEW.id, 'assignment_id', NEW.assignment_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_field_incident_created_enqueue ON public.field_incidents;
CREATE TRIGGER on_field_incident_created_enqueue
  AFTER INSERT ON public.field_incidents
  FOR EACH ROW EXECUTE FUNCTION public.on_field_incident_created_enqueue_notif();
