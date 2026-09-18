-- Portal settings: client visibility, branding, access controls, and admin-only writes.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS registration_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_email_verification boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_company_name text NOT NULL DEFAULT 'Alphatek Nexus',
  ADD COLUMN IF NOT EXISTS portal_tagline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS portal_support_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS portal_announcement text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS portal_announcement_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_portal_company_name_len,
  DROP CONSTRAINT IF EXISTS app_settings_portal_tagline_len,
  DROP CONSTRAINT IF EXISTS app_settings_portal_support_email_len,
  DROP CONSTRAINT IF EXISTS app_settings_portal_announcement_len;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_portal_company_name_len CHECK (char_length(portal_company_name) BETWEEN 1 AND 80),
  ADD CONSTRAINT app_settings_portal_tagline_len CHECK (char_length(portal_tagline) <= 160),
  ADD CONSTRAINT app_settings_portal_support_email_len CHECK (char_length(portal_support_email) <= 120),
  ADD CONSTRAINT app_settings_portal_announcement_len CHECK (char_length(portal_announcement) <= 280);

CREATE TABLE IF NOT EXISTS public.settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settings_audit_created_idx ON public.settings_audit (created_at DESC);

ALTER TABLE public.settings_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_settings_audit" ON public.settings_audit;
CREATE POLICY "admin_select_settings_audit" ON public.settings_audit
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.settings_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.settings_audit TO authenticated;

CREATE OR REPLACE FUNCTION public._sanitize_plain_text(p_value text, p_max int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(
    btrim(regexp_replace(coalesce(p_value, ''), '<[^>]*>', '', 'g')),
    GREATEST(p_max, 0)
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_app_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.id := 1;
  NEW.portal_company_name := public._sanitize_plain_text(NEW.portal_company_name, 80);
  IF NEW.portal_company_name = '' THEN
    NEW.portal_company_name := 'Alphatek Nexus';
  END IF;
  NEW.portal_tagline := public._sanitize_plain_text(NEW.portal_tagline, 160);
  NEW.portal_support_email := lower(public._sanitize_plain_text(NEW.portal_support_email, 120));
  IF NEW.portal_support_email <> ''
     AND NEW.portal_support_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid support email or leave it blank';
  END IF;
  NEW.portal_announcement := public._sanitize_plain_text(NEW.portal_announcement, 280);
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_app_settings ON public.app_settings;
CREATE TRIGGER trg_guard_app_settings
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_app_settings();

CREATE OR REPLACE FUNCTION public.update_portal_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_row jsonb;
  after_row jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'No settings to update';
  END IF;

  SELECT to_jsonb(s) INTO before_row FROM public.app_settings s WHERE s.id = 1;
  IF before_row IS NULL THEN
    RAISE EXCEPTION 'Settings row is missing';
  END IF;

  UPDATE public.app_settings SET
    portal_enabled = CASE
      WHEN p_patch ? 'portal_enabled' THEN COALESCE((p_patch->>'portal_enabled')::boolean, portal_enabled)
      ELSE portal_enabled
    END,
    registration_enabled = CASE
      WHEN p_patch ? 'registration_enabled' THEN COALESCE((p_patch->>'registration_enabled')::boolean, registration_enabled)
      ELSE registration_enabled
    END,
    require_email_verification = CASE
      WHEN p_patch ? 'require_email_verification' THEN COALESCE((p_patch->>'require_email_verification')::boolean, require_email_verification)
      ELSE require_email_verification
    END,
    portal_announcement_enabled = CASE
      WHEN p_patch ? 'portal_announcement_enabled' THEN COALESCE((p_patch->>'portal_announcement_enabled')::boolean, portal_announcement_enabled)
      ELSE portal_announcement_enabled
    END,
    portal_company_name = CASE
      WHEN p_patch ? 'portal_company_name' THEN COALESCE(p_patch->>'portal_company_name', portal_company_name)
      ELSE portal_company_name
    END,
    portal_tagline = CASE
      WHEN p_patch ? 'portal_tagline' THEN COALESCE(p_patch->>'portal_tagline', portal_tagline)
      ELSE portal_tagline
    END,
    portal_support_email = CASE
      WHEN p_patch ? 'portal_support_email' THEN COALESCE(p_patch->>'portal_support_email', portal_support_email)
      ELSE portal_support_email
    END,
    portal_announcement = CASE
      WHEN p_patch ? 'portal_announcement' THEN COALESCE(p_patch->>'portal_announcement', portal_announcement)
      ELSE portal_announcement
    END
  WHERE id = 1;

  SELECT jsonb_build_object(
    'portal_enabled', s.portal_enabled,
    'registration_enabled', s.registration_enabled,
    'require_email_verification', s.require_email_verification,
    'portal_company_name', s.portal_company_name,
    'portal_tagline', s.portal_tagline,
    'portal_support_email', s.portal_support_email,
    'portal_announcement', s.portal_announcement,
    'portal_announcement_enabled', s.portal_announcement_enabled,
    'updated_at', s.updated_at
  ) INTO after_row
  FROM public.app_settings s WHERE s.id = 1;

  INSERT INTO public.settings_audit (actor_id, action, before_state, after_state)
  VALUES (
    auth.uid(),
    'update_portal_settings',
    jsonb_build_object(
      'portal_enabled', before_row->'portal_enabled',
      'registration_enabled', before_row->'registration_enabled',
      'require_email_verification', before_row->'require_email_verification',
      'portal_company_name', before_row->'portal_company_name',
      'portal_tagline', before_row->'portal_tagline',
      'portal_support_email', before_row->'portal_support_email',
      'portal_announcement', before_row->'portal_announcement',
      'portal_announcement_enabled', before_row->'portal_announcement_enabled'
    ),
    after_row
  );

  RETURN after_row;
END;
$$;

REVOKE ALL ON FUNCTION public._sanitize_plain_text(text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_app_settings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_portal_settings(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_portal_settings(jsonb) TO authenticated;
