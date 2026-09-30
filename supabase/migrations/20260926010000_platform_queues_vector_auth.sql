/*
  Platform upgrades:
  1. Job queue (SKIP LOCKED, Pgmq-style retries) for webhook follow-up and article indexing
  2. pgvector + full-text knowledge articles for support search
  3. Custom access token hook (app_role on JWT) — enable in Auth → Hooks
*/

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. Job queue ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed', 'dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 8,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_job_queue_claim
  ON public.job_queue (available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_job_queue_status_created
  ON public.job_queue (status, created_at DESC);

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_job_queue" ON public.job_queue;
CREATE POLICY "admin_select_job_queue" ON public.job_queue
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.enqueue_job(
  p_kind text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_delay_seconds int DEFAULT 0
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_kind IS NULL OR length(trim(p_kind)) = 0 THEN
    RAISE EXCEPTION 'job kind is required';
  END IF;
  INSERT INTO public.job_queue (kind, payload, available_at)
  VALUES (
    trim(p_kind),
    COALESCE(p_payload, '{}'::jsonb),
    now() + make_interval(secs => GREATEST(0, COALESCE(p_delay_seconds, 0)))
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_job(text, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_job(text, jsonb, int) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_jobs(
  p_limit int DEFAULT 8,
  p_worker text DEFAULT 'edge'
)
RETURNS SETOF public.job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next AS (
    SELECT id
    FROM public.job_queue
    WHERE status = 'queued'
      AND available_at <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 25))
  )
  UPDATE public.job_queue q
  SET
    status = 'processing',
    locked_at = now(),
    locked_by = COALESCE(p_worker, 'edge'),
    attempts = q.attempts + 1
  FROM next
  WHERE q.id = next.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_jobs(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_jobs(int, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_job(p_id bigint, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.job_queue;
  v_delay int;
BEGIN
  SELECT * INTO v_row FROM public.job_queue WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_error IS NULL THEN
    UPDATE public.job_queue
    SET status = 'done', completed_at = now(), last_error = NULL, locked_at = NULL
    WHERE id = p_id;
    RETURN;
  END IF;

  IF v_row.attempts >= v_row.max_attempts THEN
    UPDATE public.job_queue
    SET status = 'dead', last_error = p_error, locked_at = NULL, completed_at = now()
    WHERE id = p_id;
    RETURN;
  END IF;

  v_delay := LEAST(3600, 15 * (2 ^ GREATEST(v_row.attempts - 1, 0))::int);
  UPDATE public.job_queue
  SET
    status = 'queued',
    last_error = p_error,
    locked_at = NULL,
    available_at = now() + make_interval(secs => v_delay)
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_job(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_job(bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.requeue_job(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  UPDATE public.job_queue
  SET status = 'queued', available_at = now(), last_error = NULL, locked_at = NULL, completed_at = NULL
  WHERE id = p_id
    AND status IN ('failed', 'dead', 'queued');
END;
$$;

REVOKE ALL ON FUNCTION public.requeue_job(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requeue_job(bigint) TO authenticated;

-- Recover jobs stuck in processing (worker crash)
CREATE OR REPLACE FUNCTION public.reclaim_stale_jobs()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.job_queue
  SET status = 'queued', locked_at = NULL, available_at = now()
  WHERE status = 'processing'
    AND locked_at < now() - interval '10 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.reclaim_stale_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_jobs() TO service_role;

-- ── 2. Knowledge / vector search ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  is_published boolean NOT NULL DEFAULT true,
  embedding vector(1536),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_search ON public.knowledge_articles USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_knowledge_title_trgm ON public.knowledge_articles USING gin (title gin_trgm_ops);

ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_published_knowledge" ON public.knowledge_articles;
CREATE POLICY "read_published_knowledge" ON public.knowledge_articles
  FOR SELECT TO authenticated
  USING (is_published OR public.is_admin());

DROP POLICY IF EXISTS "admin_write_knowledge" ON public.knowledge_articles;
CREATE POLICY "admin_write_knowledge" ON public.knowledge_articles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.search_knowledge(p_query text, p_limit int DEFAULT 5)
RETURNS TABLE (
  article_id uuid,
  slug text,
  title text,
  excerpt text,
  category text,
  rank real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q tsquery;
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN QUERY
    SELECT a.id, a.slug, a.title, left(a.body, 200), a.category, 0::real
    FROM public.knowledge_articles a
    WHERE a.is_published
    ORDER BY a.updated_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20));
    RETURN;
  END IF;

  BEGIN
    v_q := websearch_to_tsquery('english', trim(p_query));
  EXCEPTION WHEN OTHERS THEN
    v_q := plainto_tsquery('english', trim(p_query));
  END;

  RETURN QUERY
  SELECT
    a.id,
    a.slug,
    a.title,
    left(a.body, 200),
    a.category,
    GREATEST(
      ts_rank(a.search_vector, v_q),
      similarity(a.title, trim(p_query))
    )::real AS rank
  FROM public.knowledge_articles a
  WHERE a.is_published
    AND (
      (v_q IS NOT NULL AND a.search_vector @@ v_q)
      OR a.title ILIKE '%' || trim(p_query) || '%'
      OR a.body ILIKE '%' || trim(p_query) || '%'
    )
  ORDER BY rank DESC, a.updated_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20));
END;
$$;

REVOKE ALL ON FUNCTION public.search_knowledge(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_knowledge(text, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.match_knowledge_embedding(
  p_embedding vector(1536),
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  article_id uuid,
  slug text,
  title text,
  excerpt text,
  category text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.slug,
    a.title,
    left(a.body, 200),
    a.category,
    (1 - (a.embedding <=> p_embedding))::real AS rank
  FROM public.knowledge_articles a
  WHERE a.is_published AND a.embedding IS NOT NULL
  ORDER BY a.embedding <=> p_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20));
$$;

REVOKE ALL ON FUNCTION public.match_knowledge_embedding(vector, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_knowledge_embedding(vector, int) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_knowledge_enqueue_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_job('index_article', jsonb_build_object('article_id', NEW.id), 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_enqueue_index ON public.knowledge_articles;
CREATE TRIGGER trg_knowledge_enqueue_index
  AFTER INSERT OR UPDATE OF title, body ON public.knowledge_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_knowledge_enqueue_index();

INSERT INTO public.knowledge_articles (slug, title, body, category) VALUES
(
  'wallet-topup-monime',
  'How to top up your wallet with Monime',
  'Open Account → Wallet → Top up. Choose Monime and enter at least SLE 5. Pay with Orange Money, AfriMoney, card, or bank in the Monime checkout. Your wallet is credited only after the bank confirms — this page never marks a payment as paid by itself. If you do not have enough money in the mobile wallet, the app shows Insufficient funds with Retry or Cancel. Failed attempts stay in wallet history and do not change your balance.',
  'payments'
),
(
  'payment-failed-retry',
  'What to do if a Monime payment fails',
  'If checkout is declined, expired, cancelled, or times out, stay on the fail screen. Retry payment starts a fresh checkout. Check again only asks the bank about the same session (use this if you already paid). Cancel leaves without charging. Finance can see the stored failure reason. Cash top-up is a separate in-person option that an admin confirms later.',
  'payments'
),
(
  'pay-booking',
  'Paying for a booking',
  'You can pay a booking with Monime (full amount or a deposit if quoted), wallet credit, cash on delivery, or a bank slip for verification. Wallet payment needs a completed balance that covers the amount due. After Monime, wait for confirmation on the return page. Field crew can also collect the remaining balance with a Monime QR on site.',
  'bookings'
),
(
  'cash-topup',
  'Requesting a cash wallet top-up',
  'Choose Cash on the wallet top-up form. Bring the exact amount to the office or a field agent. The wallet is credited after an admin confirms receipt. Online Monime top-ups are instant once the payment is confirmed.',
  'payments'
),
(
  'field-live-status',
  'Field crew live status',
  'While the field app is open and online, dispatch can see you as live. Keep the app open on a job so coordinators know you are reachable. Going offline (no signal or the app closed) drops the live badge until you return.',
  'field'
)
ON CONFLICT (slug) DO NOTHING;

-- ── 3. Auth custom access token hook ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := COALESCE(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{app_role}', to_jsonb(COALESCE(user_role, 'client')));
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
  GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.jwt_app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'app_role', '');
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.jwt_app_role() = 'admin', false)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.jwt_app_role() TO authenticated, anon;

-- Cron: drain job queue every minute (same project URL as notification outbox)
DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'process_atn_jobs';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
  PERFORM cron.schedule(
    'process_atn_jobs',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://gkoapxptrwarqiasrtsu.supabase.co/functions/v1/process-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdrb2FweHB0cndhcnFpYXNydHN1Iiwicm9sIjoiYW5vbiIsImlhdCI6MTc4NDU1MTcwNCwiZXhwIjoyMTAwMTI3NzA0fQ.f0iOA4UHr-2nRLQzbGVB0OwQFfNTEobhye_AzlpoQ9s'
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;
