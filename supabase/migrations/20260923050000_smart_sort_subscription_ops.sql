/*
# Smart Sort subscription operations

Server-side pickup generation, pause side-effects, skip cadence, period
invoicing, and admin pickup insert so recurring waste service runs without
a client opening the app.

1. generate_upcoming_pickups
   - Re-GRANT EXECUTE to authenticated (scoped to caller unless admin/cron)
   - 14-day horizon
   - bi-weekly → 14 days
   - SECURITY DEFINER with auth checks

2. generate_all_upcoming_pickups + daily pg_cron

3. pause_smart_sort_subscription / resume_smart_sort_subscription
   - Pause cancels scheduled/assigned pickups in the window
   - Resume regenerates the horizon
   - resume_expired_smart_sort_subscriptions for cron

4. skip_smart_sort_pickup — cancel + insert next cadence date

5. Invoice sequence SS-YYYY-####, generate_smart_sort_invoices,
   first invoice on signup, overdue cron

6. Admin INSERT policy on smart_sort_pickups
*/

-- ── helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.smart_sort_frequency_days(p_frequency text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_frequency, 'weekly'))
    WHEN 'daily' THEN 1
    WHEN 'twice-weekly' THEN 3
    WHEN 'weekly' THEN 7
    WHEN 'bi-weekly' THEN 14
    WHEN 'biweekly' THEN 14
    WHEN 'three-weeks' THEN 21
    WHEN 'monthly' THEN 30
    WHEN 'one-time' THEN 9999
    ELSE 7
  END;
$$;

CREATE OR REPLACE FUNCTION public.smart_sort_period_end(p_start date, p_frequency text)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_frequency, 'monthly'))
    WHEN 'daily' THEN p_start
    WHEN 'twice-weekly' THEN p_start + 2
    WHEN 'weekly' THEN p_start + 6
    WHEN 'bi-weekly' THEN p_start + 13
    WHEN 'biweekly' THEN p_start + 13
    WHEN 'three-weeks' THEN p_start + 20
    WHEN 'monthly' THEN (p_start + interval '1 month' - interval '1 day')::date
    WHEN 'one-time' THEN p_start
    ELSE (p_start + interval '1 month' - interval '1 day')::date
  END;
$$;

CREATE OR REPLACE FUNCTION public.smart_sort_caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.smart_sort_caller_is_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smart_sort_frequency_days(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.smart_sort_period_end(date, text) TO authenticated, service_role;

-- ── pickups: 14-day horizon, bi-weekly, re-GRANT ───────────────────────────

CREATE OR REPLACE FUNCTION public.generate_upcoming_pickups(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub RECORD;
  v_interval_days integer;
  v_inserted integer := 0;
  v_next_date date;
  v_horizon date := CURRENT_DATE + 14;
  v_last date;
  v_existing integer;
  v_target uuid;
  v_is_admin boolean := public.smart_sort_caller_is_admin();
BEGIN
  v_target := p_user_id;

  IF auth.uid() IS NOT NULL AND NOT v_is_admin THEN
    v_target := auth.uid();
  END IF;

  FOR sub IN
    SELECT id, user_id, frequency, time_slot, created_at, paused_until
    FROM public.smart_sort_subscriptions
    WHERE status = 'active'
      AND (v_target IS NULL OR user_id = v_target)
  LOOP
    v_interval_days := public.smart_sort_frequency_days(sub.frequency);

    IF sub.frequency = 'one-time' THEN
      v_next_date := GREATEST(CURRENT_DATE, sub.created_at::date) + 1;
      SELECT COUNT(*) INTO v_existing
      FROM public.smart_sort_pickups
      WHERE subscription_id = sub.id;
      IF v_existing = 0 AND v_next_date <= v_horizon THEN
        INSERT INTO public.smart_sort_pickups (subscription_id, user_id, scheduled_date, time_slot, status)
        VALUES (sub.id, sub.user_id, v_next_date, sub.time_slot, 'scheduled');
        v_inserted := v_inserted + 1;
      END IF;
      CONTINUE;
    END IF;

    SELECT MAX(scheduled_date) INTO v_last
    FROM public.smart_sort_pickups
    WHERE subscription_id = sub.id;

    IF v_last IS NULL THEN
      v_next_date := GREATEST(CURRENT_DATE, sub.created_at::date) + v_interval_days;
    ELSE
      v_next_date := v_last + v_interval_days;
      WHILE v_next_date < CURRENT_DATE LOOP
        v_next_date := v_next_date + v_interval_days;
      END LOOP;
    END IF;

    WHILE v_next_date <= v_horizon LOOP
      IF v_next_date >= CURRENT_DATE THEN
        SELECT COUNT(*) INTO v_existing
        FROM public.smart_sort_pickups
        WHERE subscription_id = sub.id AND scheduled_date = v_next_date;

        IF v_existing = 0 THEN
          INSERT INTO public.smart_sort_pickups (subscription_id, user_id, scheduled_date, time_slot, status)
          VALUES (sub.id, sub.user_id, v_next_date, sub.time_slot, 'scheduled');
          v_inserted := v_inserted + 1;
        END IF;
      END IF;
      v_next_date := v_next_date + v_interval_days;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_upcoming_pickups(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_upcoming_pickups(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generate_all_upcoming_pickups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.generate_upcoming_pickups(NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_all_upcoming_pickups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_all_upcoming_pickups() TO service_role;

-- ── pause / resume ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pause_smart_sort_subscription(
  p_subscription_id uuid,
  p_paused_until date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.smart_sort_subscriptions%ROWTYPE;
  v_cancelled integer := 0;
BEGIN
  IF p_paused_until IS NULL OR p_paused_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'paused_until must be today or later';
  END IF;

  SELECT * INTO v_sub FROM public.smart_sort_subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM v_sub.user_id
     AND NOT public.smart_sort_caller_is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_sub.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot pause a cancelled subscription';
  END IF;

  UPDATE public.smart_sort_subscriptions
  SET status = 'paused', paused_until = p_paused_until
  WHERE id = p_subscription_id;

  UPDATE public.smart_sort_pickups
  SET
    status = 'cancelled',
    notes = trim(both FROM coalesce(notes, '') || CASE
      WHEN coalesce(notes, '') = '' THEN 'Cancelled: subscription paused'
      ELSE E'\nCancelled: subscription paused'
    END),
    updated_at = now()
  WHERE subscription_id = p_subscription_id
    AND status IN ('scheduled', 'assigned')
    AND scheduled_date >= CURRENT_DATE
    AND scheduled_date <= p_paused_until;

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'paused_until', p_paused_until,
    'cancelled_pickups', v_cancelled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_smart_sort_subscription(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.smart_sort_subscriptions%ROWTYPE;
  v_inserted integer := 0;
BEGIN
  SELECT * INTO v_sub FROM public.smart_sort_subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM v_sub.user_id
     AND NOT public.smart_sort_caller_is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_sub.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot resume a cancelled subscription';
  END IF;

  UPDATE public.smart_sort_subscriptions
  SET status = 'active', paused_until = NULL
  WHERE id = p_subscription_id;

  v_inserted := public.generate_upcoming_pickups(v_sub.user_id);

  RETURN jsonb_build_object('success', true, 'generated_pickups', v_inserted);
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_expired_smart_sort_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.smart_sort_subscriptions
  SET status = 'active', paused_until = NULL
  WHERE status = 'paused'
    AND paused_until IS NOT NULL
    AND paused_until < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    PERFORM public.generate_all_upcoming_pickups();
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pause_smart_sort_subscription(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_smart_sort_subscription(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resume_smart_sort_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resume_smart_sort_subscription(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resume_expired_smart_sort_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_expired_smart_sort_subscriptions() TO service_role;

-- Cancel future pickups when a subscription is cancelled
CREATE OR REPLACE FUNCTION public.trg_smart_sort_sub_cancel_pickups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.smart_sort_pickups
    SET status = 'cancelled', updated_at = now()
    WHERE subscription_id = NEW.id
      AND status IN ('scheduled', 'assigned')
      AND scheduled_date >= CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_smart_sort_sub_cancel_pickups ON public.smart_sort_subscriptions;
CREATE TRIGGER trg_smart_sort_sub_cancel_pickups
  AFTER UPDATE OF status ON public.smart_sort_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_smart_sort_sub_cancel_pickups();

-- ── skip + next cadence ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.skip_smart_sort_pickup(p_pickup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup public.smart_sort_pickups%ROWTYPE;
  v_sub public.smart_sort_subscriptions%ROWTYPE;
  v_interval integer;
  v_next date;
  v_existing integer;
  v_guard integer := 0;
BEGIN
  SELECT * INTO v_pickup FROM public.smart_sort_pickups WHERE id = p_pickup_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pickup not found';
  END IF;

  SELECT * INTO v_sub FROM public.smart_sort_subscriptions WHERE id = v_pickup.subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM v_pickup.user_id
     AND NOT public.smart_sort_caller_is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_pickup.status NOT IN ('scheduled', 'assigned') THEN
    RAISE EXCEPTION 'Only scheduled or assigned pickups can be skipped';
  END IF;

  UPDATE public.smart_sort_pickups
  SET status = 'cancelled', updated_at = now(),
      notes = trim(both FROM coalesce(notes, '') || CASE
        WHEN coalesce(notes, '') = '' THEN 'Skipped by client/admin'
        ELSE E'\nSkipped by client/admin'
      END)
  WHERE id = p_pickup_id;

  v_interval := public.smart_sort_frequency_days(v_sub.frequency);
  IF v_sub.frequency = 'one-time' OR v_interval >= 9999 THEN
    RETURN jsonb_build_object('success', true, 'next_date', NULL);
  END IF;

  v_next := v_pickup.scheduled_date + v_interval;
  WHILE v_guard < 24 LOOP
    SELECT COUNT(*) INTO v_existing
    FROM public.smart_sort_pickups
    WHERE subscription_id = v_sub.id AND scheduled_date = v_next;

    IF v_existing = 0
       AND v_next >= CURRENT_DATE
       AND (v_sub.status IS DISTINCT FROM 'paused' OR v_sub.paused_until IS NULL OR v_next > v_sub.paused_until) THEN
      INSERT INTO public.smart_sort_pickups (subscription_id, user_id, scheduled_date, time_slot, status)
      VALUES (v_sub.id, v_sub.user_id, v_next, v_sub.time_slot, 'scheduled');
      RETURN jsonb_build_object('success', true, 'next_date', v_next);
    END IF;

    v_next := v_next + v_interval;
    v_guard := v_guard + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'next_date', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.skip_smart_sort_pickup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skip_smart_sort_pickup(uuid) TO authenticated, service_role;

-- ── admin ad-hoc pickup ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_insert_all_pickups" ON public.smart_sort_pickups;
CREATE POLICY "admin_insert_all_pickups" ON public.smart_sort_pickups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.admin_insert_smart_sort_pickup(
  p_subscription_id uuid,
  p_scheduled_date date,
  p_time_slot text DEFAULT 'morning'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.smart_sort_subscriptions%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.smart_sort_caller_is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_sub FROM public.smart_sort_subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  INSERT INTO public.smart_sort_pickups (subscription_id, user_id, scheduled_date, time_slot, status)
  VALUES (p_subscription_id, v_sub.user_id, p_scheduled_date, coalesce(nullif(p_time_slot, ''), 'morning'), 'scheduled')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_insert_smart_sort_pickup(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_insert_smart_sort_pickup(uuid, date, text) TO authenticated;

-- Refresh schedule after plan/slot change
CREATE OR REPLACE FUNCTION public.refresh_smart_sort_schedule(p_subscription_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.smart_sort_subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM public.smart_sort_subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM v_sub.user_id
     AND NOT public.smart_sort_caller_is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.smart_sort_pickups
  SET status = 'cancelled', updated_at = now()
  WHERE subscription_id = p_subscription_id
    AND status IN ('scheduled', 'assigned')
    AND scheduled_date >= CURRENT_DATE;

  IF v_sub.status = 'active' THEN
    RETURN public.generate_upcoming_pickups(v_sub.user_id);
  END IF;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_smart_sort_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_smart_sort_schedule(uuid) TO authenticated, service_role;

-- ── invoices: sequence + generator ─────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.smart_sort_invoice_seq START WITH 1 INCREMENT BY 1;

DO $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      WHEN invoice_number ~ '^SS-[0-9]{4}-[0-9]+$'
      THEN substring(invoice_number from '[0-9]+$')::integer
      ELSE 0
    END
  ), 0)
  INTO v_max
  FROM public.smart_sort_invoices;

  PERFORM setval('public.smart_sort_invoice_seq', GREATEST(v_max, 1), v_max > 0);
END $$;

CREATE OR REPLACE FUNCTION public.next_smart_sort_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'SS-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('public.smart_sort_invoice_seq')::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_smart_sort_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_smart_sort_invoice_number() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_next_smart_sort_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.smart_sort_caller_is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN public.next_smart_sort_invoice_number();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_next_smart_sort_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_next_smart_sort_invoice_number() TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_smart_sort_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub RECORD;
  v_start date;
  v_end date;
  v_last date;
  v_inserted integer := 0;
  v_loops integer;
  v_overlap integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.smart_sort_caller_is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR sub IN
    SELECT id, user_id, frequency, plan_price_sle, created_at
    FROM public.smart_sort_subscriptions
    WHERE status = 'active'
      AND plan_price_sle IS NOT NULL
      AND plan_price_sle > 0
  LOOP
    SELECT MAX(period_end) INTO v_last
    FROM public.smart_sort_invoices
    WHERE subscription_id = sub.id AND status IS DISTINCT FROM 'void';

    v_start := CASE WHEN v_last IS NULL THEN sub.created_at::date ELSE v_last + 1 END;
    v_loops := 0;

    WHILE v_start <= CURRENT_DATE AND v_loops < 12 LOOP
      v_end := public.smart_sort_period_end(v_start, sub.frequency);

      SELECT COUNT(*) INTO v_overlap
      FROM public.smart_sort_invoices
      WHERE subscription_id = sub.id
        AND status IS DISTINCT FROM 'void'
        AND period_start <= v_end
        AND period_end >= v_start;

      IF v_overlap = 0 THEN
        INSERT INTO public.smart_sort_invoices (
          subscription_id, user_id, invoice_number,
          period_start, period_end, amount_sle, due_date, status, sent_at
        ) VALUES (
          sub.id, sub.user_id, public.next_smart_sort_invoice_number(),
          v_start, v_end, sub.plan_price_sle, v_end, 'pending', now()
        );
        v_inserted := v_inserted + 1;
      END IF;

      v_start := v_end + 1;
      v_loops := v_loops + 1;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_smart_sort_invoices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_smart_sort_invoices() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_overdue_smart_sort_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.smart_sort_invoices
  SET status = 'overdue', updated_at = now()
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_overdue_smart_sort_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_smart_sort_invoices() TO service_role;

-- First invoice + pickups on signup
CREATE OR REPLACE FUNCTION public.trg_smart_sort_sub_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end date;
BEGIN
  PERFORM public.generate_upcoming_pickups(NEW.user_id);

  IF NEW.status = 'active'
     AND NEW.plan_price_sle IS NOT NULL
     AND NEW.plan_price_sle > 0 THEN
    v_end := public.smart_sort_period_end(CURRENT_DATE, NEW.frequency);
    INSERT INTO public.smart_sort_invoices (
      subscription_id, user_id, invoice_number,
      period_start, period_end, amount_sle, due_date, status, sent_at
    ) VALUES (
      NEW.id, NEW.user_id, public.next_smart_sort_invoice_number(),
      CURRENT_DATE, v_end, NEW.plan_price_sle, v_end, 'pending', now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_smart_sort_sub_after_insert ON public.smart_sort_subscriptions;
CREATE TRIGGER trg_smart_sort_sub_after_insert
  AFTER INSERT ON public.smart_sort_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_smart_sort_sub_after_insert();

-- ── cron ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
  job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'smart_sort_daily_pickups';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
  PERFORM cron.schedule(
    'smart_sort_daily_pickups',
    '15 5 * * *',
    $cron$SELECT public.resume_expired_smart_sort_subscriptions(); SELECT public.generate_all_upcoming_pickups();$cron$
  );

  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'smart_sort_nightly_invoices';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
  PERFORM cron.schedule(
    'smart_sort_nightly_invoices',
    '30 2 * * *',
    $cron$SELECT public.generate_smart_sort_invoices(); SELECT public.mark_overdue_smart_sort_invoices();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule Smart Sort cron jobs: %', SQLERRM;
END $$;
