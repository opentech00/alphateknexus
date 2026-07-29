-- Add brute-force protection columns to user_2fa
ALTER TABLE user_2fa ADD COLUMN IF NOT EXISTS totp_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE user_2fa ADD COLUMN IF NOT EXISTS totp_locked_until timestamptz;
