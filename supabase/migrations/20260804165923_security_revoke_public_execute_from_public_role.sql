/*
  # Revoke PUBLIC EXECUTE on SECURITY DEFINER functions

  The previous migration revoked EXECUTE from `anon` and `authenticated`
  directly, but the grants to the implicit `PUBLIC` role remained — and both
  `anon` and `authenticated` inherit from `PUBLIC`. This removes the PUBLIC
  grant so the earlier revocations actually take effect.

  `get_employee_email_by_number` keeps anon EXECUTE (pre-auth staff login).
  `update_updated_at_column` is not SECURITY DEFINER so it's harmless, but we
  revoke PUBLIC anyway for cleanliness.
*/

REVOKE EXECUTE ON FUNCTION public.can_user_delegate_to(assigner_uid uuid, assignee_uid uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_dispatch_offer_for_booking() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_notification_preferences() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_cash_receipt_on_confirm() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_cash_reference() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_receipt_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_booking_payment_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_employee_privileged_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_payment_amount() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_profile_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_task_delegation_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_task_delegation_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_payment_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_invoice_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_review_prompt() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_wallet_transaction() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_withdrawal_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_booking_completed_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_booking_created_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_booking_status_changed_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_employee_created_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_employee_status_changed_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_field_assignment_created_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_field_assignment_status_changed_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_field_incident_created_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_message_created_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_smart_sort_pickup_created_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_smart_sort_subscription_created_enqueue_notif() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_double_payment_confirmation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_withdrawal_completion(p_withdrawal_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;

-- Also remove the two notify_admins overloads from PUBLIC
REVOKE EXECUTE ON FUNCTION public.notify_admins(p_title text, p_body text, p_type text, p_booking_id uuid, p_service_slug text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_admins(p_title text, p_body text, p_type text, p_booking_id uuid) FROM PUBLIC;

-- Revoke remaining PUBLIC grants on other SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_booking_created_notify_admins() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_message_created_notify_admins() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_booking_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_set_referral_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_stale_dispatch_offers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_invoice_paid(p_invoice_id uuid, p_amount integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_finance_permission(perm text) FROM PUBLIC;
