/*
# Add notification triggers for task delegations and dispatch offers

1. Changes
- New trigger on `task_delegations` (INSERT): enqueues a notification to the
  assigned employee (email + push + in-app via the notification outbox) when
  a task is delegated to them.
- New trigger on `task_delegations` (UPDATE of status): notifies the assigner
  when the assignee accepts, declines, or completes the task; notifies the
  assignee if the task is cancelled.
- New trigger on `dispatch_offers` (INSERT): notifies all active employees of
  the offered service that a new job offer is available.

2. Security
- All functions are SECURITY DEFINER with a pinned search_path, matching the
  existing enqueue trigger functions. They only write to notification_outbox
  via the existing enqueue_notification helper.

3. Notes
- Triggers are idempotent (DROP TRIGGER IF EXISTS before CREATE TRIGGER).
- Delivery (email via Resend, push via FCM, in-app) is handled by the
  existing send-notification edge function driven by the pg_cron outbox
  processor; no changes needed there.
*/

CREATE OR REPLACE FUNCTION public.on_task_delegation_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      NEW.assigned_to,
      'employee',
      'task_assigned',
      'New task assigned to you',
      'You have been assigned a new task: "' || NEW.title || '"' ||
        CASE WHEN NEW.due_date IS NOT NULL
          THEN ' (due ' || to_char(NEW.due_date, 'Mon DD, YYYY') || ')'
          ELSE '' END || '. Priority: ' || COALESCE(NEW.priority, 'normal') || '.',
      'hr',
      jsonb_build_object('task_id', NEW.id, 'priority', NEW.priority)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_task_delegation_created_enqueue ON task_delegations;
CREATE TRIGGER on_task_delegation_created_enqueue
  AFTER INSERT ON task_delegations
  FOR EACH ROW EXECUTE FUNCTION public.on_task_delegation_created_enqueue_notif();

CREATE OR REPLACE FUNCTION public.on_task_delegation_status_changed_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('accepted', 'declined', 'completed') AND NEW.assigned_by IS NOT NULL THEN
      PERFORM public.enqueue_notification(
        NEW.assigned_by,
        'employee',
        'task_' || NEW.status,
        'Task ' || NEW.status,
        'The task "' || NEW.title || '" was ' || NEW.status ||
          CASE WHEN NEW.status = 'declined' AND NEW.decline_reason IS NOT NULL
            THEN '. Reason: ' || NEW.decline_reason
            ELSE '.' END,
        'hr',
        jsonb_build_object('task_id', NEW.id, 'status', NEW.status)
      );
    ELSIF NEW.status = 'cancelled' AND NEW.assigned_to IS NOT NULL THEN
      PERFORM public.enqueue_notification(
        NEW.assigned_to,
        'employee',
        'task_cancelled',
        'Task cancelled',
        'The task "' || NEW.title || '" assigned to you has been cancelled.',
        'hr',
        jsonb_build_object('task_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_task_delegation_status_changed_enqueue ON task_delegations;
CREATE TRIGGER on_task_delegation_status_changed_enqueue
  AFTER UPDATE OF status ON task_delegations
  FOR EACH ROW EXECUTE FUNCTION public.on_task_delegation_status_changed_enqueue_notif();

CREATE OR REPLACE FUNCTION public.on_dispatch_offer_created_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp RECORD;
BEGIN
  FOR emp IN
    SELECT user_id FROM employees
    WHERE service_id = NEW.service_id
      AND status = 'active'
      AND user_id IS NOT NULL
  LOOP
    PERFORM public.enqueue_notification(
      emp.user_id,
      'employee',
      'dispatch_offer_created',
      'New job offer available',
      'A new job is available for dispatch. Open the field app to view and accept it before it expires.',
      'field_dispatch',
      jsonb_build_object('offer_id', NEW.id, 'booking_id', NEW.booking_id, 'expires_at', NEW.expires_at)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_dispatch_offer_created_enqueue ON dispatch_offers;
CREATE TRIGGER on_dispatch_offer_created_enqueue
  AFTER INSERT ON dispatch_offers
  FOR EACH ROW EXECUTE FUNCTION public.on_dispatch_offer_created_enqueue_notif();
