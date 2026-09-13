-- Campaigns: promo / marketing / discount broadcasts to clients

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.media_assets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.media_assets DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_category_check
  CHECK (category IN ('app_logo', 'service_branding', 'login_carousel', 'splash', 'general', 'campaign'));

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('promo', 'marketing', 'discount')),
  title text NOT NULL,
  body text NOT NULL,
  email_body text,
  media_url text,
  media_path text,
  cta_label text,
  cta_page text,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'service')),
  service_slugs text[] NOT NULL DEFAULT '{}',
  channel_email boolean NOT NULL DEFAULT true,
  channel_push boolean NOT NULL DEFAULT true,
  channel_in_app boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count integer NOT NULL DEFAULT 0,
  enqueued_count integer NOT NULL DEFAULT 0,
  error text
);

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  outbox_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled
  ON public.campaigns (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_campaigns_status_sent
  ON public.campaigns (status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign
  ON public.campaign_recipients (campaign_id);

CREATE OR REPLACE FUNCTION public.touch_campaigns_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_campaigns_updated_at();

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_admin_all ON public.campaigns;
CREATE POLICY campaigns_admin_all
  ON public.campaigns
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campaigns_client_read_sent ON public.campaigns;
CREATE POLICY campaigns_client_read_sent
  ON public.campaigns
  FOR SELECT
  TO authenticated
  USING (status = 'sent');

DROP POLICY IF EXISTS campaign_recipients_admin_all ON public.campaign_recipients;
CREATE POLICY campaign_recipients_admin_all
  ON public.campaign_recipients
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;

-- Scheduled dispatch: cron (or send-campaign process-scheduled) enqueues due rows.
CREATE OR REPLACE FUNCTION public.process_due_campaigns()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns%ROWTYPE;
  v_user_id uuid;
  v_outbox_id uuid;
  v_recipients integer;
  v_enqueued integer;
  v_processed integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.campaigns WHERE status = 'sending') THEN
    RETURN 0;
  END IF;

  FOR v_campaign IN
    SELECT *
    FROM public.campaigns
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT 5
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.campaigns
    SET status = 'sending', error = NULL
    WHERE id = v_campaign.id
      AND status = 'scheduled';

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_recipients := 0;
    v_enqueued := 0;

    BEGIN
      IF v_campaign.audience = 'service' AND COALESCE(array_length(v_campaign.service_slugs, 1), 0) > 0 THEN
        FOR v_user_id IN
          SELECT DISTINCT b.user_id
          FROM public.bookings b
          JOIN public.services s ON s.id = b.service_id
          WHERE s.slug = ANY (v_campaign.service_slugs)
            AND b.user_id IS NOT NULL
        LOOP
          v_recipients := v_recipients + 1;
          v_outbox_id := public.enqueue_notification(
            v_user_id,
            'client',
            'announcement',
            v_campaign.title,
            v_campaign.body,
            'system',
            jsonb_build_object(
              'campaign_id', v_campaign.id,
              'kind', v_campaign.kind,
              'media_url', v_campaign.media_url,
              'email_body', v_campaign.email_body,
              'cta_page', v_campaign.cta_page,
              'cta_label', v_campaign.cta_label,
              'service_slugs', array_to_string(COALESCE(v_campaign.service_slugs, '{}'), ','),
              'channels_email', v_campaign.channel_email,
              'channels_push', v_campaign.channel_push,
              'channels_in_app', v_campaign.channel_in_app
            )
          );
          INSERT INTO public.campaign_recipients (campaign_id, user_id, outbox_id)
          VALUES (v_campaign.id, v_user_id, v_outbox_id)
          ON CONFLICT (campaign_id, user_id) DO UPDATE SET outbox_id = EXCLUDED.outbox_id;
          v_enqueued := v_enqueued + 1;
        END LOOP;
      ELSE
        FOR v_user_id IN
          SELECT id FROM public.profiles WHERE role IS DISTINCT FROM 'admin'
        LOOP
          v_recipients := v_recipients + 1;
          v_outbox_id := public.enqueue_notification(
            v_user_id,
            'client',
            'announcement',
            v_campaign.title,
            v_campaign.body,
            'system',
            jsonb_build_object(
              'campaign_id', v_campaign.id,
              'kind', v_campaign.kind,
              'media_url', v_campaign.media_url,
              'email_body', v_campaign.email_body,
              'cta_page', v_campaign.cta_page,
              'cta_label', v_campaign.cta_label,
              'service_slugs', array_to_string(COALESCE(v_campaign.service_slugs, '{}'), ','),
              'channels_email', v_campaign.channel_email,
              'channels_push', v_campaign.channel_push,
              'channels_in_app', v_campaign.channel_in_app
            )
          );
          INSERT INTO public.campaign_recipients (campaign_id, user_id, outbox_id)
          VALUES (v_campaign.id, v_user_id, v_outbox_id)
          ON CONFLICT (campaign_id, user_id) DO UPDATE SET outbox_id = EXCLUDED.outbox_id;
          v_enqueued := v_enqueued + 1;
        END LOOP;
      END IF;

      UPDATE public.campaigns
      SET status = 'sent',
          sent_at = now(),
          recipient_count = v_recipients,
          enqueued_count = v_enqueued,
          error = NULL
      WHERE id = v_campaign.id;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.campaigns
      SET status = 'failed', error = SQLERRM
      WHERE id = v_campaign.id;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_campaigns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_campaigns() TO service_role;

DO $$
DECLARE
  job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'process_due_campaigns';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
  PERFORM cron.schedule(
    'process_due_campaigns',
    '* * * * *',
    $cron$SELECT public.process_due_campaigns();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule process_due_campaigns: %', SQLERRM;
END $$;
