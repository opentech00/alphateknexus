/*
# Add referral_code to profiles with auto-generation on signup

## Purpose
Every new user gets a unique referral code in the format ALNEXUS-XXXX
(where XXXX is 4 random uppercase alphanumeric characters) automatically
when their profile row is created.

## Changes
1. New column on `profiles`:
   - `referral_code` (text, UNIQUE, NULLABLE initially — backfilled below)

2. New SQL function `generate_referral_code()`:
   - Generates codes in the format ALNEXUS-XXXX
   - Retries up to 10 times to guarantee uniqueness against existing codes

3. New trigger `set_referral_code_on_profiles`:
   - Fires BEFORE INSERT on `profiles`
   - Calls `generate_referral_code()` if no code is provided

4. Backfill existing profiles with codes.

## Security
- No new RLS policies needed; profiles table already has owner-scoped RLS.
- The function is SECURITY DEFINER so the trigger can check for uniqueness.

## Notes
- The column is added with IF NOT EXISTS to be idempotent.
- Existing rows are backfilled with unique codes via UPDATE.
*/

-- 1. Add referral_code column if it doesn't exist
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- 2. Function to generate a unique ALNEXUS-XXXX code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  code   text;
  suffix text;
  i      int;
  tries  int := 0;
BEGIN
  LOOP
    suffix := '';
    FOR i IN 1..4 LOOP
      suffix := suffix || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    code := 'ALNEXUS-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = code);
    tries := tries + 1;
    IF tries >= 20 THEN
      -- Fall back to 6-char suffix if 4-char space is somehow exhausted
      suffix := '';
      FOR i IN 1..6 LOOP
        suffix := suffix || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      code := 'ALNEXUS-' || suffix;
      EXIT;
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- 3. Trigger function that sets referral_code before insert
CREATE OR REPLACE FUNCTION trg_set_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Attach trigger to profiles (idempotent)
DROP TRIGGER IF EXISTS set_referral_code_on_profiles ON profiles;
CREATE TRIGGER set_referral_code_on_profiles
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_set_referral_code();

-- 5. Backfill existing profiles that don't have a code yet
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE referral_code IS NULL LOOP
    UPDATE profiles SET referral_code = generate_referral_code() WHERE id = r.id;
  END LOOP;
END;
$$;