/*
  # Pin search_path on remaining flagged functions

  Four functions were flagged by the security advisor for having a mutable
  search_path. Pin them all to `public` so a hostile search_path cannot
  redirect them to shadowed objects.

  1. `update_updated_at_column()` — non-SECURITY DEFINER trigger function used
     across many tables.
  2. `can_user_delegate_to(uuid, uuid)` — SECURITY DEFINER used by the task
     delegation system.
  3. `handle_task_delegation_insert()` — SECURITY DEFINER trigger.
  4. `handle_task_delegation_update()` — SECURITY DEFINER trigger.
*/

ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.can_user_delegate_to(assigner_uid uuid, assignee_uid uuid) SET search_path = public;
ALTER FUNCTION public.handle_task_delegation_insert() SET search_path = public;
ALTER FUNCTION public.handle_task_delegation_update() SET search_path = public;
