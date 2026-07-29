/*
# Referral Credits + User Appearance Preferences

## Purpose
Adds two new capabilities to the client Account module:
1. A referral system — each client gets a unique referral code, can invite others, and earns wallet credit when a referral completes their first booking.
2. Per-user appearance preferences (theme + accent color) so the client portal can remember their display choices.

## New Tables

### referrals
- `id` (uuid, PK)
- `referrer_id` (uuid, FK → profiles.id, NOT NULL) — the user who owns the referral code
- `referral_code` (text, UNIQUE, NOT NULL) — short alphanumeric code the user shares
- `referred_email` (text, NULLABLE) — email of the invited person (set when an invite is tracked)
- `referred_id` (uuid, FK → profiles.id, NULLABLE) — the user who signed up using the code (filled on signup)
- `status` (text, NOT NULL DEFAULT 'pending') — pending | completed | cancelled
- `reward_amount` (numeric, NOT NULL DEFAULT 50) — wallet credit awarded to referrer when status becomes completed
- `completed_at` (timestamptz, NULLABLE) — when the referred user completed their first booking
- `created_at` (timestamptz, DEFAULT now())

### user_preferences
- `user_id` (uuid, PK, FK → profiles.id ON DELETE CASCADE) — one row per user
- `theme` (text, NOT NULL DEFAULT 'light') — light | dark
- `accent_color` (text, NOT NULL DEFAULT 'emerald') — emerald | blue | rose | amber | cyan | violet
- `reduced_motion` (boolean, NOT NULL DEFAULT false) — user prefers minimal animation
- `compact_mode` (boolean, NOT NULL DEFAULT false) — tighter spacing
- `updated_at` (timestamptz, DEFAULT now())

## Security (RLS)
- Both tables enable RLS.
- referrals: owner-scoped CRUD — a user can read/insert/update/delete only their own referrals (where referrer_id = auth.uid()). No one can read another user's referral list.
- user_preferences: owner-scoped CRUD — a user can read/insert/update/delete only their own preference row (where user_id = auth.uid()).

## Important Notes
1. referral_code is UNIQUE so each code maps to exactly one referrer.
2. referred_id is nullable so a referral row can exist (invite sent) before the invitee signs up.
3. reward_amount defaults to 50 (currency matches wallet_transactions amounts in this project).
4. user_preferences uses user_id as the primary key (one row per user, upsert-friendly).
5. All policies use auth.uid() for ownership — never current_user.
6. This migration is idempotent (IF NOT EXISTS on tables, DROP POLICY IF EXISTS before CREATE POLICY).
*/

-- ── referrals table ──
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referral_code text UNIQUE NOT NULL,
  referred_email text,
  referred_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  reward_amount numeric NOT NULL DEFAULT 50,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_referrals" ON referrals;
CREATE POLICY "select_own_referrals" ON referrals FOR SELECT
  TO authenticated USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "insert_own_referrals" ON referrals;
CREATE POLICY "insert_own_referrals" ON referrals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "update_own_referrals" ON referrals;
CREATE POLICY "update_own_referrals" ON referrals FOR UPDATE
  TO authenticated USING (auth.uid() = referrer_id) WITH CHECK (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "delete_own_referrals" ON referrals;
CREATE POLICY "delete_own_referrals" ON referrals FOR DELETE
  TO authenticated USING (auth.uid() = referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON referrals(referral_code);

-- ── user_preferences table ──
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  accent_color text NOT NULL DEFAULT 'emerald' CHECK (accent_color IN ('emerald', 'blue', 'rose', 'amber', 'cyan', 'violet')),
  reduced_motion boolean NOT NULL DEFAULT false,
  compact_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_preferences" ON user_preferences;
CREATE POLICY "select_own_preferences" ON user_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_preferences" ON user_preferences;
CREATE POLICY "insert_own_preferences" ON user_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_preferences" ON user_preferences;
CREATE POLICY "update_own_preferences" ON user_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_preferences" ON user_preferences;
CREATE POLICY "delete_own_preferences" ON user_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);