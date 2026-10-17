-- Consent-aware campaign targeting, display windows, and engagement analytics.

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS cat_marketing boolean NOT NULL DEFAULT true;

ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_category_check;
ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_category_check
    CHECK (category IN (
      'bookings', 'payments', 'messages', 'field_dispatch',
      'hr', 'incidents', 'smart_sort', 'system', 'marketing'
    ));

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS audience_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_audience_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_audience_check
    CHECK (audience IN ('all', 'service', 'new_clients', 'inactive_clients', 'recent_bookers', 'wallet_users'));

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_audience_days_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_audience_days_check
    CHECK (audience_days BETWEEN 1 AND 365);

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_priority_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_priority_check
    CHECK (priority BETWEEN 0 AND 10);

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_expiry_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_expiry_check
    CHECK (expires_at IS NULL OR scheduled_at IS NULL OR expires_at > scheduled_at);

CREATE TABLE IF NOT EXISTS public.campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'dismiss')),
  channel text NOT NULL DEFAULT 'in_app'
    CHECK (channel IN ('in_app', 'notification', 'push', 'email', 'share')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id, event_type, channel)
);

CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign_type
  ON public.campaign_events (campaign_id, event_type);
CREATE INDEX IF NOT EXISTS idx_campaign_events_user_created
  ON public.campaign_events (user_id, created_at DESC);

ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_events_admin_read ON public.campaign_events;
CREATE POLICY campaign_events_admin_read
  ON public.campaign_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS campaign_events_client_read_own ON public.campaign_events;
CREATE POLICY campaign_events_client_read_own
  ON public.campaign_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS campaign_recipients_client_read_own ON public.campaign_recipients;
CREATE POLICY campaign_recipients_client_read_own
  ON public.campaign_recipients
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS campaigns_client_read_sent ON public.campaigns;
CREATE POLICY campaigns_client_read_sent
  ON public.campaigns
  FOR SELECT
  TO authenticated
  USING (
    status = 'sent'
    AND (expires_at IS NULL OR expires_at > now())
    AND EXISTS (
      SELECT 1
      FROM public.campaign_recipients cr
      WHERE cr.campaign_id = campaigns.id
        AND cr.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.campaign_events TO authenticated;

CREATE OR REPLACE FUNCTION public.track_campaign_event(
  p_campaign_id uuid,
  p_event_type text,
  p_channel text DEFAULT 'in_app'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  IF p_event_type NOT IN ('impression', 'click', 'dismiss') THEN
    RAISE EXCEPTION 'Invalid campaign event';
  END IF;
  IF p_channel NOT IN ('in_app', 'notification', 'push', 'email', 'share') THEN
    RAISE EXCEPTION 'Invalid campaign channel';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.campaign_recipients
    WHERE campaign_id = p_campaign_id
      AND user_id = v_user_id
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.campaign_events (campaign_id, user_id, event_type, channel)
  VALUES (p_campaign_id, v_user_id, p_event_type, p_channel)
  ON CONFLICT (campaign_id, user_id, event_type, channel) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.track_campaign_event(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.track_campaign_event(uuid, text, text) TO authenticated;

-- Keep the database cron path aligned with the send-campaign Edge Function.
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

    IF v_campaign.expires_at IS NOT NULL AND v_campaign.expires_at <= now() THEN
      UPDATE public.campaigns
      SET status = 'cancelled', error = 'Campaign expired before it could be sent.'
      WHERE id = v_campaign.id;
      CONTINUE;
    END IF;

    v_recipients := 0;
    v_enqueued := 0;

    BEGIN
      FOR v_user_id IN
        SELECT DISTINCT p.id
        FROM public.profiles p
        LEFT JOIN public.notification_preferences np ON np.user_id = p.id
        WHERE p.role IS DISTINCT FROM 'admin'
          AND COALESCE(np.cat_marketing, true)
          AND (
            (v_campaign.channel_email AND COALESCE(np.email_enabled, true))
            OR (
              v_campaign.channel_push
              AND COALESCE(np.push_enabled, true)
              AND EXISTS (
                SELECT 1
                FROM public.push_subscriptions ps
                WHERE ps.user_id = p.id
                  AND ps.is_active
              )
            )
            OR (v_campaign.channel_in_app AND COALESCE(np.in_app_enabled, true))
          )
          AND (
            v_campaign.audience = 'all'
            OR (
              v_campaign.audience = 'service'
              AND EXISTS (
                SELECT 1
                FROM public.bookings b
                JOIN public.services s ON s.id = b.service_id
                WHERE b.user_id = p.id
                  AND s.slug = ANY (COALESCE(v_campaign.service_slugs, '{}'))
              )
            )
            OR (
              v_campaign.audience = 'new_clients'
              AND p.created_at >= now() - make_interval(days => v_campaign.audience_days)
            )
            OR (
              v_campaign.audience = 'inactive_clients'
              AND p.created_at < now() - make_interval(days => v_campaign.audience_days)
              AND NOT EXISTS (
                SELECT 1
                FROM public.bookings b
                WHERE b.user_id = p.id
                  AND b.created_at >= now() - make_interval(days => v_campaign.audience_days)
              )
            )
            OR (
              v_campaign.audience = 'recent_bookers'
              AND EXISTS (
                SELECT 1
                FROM public.bookings b
                WHERE b.user_id = p.id
                  AND b.created_at >= now() - make_interval(days => v_campaign.audience_days)
              )
            )
            OR (
              v_campaign.audience = 'wallet_users'
              AND EXISTS (
                SELECT 1
                FROM public.wallet_transactions wt
                WHERE wt.user_id = p.id
                  AND wt.status = 'completed'
              )
            )
          )
      LOOP
        v_recipients := v_recipients + 1;
        v_outbox_id := public.enqueue_notification(
          v_user_id,
          'client',
          'announcement',
          v_campaign.title,
          v_campaign.body,
          'marketing',
          jsonb_build_object(
            'campaign_id', v_campaign.id,
            'kind', v_campaign.kind,
            'media_url', v_campaign.media_url,
            'email_body', v_campaign.email_body,
            'cta_page', v_campaign.cta_page,
            'cta_label', v_campaign.cta_label,
            'screen', CASE
              WHEN v_campaign.cta_page IN ('home', 'services', 'bookings', 'account', 'payments', 'billing', 'quotes', 'support')
                THEN v_campaign.cta_page
              ELSE 'services'
            END,
            'channel_id', 'marketing',
            'link', CASE
              WHEN v_campaign.cta_page IN ('home', 'services', 'bookings', 'account', 'payments', 'billing', 'quotes', 'support')
                THEN '/?page=' || v_campaign.cta_page || '&campaign=' || v_campaign.id || '&campaign_channel=push'
              ELSE '/?page=services&campaign=' || v_campaign.id || '&campaign_channel=push'
            END,
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
