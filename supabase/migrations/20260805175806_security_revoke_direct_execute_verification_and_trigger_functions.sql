/*
# Lock down direct execution of internal functions

1. Changes
- Revoke EXECUTE on `generate_email_verification_code` and
  `verify_email_verification_code` from anon and authenticated. These are
  only meant to be called by the send-verification-code / verify-email-code
  edge functions (which use the service role); direct client calls allowed
  code spamming and bypassing the edge-function flow.
- Revoke EXECUTE on the notification trigger functions from anon and
  authenticated. Trigger functions are invoked by the database itself and
  should never be exposed via the public RPC API.

2. Security
- No behavior change for the app: edge functions use the service role,
  and triggers fire as table owners. Only direct client-side RPC access
  is removed.
*/

REVOKE EXECUTE ON FUNCTION public.generate_email_verification_code(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.verify_email_verification_code(text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_dispatch_offer_created_enqueue_notif() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_task_delegation_created_enqueue_notif() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_task_delegation_status_changed_enqueue_notif() FROM anon, authenticated, public;
