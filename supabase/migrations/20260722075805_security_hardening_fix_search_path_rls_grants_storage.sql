/*
# Security hardening: fix search_path, RLS policies, function execute grants, and storage bucket listing

## Issues Fixed

### 1. Function Search Path Mutable (7 functions)
All SECURITY DEFINER functions now have `SET search_path TO public` so a malicious
role cannot hijack unqualified table references.

Functions fixed:
- generate_referral_code
- trg_set_referral_code
- handle_new_user
- record_booking_status_change
- notify_admins (both overloads)
- on_booking_created_notify_admins
- on_message_created_notify_admins

### 2. RLS Policy Always True (2 policies)
- employee_activity_logs.insert_activity_logs: WITH CHECK (true) → restrict to
  actor_id = auth.uid() OR employee_id = auth.uid()
- notifications.insert_notifications: WITH CHECK (true) → restrict to
  user_id = auth.uid()

### 3. Public Bucket Allows Listing (2 storage SELECT policies)
- documents.public_read_documents: broad SELECT allowing listing → DROP
  (Public bucket object URLs work without a SELECT policy)
- employee-photos.public_read_photos: same → DROP

### 4. Public/Authenticated Can Execute SECURITY DEFINER Functions (10 functions)
Revoke EXECUTE from PUBLIC and authenticated for all SECURITY DEFINER functions
that should only be called internally by triggers or by authorized roles.

Functions revoked:
- generate_referral_code
- trg_set_referral_code
- handle_new_user
- record_booking_status_change
- notify_admins (both overloads)
- on_booking_created_notify_admins
- on_message_created_notify_admins
- generate_upcoming_pickups
- get_employee_email_by_number
- is_admin

## Security
- No new tables. RLS policies tightened, not loosened.
- SECURITY DEFINER functions retain their elevated privileges but are no longer
  callable by anon/authenticated via REST RPC.
- Trigger functions continue to work because triggers run with the function's
  privileges regardless of EXECUTE grants.

## Important Notes
- is_admin() is used in RLS policies; RLS policy evaluation can still call it
  because policies run with the table owner's privileges, not the caller's.
- generate_upcoming_pickups and get_employee_email_by_number are called from
  edge functions with the service role key, which bypasses EXECUTE checks.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Fix search_path on all SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════

-- generate_referral_code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  code   text;
  suffix text;
  i      int;
  tries  int := 0;
BEGIN
  LOOP
    suffix := '';
    FOR i IN 1..4 LOOP
      suffix := suffix || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    code := 'ALNEXUS-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = code);
    tries := tries + 1;
    IF tries >= 20 THEN
      suffix := '';
      FOR i IN 1..6 LOOP
        suffix := suffix || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      code := 'ALNEXUS-' || suffix;
      EXIT;
    END IF;
  END LOOP;
  RETURN code;
END;
$function$;

-- trg_set_referral_code
CREATE OR REPLACE FUNCTION public.trg_set_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$function$;

-- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$function$;

-- record_booking_status_change
CREATE OR REPLACE FUNCTION public.record_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_status_history (booking_id, status, note, created_by)
    VALUES (NEW.id, NEW.status, 'Booking submitted', 'system');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.booking_status_history (booking_id, status, note, created_by)
    VALUES (NEW.id, NEW.status, null, 'admin');
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

-- notify_admins (4-param overload)
CREATE OR REPLACE FUNCTION public.notify_admins(p_title text, p_body text, p_type text DEFAULT 'system'::text, p_booking_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, type, booking_id)
  SELECT id, p_title, p_body, p_type, p_booking_id
  FROM public.profiles
  WHERE role = 'admin';
END;
$function$;

-- notify_admins (5-param overload with service_slug)
CREATE OR REPLACE FUNCTION public.notify_admins(p_title text, p_body text, p_type text DEFAULT 'system'::text, p_booking_id uuid DEFAULT NULL::uuid, p_service_slug text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, type, booking_id, service_slug)
  SELECT id, p_title, p_body, p_type, p_booking_id, p_service_slug
  FROM public.profiles
  WHERE role = 'admin';
END;
$function$;

-- on_booking_created_notify_admins
CREATE OR REPLACE FUNCTION public.on_booking_created_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
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
$function$;

-- on_message_created_notify_admins
CREATE OR REPLACE FUNCTION public.on_message_created_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
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
$function$;

-- ═══════════════════════════════════════════════════════════
-- 2. Fix RLS policies with always-true WITH CHECK
-- ═══════════════════════════════════════════════════════════

-- employee_activity_logs: restrict INSERT to the actor or the employee being acted on
DROP POLICY IF EXISTS insert_activity_logs ON employee_activity_logs;
CREATE POLICY insert_activity_logs ON employee_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR employee_id = auth.uid());

-- notifications: restrict INSERT to the owner
DROP POLICY IF EXISTS insert_notifications ON notifications;
CREATE POLICY insert_notifications ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════
-- 3. Remove broad SELECT policies on public storage buckets
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS public_read_documents ON storage.objects;
DROP POLICY IF EXISTS public_read_photos ON storage.objects;

-- ═══════════════════════════════════════════════════════════
-- 4. Revoke EXECUTE on SECURITY DEFINER functions from anon + authenticated
-- ═══════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_set_referral_code() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_booking_status_change() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, uuid) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, uuid, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_booking_created_notify_admins() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_message_created_notify_admins() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_upcoming_pickups(uuid) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_employee_email_by_number(text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, authenticated;