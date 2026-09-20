-- WhatsApp phone OTP at client signup.
-- Adds unique E.164 phone identity, hashed OTP storage, portal flag, and profile guards.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verification_required boolean NOT NULL DEFAULT false;

-- Existing accounts stay ungated. New rows (create-account) set this true.
ALTER TABLE public.profiles
  ALTER COLUMN phone_verification_required SET DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_e164_unique
  ON public.profiles (phone_e164)
  WHERE phone_e164 IS NOT NULL;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS require_phone_verification boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.phone_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'signup'
    CHECK (purpose IN ('signup', 'change_phone')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  verified boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_verification_codes_phone_created_idx
  ON public.phone_verification_codes (phone_e164, created_at DESC);

CREATE INDEX IF NOT EXISTS phone_verification_codes_user_created_idx
  ON public.phone_verification_codes (user_id, created_at DESC);

ALTER TABLE public.phone_verification_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_phone_codes" ON public.phone_verification_codes;
CREATE POLICY "no_direct_access_phone_codes"
  ON public.phone_verification_codes
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.phone_verification_codes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.insert_phone_verification_code(
  target_phone text,
  target_user uuid,
  target_hash text,
  target_purpose text DEFAULT 'signup'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_phone IS NULL OR target_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Enter a valid phone number.';
  END IF;

  IF target_hash IS NULL OR char_length(target_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid verification request.';
  END IF;

  IF target_purpose NOT IN ('signup', 'change_phone') THEN
    RAISE EXCEPTION 'Invalid verification purpose.';
  END IF;

  IF (
    SELECT count(*) FROM public.phone_verification_codes
    WHERE phone_e164 = target_phone
      AND created_at > now() - interval '10 minutes'
  ) >= 3 THEN
    RAISE EXCEPTION 'Too many verification codes requested. Please wait a few minutes and try again.';
  END IF;

  IF (
    SELECT count(*) FROM public.phone_verification_codes
    WHERE user_id = target_user
      AND created_at > now() - interval '10 minutes'
  ) >= 3 THEN
    RAISE EXCEPTION 'Too many verification codes requested. Please wait a few minutes and try again.';
  END IF;

  INSERT INTO public.phone_verification_codes (phone_e164, user_id, code_hash, purpose)
  VALUES (target_phone, target_user, target_hash, target_purpose);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_phone_verification_code(
  target_phone text,
  target_user uuid,
  target_hash text,
  target_purpose text DEFAULT 'signup'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.phone_verification_codes%ROWTYPE;
BEGIN
  SELECT *
  INTO rec
  FROM public.phone_verification_codes
  WHERE phone_e164 = target_phone
    AND user_id = target_user
    AND purpose = target_purpose
    AND verified = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION 'No active verification code found. Please request a new code.';
  END IF;

  IF rec.expires_at < now() THEN
    RAISE EXCEPTION 'This verification code has expired. Please request a new code.';
  END IF;

  IF rec.attempts >= rec.max_attempts THEN
    RAISE EXCEPTION 'Too many incorrect attempts. Please request a new code.';
  END IF;

  UPDATE public.phone_verification_codes
  SET attempts = attempts + 1
  WHERE id = rec.id;

  IF lower(target_hash) <> lower(rec.code_hash) THEN
    RAISE EXCEPTION 'Incorrect verification code. Please check and try again.';
  END IF;

  UPDATE public.phone_verification_codes
  SET verified = true
  WHERE id = rec.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_phone_verification_code(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_phone_verification_code(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_phone_verification_code(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_phone_verification_code(text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Permission denied: only admins can change user roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.is_suspended IS DISTINCT FROM NEW.is_suspended THEN
    RAISE EXCEPTION 'Permission denied: only admins can change suspension state'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.is_verified IS DISTINCT FROM NEW.is_verified THEN
    RAISE EXCEPTION 'Permission denied: only admins can change verification state'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.phone_verified_at IS DISTINCT FROM NEW.phone_verified_at THEN
    RAISE EXCEPTION 'Permission denied: phone verification cannot be changed directly'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.phone_verification_required IS DISTINCT FROM NEW.phone_verification_required THEN
    RAISE EXCEPTION 'Permission denied: phone verification requirement cannot be changed directly'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.phone IS DISTINCT FROM NEW.phone
     OR OLD.phone_e164 IS DISTINCT FROM NEW.phone_e164 THEN
    RAISE EXCEPTION 'Permission denied: change your phone number with WhatsApp verification'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_role ON public.profiles;
CREATE TRIGGER trg_guard_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_role();

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
    require_phone_verification = CASE
      WHEN p_patch ? 'require_phone_verification' THEN COALESCE((p_patch->>'require_phone_verification')::boolean, require_phone_verification)
      ELSE require_phone_verification
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
    'require_phone_verification', s.require_phone_verification,
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
      'require_phone_verification', before_row->'require_phone_verification',
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

REVOKE ALL ON FUNCTION public.update_portal_settings(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_portal_settings(jsonb) TO authenticated;
