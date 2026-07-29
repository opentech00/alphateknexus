/*
# Add Service Bundles, Review Prompts, and Email Event Tracking

## Purpose
Supports three new features:
1. Service Bundle Packages — admin-configurable bundles of services at a discount
2. Post-Service Feedback Loop — automatic review prompt notifications when bookings complete
3. Email Event Tracking — centralized tracking of all outgoing emails

## New Tables
### service_bundles — admin-configurable multi-service packages with discount pricing
### service_bundle_items — links bundles to individual services with quantities
### email_events — tracks all outgoing emails for audit and user email history

## Security
- service_bundles: public read (active bundles), admin-only write
- service_bundle_items: public read, admin-only write
- email_events: owner read own, admin read all
- Review prompt trigger fires on booking status → 'completed'

## Important Notes
1. Trigger notify_review_prompt inserts a notification row when booking completes
2. Service bundles are read-only for end users; admins manage via admin panel
3. email_events allows owner and admin reads only
*/

-- ── Service Bundles ──
CREATE TABLE IF NOT EXISTS service_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  slug text UNIQUE NOT NULL,
  price_sle numeric(12,2) NOT NULL DEFAULT 0,
  original_price_sle numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_service_bundles" ON service_bundles;
CREATE POLICY "public_read_service_bundles" ON service_bundles FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_all_service_bundles" ON service_bundles;
CREATE POLICY "admin_all_service_bundles" ON service_bundles FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ── Service Bundle Items ──
CREATE TABLE IF NOT EXISTS service_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES service_bundles(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id),
  quantity int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_bundle_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_bundle_items" ON service_bundle_items;
CREATE POLICY "public_read_bundle_items" ON service_bundle_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_all_bundle_items" ON service_bundle_items;
CREATE POLICY "admin_all_bundle_items" ON service_bundle_items FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ── Email Events ──
CREATE TABLE IF NOT EXISTS email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reference_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_read_email_events" ON email_events;
CREATE POLICY "owner_read_email_events" ON email_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_read_email_events" ON email_events;
CREATE POLICY "admin_read_email_events" ON email_events FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ── Review Prompt Trigger ──
CREATE OR REPLACE FUNCTION notify_review_prompt()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.status = 'completed' AND OLD.status <> 'completed') THEN
    INSERT INTO notifications (user_id, title, body, type, read, booking_id)
    VALUES (
      NEW.user_id,
      'How was your service?',
      'Your booking is complete. Tap to rate your experience and help others choose.',
      'booking_update',
      false,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_booking_complete_review_prompt ON bookings;
CREATE TRIGGER on_booking_complete_review_prompt
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_review_prompt();

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_service_bundles_active ON service_bundles (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_service_bundle_items_bundle ON service_bundle_items (bundle_id);
CREATE INDEX IF NOT EXISTS idx_email_events_user ON email_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events (event_type, created_at DESC);
