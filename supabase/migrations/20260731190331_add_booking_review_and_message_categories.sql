/*
# Add Booking Review Status & Message Categories

## Purpose
1. Adds `pending_review` and `approved` to the bookings status CHECK constraint so customer booking submissions can go through an admin review/approval flow before payment.
2. Adds a `category` column to the `messages` table so admin staff can categorize incoming customer messages for easy management (e.g. inquiry, complaint, booking, urgent, general).
3. Adds a `priority` column to messages for urgency triage.
4. Adds a `reviewed_by` column to bookings to track which admin approved/rejected a booking.
5. Adds a `reviewed_at` timestamp column to bookings.
6. Adds a `review_note` column to bookings for admin notes during review.

## Changes to `bookings` table
- New column: `reviewed_by` (uuid, nullable, FK to auth.users) — tracks which admin reviewed the booking.
- New column: `reviewed_at` (timestamptz, nullable) — when the review happened.
- New column: `review_note` (text, nullable) — admin's note when approving/rejecting.
- Status CHECK constraint updated to include `pending_review` and `approved`.

## Changes to `messages` table
- New column: `category` (text, NOT NULL, default 'general') — message category for staff management.
- New column: `priority` (text, NOT NULL, default 'normal') — priority level for triage.
- CHECK constraint on `category`: must be one of 'general', 'inquiry', 'booking', 'complaint', 'urgent', 'payment', 'schedule'.
- CHECK constraint on `priority`: must be one of 'low', 'normal', 'high', 'critical'.

## Security
- No RLS policy changes needed — existing policies on bookings and messages already cover the new columns.
- `reviewed_by` FK references auth.users with ON DELETE SET NULL so deleting an admin user doesn't break booking records.

## Important Notes
1. The bookings status constraint is replaced (DROP + ADD) to include the two new statuses.
2. The messages table gets two new columns with safe defaults so existing rows are backfilled automatically.
3. All operations are idempotent — wrapped in DO $$ blocks or use IF NOT EXISTS.
*/

-- ============================================================
-- BOOKINGS: add review columns + expand status constraint
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'reviewed_by') THEN
    ALTER TABLE bookings ADD COLUMN reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'reviewed_at') THEN
    ALTER TABLE bookings ADD COLUMN reviewed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'review_note') THEN
    ALTER TABLE bookings ADD COLUMN review_note text;
  END IF;
END $$;

-- Replace the status CHECK constraint to include pending_review and approved
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pending_review%'
  ) THEN
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check1;
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('pending', 'pending_review', 'approved', 'confirmed', 'in_progress', 'completed', 'cancelled'));
  END IF;
END $$;

-- ============================================================
-- MESSAGES: add category + priority columns
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'category') THEN
    ALTER TABLE messages ADD COLUMN category text NOT NULL DEFAULT 'general';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'priority') THEN
    ALTER TABLE messages ADD COLUMN priority text NOT NULL DEFAULT 'normal';
  END IF;
END $$;

-- Add CHECK constraints for category and priority (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'messages'::regclass
      AND contype = 'c'
      AND conname = 'messages_category_check'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT messages_category_check
      CHECK (category IN ('general', 'inquiry', 'booking', 'complaint', 'urgent', 'payment', 'schedule'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'messages'::regclass
      AND contype = 'c'
      AND conname = 'messages_priority_check'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT messages_priority_check
      CHECK (priority IN ('low', 'normal', 'high', 'critical'));
  END IF;
END $$;

-- Index for filtering messages by category (common admin query)
CREATE INDEX IF NOT EXISTS idx_messages_category ON messages(category);
CREATE INDEX IF NOT EXISTS idx_messages_priority ON messages(priority);
CREATE INDEX IF NOT EXISTS idx_bookings_status_review ON bookings(status) WHERE status IN ('pending_review', 'approved');
