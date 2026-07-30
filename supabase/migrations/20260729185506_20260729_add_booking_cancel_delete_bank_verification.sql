/*
# Add booking cancellation, deletion, and bank payment verification features

## Purpose
1. Allow users to cancel bookings with a reason
2. Allow users to delete completed/cancelled bookings
3. Add bank payment method with slip/cheque/deposit upload for admin verification

## Changes to existing tables
- `bookings` table:
  - `cancellation_reason` (text, nullable) — stores the user's reason for cancelling
  - `cancelled_at` (timestamptz, nullable) — when the booking was cancelled
  - `deleted_at` (timestamptz, nullable) — soft-delete timestamp for user-initiated deletion
  - `payment_method` CHECK constraint updated to include 'bank'
  - `payment_status` CHECK constraint updated to include 'pending_verification', 'verified', 'rejected'

## New tables
- `payment_verifications` — stores uploaded bank slips/cheques/deposit slips for admin verification

## Security
- RLS on `payment_verifications`: users read/insert own, admins read all + update (verify/reject) + delete
- `notifications` type CHECK updated to include 'payment_verification'
*/

-- Add columns to bookings table
DO $$ BEGIN
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Update payment_method CHECK to include 'bank'
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IN ('cash', 'wallet', 'monime', 'bank'));

-- Update payment_status CHECK to include verification states
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('pending', 'pending_cash', 'paid', 'pending_verification', 'verified', 'rejected'));

-- Create payment_verifications table
CREATE TABLE IF NOT EXISTS payment_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_method text NOT NULL DEFAULT 'bank',
  document_type text NOT NULL CHECK (document_type IN ('payslip', 'cheque', 'deposit_slip')),
  document_url text NOT NULL,
  document_name text NOT NULL,
  document_size bigint,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason text,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  amount_sle numeric,
  service_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_payment_verifications" ON payment_verifications;
CREATE POLICY "user_select_own_payment_verifications" ON payment_verifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_select_all_payment_verifications" ON payment_verifications;
CREATE POLICY "admin_select_all_payment_verifications" ON payment_verifications FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "user_insert_own_payment_verifications" ON payment_verifications;
CREATE POLICY "user_insert_own_payment_verifications" ON payment_verifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_update_all_payment_verifications" ON payment_verifications;
CREATE POLICY "admin_update_all_payment_verifications" ON payment_verifications FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_all_payment_verifications" ON payment_verifications;
CREATE POLICY "admin_delete_all_payment_verifications" ON payment_verifications FOR DELETE
  TO authenticated USING (is_admin());

-- Update notifications type CHECK to include 'payment_verification'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('booking_update', 'message', 'system', 'payment_verification'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_verifications_booking ON payment_verifications(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_user ON payment_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_status ON payment_verifications(status);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_slug ON payment_verifications(service_slug);
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON bookings(deleted_at);
