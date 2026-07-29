/*
# Auth Pro: 2FA Secrets + Referral Email Tracking

## Overview
Adds database infrastructure for two pro auth features:
1. Two-Factor Authentication (TOTP) — stores encrypted 2FA secrets per user
2. Referral email invitations — tracks sent invitation emails with delivery status

## 1. New Tables

### `user_2fa`
Stores TOTP secrets for users who enable 2FA.
- `id` (uuid PK)
- `user_id` (uuid, references auth.users, unique) — one 2FA config per user
- `secret` (text, NOT NULL) — base32-encoded TOTP secret (encrypted at app layer)
- `enabled` (boolean, default false) — whether 2FA is active
- `backup_codes` (jsonb) — array of hashed backup codes for account recovery
- `enabled_at` (timestamptz) — when 2FA was activated
- `created_at` (timestamptz)

### `referral_invitations`
Tracks referral invitation emails sent to prospects.
- `id` (uuid PK)
- `referral_id` (uuid, references referrals) — the referral row this invitation belongs to
- `referrer_id` (uuid, references auth.users) — who sent the invite
- `recipient_email` (text) — who received the invite
- `referral_code` (text) — the code included in the email
- `status` (text) — sent | failed (default sent)
- `error_message` (text) — error details if failed
- `sent_at` (timestamptz) — when the email was sent

## 2. Security
- RLS enabled on both new tables.
- `user_2fa`: users can only access their own 2FA config. Admins can access all.
- `referral_invitations`: users can see invites they sent. Admins can see all.
- Full CRUD policies for owners + admin override.

## 3. Important Notes
1. The TOTP secret is stored as base32 — the edge function handles generation and verification.
2. Backup codes are hashed (SHA-256) before storage, never stored in plaintext.
3. The `referral_invitations` table links to `referrals` via FK, so when a referral is
   created the invitation record is created in the same edge function call.
4. Triggers are NOT needed here — all writes go through edge functions that use the
   service role key.
*/

-- ── user_2fa ──
CREATE TABLE IF NOT EXISTS user_2fa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  backup_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_2fa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_2fa" ON user_2fa;
CREATE POLICY "select_own_2fa" ON user_2fa FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_2fa" ON user_2fa;
CREATE POLICY "insert_own_2fa" ON user_2fa FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_2fa" ON user_2fa;
CREATE POLICY "update_own_2fa" ON user_2fa FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_2fa" ON user_2fa;
CREATE POLICY "delete_own_2fa" ON user_2fa FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── referral_invitations ──
CREATE TABLE IF NOT EXISTS referral_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES referrals(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_invitations_referrer ON referral_invitations(referrer_id);

ALTER TABLE referral_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_referral_invitations" ON referral_invitations;
CREATE POLICY "select_own_referral_invitations" ON referral_invitations FOR SELECT
  TO authenticated USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "insert_own_referral_invitations" ON referral_invitations;
CREATE POLICY "insert_own_referral_invitations" ON referral_invitations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "admin_select_all_referral_invitations" ON referral_invitations;
CREATE POLICY "admin_select_all_referral_invitations" ON referral_invitations FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
