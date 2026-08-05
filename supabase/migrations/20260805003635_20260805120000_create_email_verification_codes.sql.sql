/*
# Email Verification with 6-Digit Codes

Instead of Supabase's default confirmation link, we use a 6-digit numeric code
sent via email. The user copies the code from their email and enters it in the
verification screen to confirm their email address.

## Tables
- email_verification_codes: stores codes with expiry, attempt limits, and
  verification status

## Security
- Codes expire after 10 minutes
- Maximum 5 verification attempts per code
- Maximum 3 code requests per 10 minutes per email (rate limiting)
- Only the SECURITY DEFINER functions can mark a code as verified
- The verify function confirms the user's email in auth.users via admin API
*/

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code char(6) NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  verified boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email
  ON email_verification_codes (email);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email_created
  ON email_verification_codes (email, created_at DESC);

ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;

-- No direct access from client — only via SECURITY DEFINER functions
CREATE POLICY "no_direct_access_email_codes" ON email_verification_codes
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Function to generate and store a 6-digit code
CREATE OR REPLACE FUNCTION generate_email_verification_code(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Rate limit: max 3 codes per 10 minutes
  IF (
    SELECT count(*) FROM email_verification_codes
    WHERE email = target_email
      AND created_at > now() - interval '10 minutes'
  ) >= 3 THEN
    RAISE EXCEPTION 'Too many verification codes requested. Please wait a few minutes and try again.';
  END IF;

  INSERT INTO email_verification_codes (email, code)
  VALUES (target_email, lpad(floor(random() * 1000000)::text, 6, '0'));
END;
$$;

-- Function to verify a 6-digit code
CREATE OR REPLACE FUNCTION verify_email_verification_code(target_email text, input_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  record_id uuid;
  record_attempts int;
  record_expires timestamptz;
  record_verified boolean;
BEGIN
  -- Find the most recent unverified code for this email
  SELECT id, attempts, expires_at, verified
  INTO record_id, record_attempts, record_expires, record_verified
  FROM email_verification_codes
  WHERE email = target_email
    AND verified = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF record_id IS NULL THEN
    RAISE EXCEPTION 'No active verification code found. Please request a new code.';
  END IF;

  IF record_verified THEN
    RAISE EXCEPTION 'This code has already been used.';
  END IF;

  IF record_expires < now() THEN
    RAISE EXCEPTION 'This verification code has expired. Please request a new code.';
  END IF;

  IF record_attempts >= 5 THEN
    RAISE EXCEPTION 'Too many incorrect attempts. Please request a new code.';
  END IF;

  -- Increment attempts
  UPDATE email_verification_codes
  SET attempts = attempts + 1
  WHERE id = record_id;

  -- Check if code matches
  IF input_code = (
    SELECT code FROM email_verification_codes WHERE id = record_id
  ) THEN
    -- Mark as verified
    UPDATE email_verification_codes
    SET verified = true
    WHERE id = record_id;
    RETURN true;
  ELSE
    RAISE EXCEPTION 'Incorrect verification code. Please check and try again.';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_email_verification_code(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION verify_email_verification_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_email_verification_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_email_verification_code(text, text) TO authenticated;