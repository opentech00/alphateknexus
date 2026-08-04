/*
  # Revoke anon EXECUTE on all SECURITY DEFINER functions + pin search_path

  The security advisor flagged 32 SECURITY DEFINER functions as callable by the
  anon role. Most are trigger functions (called by the DB, not via RPC) or
  internal helpers (called by service-role code). None should be directly
  callable by unauthenticated users.

  `get_employee_email_by_number` is the sole exception: it's used for the
  pre-auth staff login lookup and needs anon EXECUTE.

  Also pin `search_path = public` on `create_dispatch_offer_for_booking`,
  the last remaining function with a mutable search_path.

  1. Changes
     - REVOKE EXECUTE FROM anon on every SECURITY DEFINER function except
       `get_employee_email_by_number`.
     - REVOKE EXECUTE FROM authenticated on trigger-only functions that no
       client should call directly (guards, triggers, internal helpers).
     - Pin `search_path = public` on `create_dispatch_offer_for_booking`.
*/

-- Pin search_path on the last flagged function
ALTER FUNCTION public.create_dispatch_offer_for_booking() SET search_path = public;

-- Revoke anon EXECUTE on all SECURITY DEFINER functions except get_employee_email_by_number
REVOKE EXECUTE ON FUNCTION public.accept_dispatch_offer(p_offer_id uuid, p_employee_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_user_delegate_to(assigner_uid uuid, assignee_uid uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_dispatch_offer_for_booking() FROM anon;
REVOKE EXECUTE ON FUNCTION public.decline_dispatch_offer(p_offer_id uuid, p_employee_id uuid, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_admin_notification(p_event_type text, p_title text, p_body text, p_category text, p_metadata jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(p_user_id uuid, p_recipient_role text, p_event_type text, p_title text, p_body text, p_category text, p_metadata jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_notification_preferences() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_stale_dispatch_offers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_cash_receipt_on_confirm() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_cash_reference() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_receipt_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_booking_payment_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_employee_privileged_columns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_payment_amount() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_profile_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_task_delegation_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_task_delegation_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_finance_permission(perm text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_invoice_paid(p_invoice_id uuid, p_amount integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_payment_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_admins(p_title text, p_body text, p_type text, p_booking_id uuid, p_service_slug text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_admins(p_title text, p_body text, p_type text, p_booking_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_invoice_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_review_prompt() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_wallet_transaction() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_withdrawal_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_booking_completed_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_booking_created_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_booking_created_notify_admins() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_booking_status_changed_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_employee_created_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_employee_status_changed_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_field_assignment_created_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_field_assignment_status_changed_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_field_incident_created_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_message_created_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_message_created_notify_admins() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_smart_sort_pickup_created_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_smart_sort_subscription_created_enqueue_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pay_booking_from_wallet(p_booking_id uuid, p_amount numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_double_payment_confirmation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_withdrawal_completion(p_withdrawal_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_booking_status_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_set_referral_code() FROM anon;

-- Revoke authenticated EXECUTE on trigger-only / internal functions
-- (these should never be called via RPC by any client)
REVOKE EXECUTE ON FUNCTION public.can_user_delegate_to(assigner_uid uuid, assignee_uid uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_dispatch_offer_for_booking() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_notification_preferences() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_cash_receipt_on_confirm() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_cash_reference() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_receipt_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_booking_payment_status() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_employee_privileged_columns() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_payment_amount() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_task_delegation_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_task_delegation_update() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_payment_status_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(p_title text, p_body text, p_type text, p_booking_id uuid, p_service_slug text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(p_title text, p_body text, p_type text, p_booking_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_invoice_status_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_review_prompt() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_wallet_transaction() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_withdrawal_status_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_booking_completed_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_booking_created_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_booking_created_notify_admins() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_booking_status_changed_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_employee_created_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_employee_status_changed_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_field_assignment_created_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_field_assignment_status_changed_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_field_incident_created_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_message_created_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_message_created_notify_admins() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_smart_sort_pickup_created_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.on_smart_sort_subscription_created_enqueue_notif() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_double_payment_confirmation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_booking_status_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_set_referral_code() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_dispatch_offers() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_invoice_paid(p_invoice_id uuid, p_amount integer) FROM authenticated;

-- Keep authenticated EXECUTE on functions clients legitimately call:
--   accept_dispatch_offer, decline_dispatch_offer, pay_booking_from_wallet,
--   process_withdrawal_completion, has_finance_permission, is_admin,
--   enqueue_notification, enqueue_admin_notification, get_employee_email_by_number
