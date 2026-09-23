/*
  Signup no longer sends WhatsApp OTP.
  New accounts keep a unique E.164 phone but are not gated on phone verification.
  Email verification remains the possession check.
*/

ALTER TABLE public.profiles
  ALTER COLUMN phone_verification_required SET DEFAULT false;

UPDATE public.profiles
SET phone_verification_required = false
WHERE phone_verified_at IS NULL
  AND phone_verification_required = true;

ALTER TABLE public.app_settings
  ALTER COLUMN require_phone_verification SET DEFAULT false;

UPDATE public.app_settings
SET require_phone_verification = false
WHERE id = 1
  AND require_phone_verification = true;
