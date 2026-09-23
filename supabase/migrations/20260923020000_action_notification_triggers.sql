-- Counterpart in-app notifications for leave, payment verification, HR files, and incidents.
-- Delivery goes through notification_outbox so prefs / email / push still apply.

-- ── Leave requested → division heads ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_leave_requested_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_name text;
BEGIN
  SELECT e.full_name INTO v_name FROM public.employees e WHERE e.id = NEW.employee_id;

  FOR rec IN
    SELECT e.user_id
    FROM public.employees e
    WHERE e.service_id IS NOT NULL
      AND e.service_id = NEW.service_id
      AND e.user_id IS NOT NULL
      AND e.status = 'active'
      AND e.user_id IS DISTINCT FROM NEW.user_id
      AND (
        e.org_role = 'division_head'
        OR public.has_capability('div.manage_staff_access', e.service_id)
      )
  LOOP
    PERFORM public.enqueue_notification(
      rec.user_id,
      'employee',
      'hr_leave_requested',
      'Leave request pending',
      COALESCE(v_name, 'A teammate') || ' requested ' || replace(NEW.leave_type, '_', ' ') || ' leave.',
      'hr',
      jsonb_build_object(
        'leave_request_id', NEW.id,
        'employee_id', NEW.employee_id,
        'actor_id', NEW.user_id
      )
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_leave_requested_enqueue ON public.leave_requests;
CREATE TRIGGER on_leave_requested_enqueue
  AFTER INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_leave_requested_enqueue_notif();

-- ── Leave decided → requesting employee ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_leave_decided_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved', 'rejected') THEN
    PERFORM public.enqueue_notification(
      NEW.user_id,
      'employee',
      'hr_leave_decided',
      CASE NEW.status WHEN 'approved' THEN 'Leave approved' ELSE 'Leave rejected' END,
      'Your ' || replace(NEW.leave_type, '_', ' ') || ' leave was ' || NEW.status || '.',
      'hr',
      jsonb_build_object(
        'leave_request_id', NEW.id,
        'status', NEW.status,
        'actor_id', NEW.reviewed_by
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_leave_decided_enqueue ON public.leave_requests;
CREATE TRIGGER on_leave_decided_enqueue
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_leave_decided_enqueue_notif();

-- ── Bank slip submitted → admins ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_payment_submitted_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_admin_notification(
    'payment_submitted',
    'Bank payment to verify',
    'A client uploaded a ' || replace(NEW.document_type, '_', ' ') || ' for review.',
    'payments',
    jsonb_build_object(
      'booking_id', NEW.booking_id,
      'verification_id', NEW.id,
      'actor_id', NEW.user_id,
      'service_slug', NEW.service_slug
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_payment_submitted_enqueue ON public.payment_verifications;
CREATE TRIGGER on_payment_submitted_enqueue
  AFTER INSERT ON public.payment_verifications
  FOR EACH ROW EXECUTE FUNCTION public.on_payment_submitted_enqueue_notif();

-- ── Bank payment verified / rejected → client ───────────────────────────
CREATE OR REPLACE FUNCTION public.on_payment_verified_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('verified', 'rejected') THEN
    PERFORM public.enqueue_notification(
      NEW.user_id,
      'client',
      CASE NEW.status WHEN 'verified' THEN 'payment_verified' ELSE 'payment_rejected' END,
      CASE NEW.status WHEN 'verified' THEN 'Payment verified' ELSE 'Payment rejected' END,
      CASE NEW.status
        WHEN 'verified' THEN 'Your bank payment has been confirmed.'
        ELSE 'Your bank payment was not accepted.' || COALESCE(' Reason: ' || NEW.rejection_reason, '')
      END,
      'payments',
      jsonb_build_object(
        'booking_id', NEW.booking_id,
        'verification_id', NEW.id,
        'status', NEW.status,
        'actor_id', NEW.verified_by,
        'service_slug', NEW.service_slug
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_payment_verified_enqueue ON public.payment_verifications;
CREATE TRIGGER on_payment_verified_enqueue
  AFTER UPDATE ON public.payment_verifications
  FOR EACH ROW EXECUTE FUNCTION public.on_payment_verified_enqueue_notif();

-- ── HR file uploaded → employee ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_hr_file_uploaded_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.employees WHERE id = NEW.employee_id;
  IF v_user IS NOT NULL AND v_user IS DISTINCT FROM NEW.uploaded_by THEN
    PERFORM public.enqueue_notification(
      v_user,
      'employee',
      'hr_file_uploaded',
      'New HR file',
      'A new ' || replace(NEW.document_type, '_', ' ') || ' was added to your HR folder.',
      'hr',
      jsonb_build_object(
        'document_id', NEW.id,
        'document_type', NEW.document_type,
        'actor_id', NEW.uploaded_by
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_hr_file_uploaded_enqueue ON public.employee_documents;
CREATE TRIGGER on_hr_file_uploaded_enqueue
  AFTER INSERT ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.on_hr_file_uploaded_enqueue_notif();

-- ── Incident resolved → reporter ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_incident_resolved_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('reviewed', 'closed') THEN
    SELECT user_id INTO v_user FROM public.employees WHERE id = NEW.employee_id;
    IF v_user IS NOT NULL THEN
      PERFORM public.enqueue_notification(
        v_user,
        'field',
        'incident_resolved',
        CASE NEW.status WHEN 'closed' THEN 'Incident closed' ELSE 'Incident reviewed' END,
        'Your ' || NEW.incident_type || ' report is now ' || NEW.status || '.',
        'incidents',
        jsonb_build_object(
          'incident_id', NEW.id,
          'status', NEW.status,
          'actor_id', auth.uid()
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_incident_resolved_enqueue ON public.field_incidents;
CREATE TRIGGER on_incident_resolved_enqueue
  AFTER UPDATE ON public.field_incidents
  FOR EACH ROW EXECUTE FUNCTION public.on_incident_resolved_enqueue_notif();

REVOKE ALL ON FUNCTION public.on_leave_requested_enqueue_notif() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.on_leave_decided_enqueue_notif() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.on_payment_submitted_enqueue_notif() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.on_payment_verified_enqueue_notif() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.on_hr_file_uploaded_enqueue_notif() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.on_incident_resolved_enqueue_notif() FROM PUBLIC, anon;
