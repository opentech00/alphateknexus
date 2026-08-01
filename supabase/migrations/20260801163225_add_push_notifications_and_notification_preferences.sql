/*
# Push Notifications, Notification Preferences, and Notification Outbox

## Purpose
Establishes the database foundation for a unified multi-channel notification system
covering all four app roles: clients, admins, employees, and field workers.
This migration adds:
1. Device token storage for mobile (FCM) and web (VAPID) push notifications.
2. Per-user notification preferences so each person can opt in/out of email, push, and in-app per category.
3. A notification outbox table that acts as a queue for the centralized dispatch edge function.
4. Expands the notifications table with new columns for richer targeting and metadata.

## New Tables

### push_subscriptions
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users, NOT NULL) — owner of the device
- `token` (text, NOT NULL) — FCM registration token or web push endpoint URL
- `platform` (text, NOT NULL) — 'android' | 'ios' | 'web'
- `app_role` (text, NOT NULL) — 'client' | 'admin' | 'employee' | 'field'
- `device_label` (text, nullable) — optional friendly name for the device
- `is_active` (boolean, DEFAULT true) — soft-disable for stale/invalid tokens
- `last_seen_at` (timestamptz, DEFAULT now()) — updated each time the token is refreshed
- `created_at` (timestamptz, DEFAULT now())

### notification_preferences
- `user_id` (uuid, PK, FK → auth.users ON DELETE CASCADE) — one row per user
- `email_enabled` (boolean, DEFAULT true) — master toggle for email channel
- `push_enabled` (boolean, DEFAULT true) — master toggle for push channel
- `in_app_enabled` (boolean, DEFAULT true) — master toggle for in-app channel
- `cat_bookings` (boolean, DEFAULT true) — booking created/updated/cancelled/completed
- `cat_payments` (boolean, DEFAULT true) — payment verified/rejected/wallet/withdrawals
- `cat_messages` (boolean, DEFAULT true) — new messages from admin or client
- `cat_field_dispatch` (boolean, DEFAULT true) — job assignments/status for field workers
- `cat_hr` (boolean, DEFAULT true) — employee role/status/document changes
- `cat_incidents` (boolean, DEFAULT true) — incident reports and safety alerts
- `cat_smart_sort` (boolean, DEFAULT true) — pickup reminders and subscription renewals
- `cat_system` (boolean, DEFAULT true) — announcements and system-wide notices
- `updated_at` (timestamptz, DEFAULT now())

### notification_outbox
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users, NOT NULL) — recipient
- `recipient_role` (text, NOT NULL) — 'client' | 'admin' | 'employee' | 'field'
- `event_type` (text, NOT NULL) — e.g. 'booking_confirmation', 'job_assignment', 'payment_verified'
- `title` (text, NOT NULL)
- `body` (text, NOT NULL)
- `category` (text, NOT NULL DEFAULT 'system') — matches preference category columns
- `metadata` (jsonb, DEFAULT '{}') — booking_id, service_slug, job_id, etc.
- `in_app_sent` (boolean, DEFAULT false)
- `email_sent` (boolean, DEFAULT false)
- `push_sent` (boolean, DEFAULT false)
- `in_app_skipped` (boolean, DEFAULT false) — user opted out of in-app
- `email_skipped` (boolean, DEFAULT false) — user opted out of email
- `push_skipped` (boolean, DEFAULT false) — user opted out of push
- `error_message` (text, nullable) — last error if any channel failed
- `created_at` (timestamptz, DEFAULT now())
- `processed_at` (timestamptz, nullable)

## Modified Tables

### notifications (alter)
- Add `recipient_role` (text, nullable) — 'client' | 'admin' | 'employee' | 'field'
- Add `service_slug` (text, nullable) — already referenced in code but added formally if missing
- Add `metadata` (jsonb, DEFAULT '{}') — structured data for deep-linking
- Expand `type` CHECK constraint to include new notification types

## Security (RLS)
- push_subscriptions: owner-scoped CRUD — users manage only their own device tokens.
- notification_preferences: owner-scoped CRUD — users manage only their own preferences.
- notification_outbox: owner-scoped SELECT (users see their own outbox entries);
  INSERT/UPDATE restricted to service role (edge function processes the queue).
- notifications: existing policies remain; new columns are covered by existing policies.

## Important Notes
1. push_subscriptions allows multiple tokens per user (multiple devices).
2. notification_preferences uses user_id as PK (one row per user, upsert-friendly).
3. notification_outbox is the queue: triggers insert rows here, the edge function
   reads unprocessed rows, checks preferences, and delivers across channels.
4. The expanded type CHECK on notifications is done via ALTER CONSTRAINT drop+recreate.
5. All policies use auth.uid() — never current_user.
6. Idempotent: uses IF NOT EXISTS and DROP POLICY IF EXISTS throughout.
*/

-- ── push_subscriptions table ──
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  app_role text NOT NULL CHECK (app_role IN ('client', 'admin', 'employee', 'field')),
  device_label text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_push_subs" ON push_subscriptions;
CREATE POLICY "select_own_push_subs" ON push_subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_push_subs" ON push_subscriptions;
CREATE POLICY "insert_own_push_subs" ON push_subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_push_subs" ON push_subscriptions;
CREATE POLICY "update_own_push_subs" ON push_subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_push_subs" ON push_subscriptions;
CREATE POLICY "delete_own_push_subs" ON push_subscriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_user_token ON push_subscriptions(user_id, token);
CREATE INDEX IF NOT EXISTS idx_push_subs_user_active ON push_subscriptions(user_id, is_active) WHERE is_active = true;

-- ── notification_preferences table ──
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  cat_bookings boolean NOT NULL DEFAULT true,
  cat_payments boolean NOT NULL DEFAULT true,
  cat_messages boolean NOT NULL DEFAULT true,
  cat_field_dispatch boolean NOT NULL DEFAULT true,
  cat_hr boolean NOT NULL DEFAULT true,
  cat_incidents boolean NOT NULL DEFAULT true,
  cat_smart_sort boolean NOT NULL DEFAULT true,
  cat_system boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notif_prefs" ON notification_preferences;
CREATE POLICY "select_own_notif_prefs" ON notification_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notif_prefs" ON notification_preferences;
CREATE POLICY "insert_own_notif_prefs" ON notification_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notif_prefs" ON notification_preferences;
CREATE POLICY "update_own_notif_prefs" ON notification_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notif_prefs" ON notification_preferences;
CREATE POLICY "delete_own_notif_prefs" ON notification_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── notification_outbox table ──
CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role text NOT NULL CHECK (recipient_role IN ('client', 'admin', 'employee', 'field')),
  event_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'system' CHECK (category IN ('bookings', 'payments', 'messages', 'field_dispatch', 'hr', 'incidents', 'smart_sort', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}',
  in_app_sent boolean NOT NULL DEFAULT false,
  email_sent boolean NOT NULL DEFAULT false,
  push_sent boolean NOT NULL DEFAULT false,
  in_app_skipped boolean NOT NULL DEFAULT false,
  email_skipped boolean NOT NULL DEFAULT false,
  push_skipped boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;

-- Users can see their own outbox entries (for debugging/history)
DROP POLICY IF EXISTS "select_own_outbox" ON notification_outbox;
CREATE POLICY "select_own_outbox" ON notification_outbox FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated users — only the service role
-- (used by the edge function) can insert and update outbox rows.

CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed ON notification_outbox(processed_at)
  WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_user ON notification_outbox(user_id, created_at DESC);

-- ── Expand notifications table ──
-- Add recipient_role column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'recipient_role'
  ) THEN
    ALTER TABLE notifications ADD COLUMN recipient_role text
      CHECK (recipient_role IN ('client', 'admin', 'employee', 'field'));
  END IF;
END $$;

-- Add metadata column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE notifications ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- Add service_slug column if it doesn't exist (referenced in code already)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'service_slug'
  ) THEN
    ALTER TABLE notifications ADD COLUMN service_slug text;
  END IF;
END $$;

-- Expand the type CHECK constraint to include new notification types
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_type_check'
      AND conrelid = 'notifications'::regclass
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  END IF;
END $$;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'booking_update', 'message', 'system',
    'field_dispatch', 'hr_update', 'payment',
    'assignment', 'incident', 'review_prompt',
    'subscription', 'announcement'
  ));

-- ── Helper function: enqueue a notification into the outbox ──
-- Called by triggers and other functions to queue a notification for dispatch.
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_user_id uuid,
  p_recipient_role text,
  p_event_type text,
  p_title text,
  p_body text,
  p_category text DEFAULT 'system',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox_id uuid;
BEGIN
  INSERT INTO public.notification_outbox (
    user_id, recipient_role, event_type, title, body, category, metadata
  ) VALUES (
    p_user_id, p_recipient_role, p_event_type, p_title, p_body, p_category, p_metadata
  )
  RETURNING id INTO v_outbox_id;

  RETURN v_outbox_id;
END;
$$;

-- ── Helper function: enqueue notifications for all admins ──
CREATE OR REPLACE FUNCTION public.enqueue_admin_notification(
  p_event_type text,
  p_title text,
  p_body text,
  p_category text DEFAULT 'system',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_outbox (
    user_id, recipient_role, event_type, title, body, category, metadata
  )
  SELECT id, 'admin', p_event_type, p_title, p_body, p_category, p_metadata
  FROM public.profiles
  WHERE role = 'admin';
END;
$$;

-- ── Auto-create notification_preferences row for new users ──
-- Ensures every new user has a preferences row with defaults.
CREATE OR REPLACE FUNCTION public.ensure_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_notif_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_notif_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_notification_preferences();

-- Also backfill preferences for existing users that don't have a row yet
INSERT INTO notification_preferences (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT DO NOTHING;

-- ── Enable realtime for notification_outbox so the edge function can poll ──
-- (Realtime is already enabled for notifications; outbox is polled via HTTP)
ALTER TABLE notification_outbox REPLICA IDENTITY FULL;
