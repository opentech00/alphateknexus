/*
# Field Staff Pro Features — Database Schema

## Overview
Adds 5 pro features to the field staff job assignment system:
1. Smart Dispatch & Auto-Assignment Engine
2. Live GPS Tracking & Geofenced Check-In
3. Route Optimization & Multi-Stop Scheduling
4. Real-Time Job Chat, Pause Status & Status Broadcasting
5. Performance Analytics & Job Scoring

## New Tables
- `field_job_messages` — Real-time per-job chat messages (worker/admin/customer senders)
- `field_job_notes` — Timestamped worker notes (text + optional photo) attached to assignments
- `field_location_pings` — Continuous GPS tracking pings during active jobs
- `field_job_scores` — Automated job scoring per completed assignment

## Modified Tables
- `field_assignments` — Adds latitude, longitude, geofence_radius, paused_at, paused_reason, booking_id columns
- `employees` — Adds performance_score and jobs_completed columns for leaderboard

## Security
- RLS enabled on all new tables
- Employees can read/write their own data; admins have full access via is_admin()
- Messages: employees read messages on their own assignments; admins read all and write
- Notes: employees create/read their own notes; admins read all
- Location pings: employees create/read their own pings; admins read all
- Job scores: admins read all and create; employees read their own scores
*/

-- ============================================================
-- 1. Modify field_assignments: add geocoding, geofence, pause, booking link
-- ============================================================

DO $$ BEGIN
  ALTER TABLE field_assignments ADD COLUMN IF NOT EXISTS latitude double precision;
  ALTER TABLE field_assignments ADD COLUMN IF NOT EXISTS longitude double precision;
  ALTER TABLE field_assignments ADD COLUMN IF NOT EXISTS geofence_radius integer DEFAULT 100;
  ALTER TABLE field_assignments ADD COLUMN IF NOT EXISTS paused_at timestamptz;
  ALTER TABLE field_assignments ADD COLUMN IF NOT EXISTS paused_reason text;
  ALTER TABLE field_assignments ADD COLUMN IF NOT EXISTS booking_id uuid;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 2. Modify employees: add performance tracking columns
-- ============================================================

DO $$ BEGIN
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS performance_score numeric DEFAULT 0;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS jobs_completed integer DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 3. Create field_job_messages table
-- ============================================================

CREATE TABLE IF NOT EXISTS field_job_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  sender text NOT NULL DEFAULT 'worker',
  sender_name text,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE field_job_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_job_messages" ON field_job_messages;
CREATE POLICY "select_own_job_messages" ON field_job_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM field_assignments fa
      WHERE fa.id = field_job_messages.assignment_id
      AND fa.employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  );

DROP POLICY IF EXISTS "insert_own_job_messages" ON field_job_messages;
CREATE POLICY "insert_own_job_messages" ON field_job_messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM field_assignments fa
      WHERE fa.id = field_job_messages.assignment_id
      AND fa.employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    ) OR is_admin()
  );

-- ============================================================
-- 4. Create field_job_notes table
-- ============================================================

CREATE TABLE IF NOT EXISTS field_job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  note_text text NOT NULL,
  photo_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE field_job_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_job_notes" ON field_job_notes;
CREATE POLICY "select_own_job_notes" ON field_job_notes FOR SELECT
  TO authenticated USING (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_own_job_notes" ON field_job_notes;
CREATE POLICY "insert_own_job_notes" ON field_job_notes FOR INSERT
  TO authenticated WITH CHECK (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    OR is_admin()
  );

-- ============================================================
-- 5. Create field_location_pings table
-- ============================================================

CREATE TABLE IF NOT EXISTS field_location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  battery_level integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE field_location_pings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_location_pings" ON field_location_pings;
CREATE POLICY "select_own_location_pings" ON field_location_pings FOR SELECT
  TO authenticated USING (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_own_location_pings" ON field_location_pings;
CREATE POLICY "insert_own_location_pings" ON field_location_pings FOR INSERT
  TO authenticated WITH CHECK (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- ============================================================
-- 6. Create field_job_scores table
-- ============================================================

CREATE TABLE IF NOT EXISTS field_job_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL UNIQUE REFERENCES field_assignments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  punctuality_score integer DEFAULT 0,
  speed_score integer DEFAULT 0,
  quality_score integer DEFAULT 0,
  overall_score integer DEFAULT 0,
  scored_at timestamptz DEFAULT now()
);

ALTER TABLE field_job_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_job_scores" ON field_job_scores;
CREATE POLICY "select_own_job_scores" ON field_job_scores FOR SELECT
  TO authenticated USING (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "admin_insert_job_scores" ON field_job_scores;
CREATE POLICY "admin_insert_job_scores" ON field_job_scores FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_job_scores" ON field_job_scores;
CREATE POLICY "admin_update_job_scores" ON field_job_scores FOR UPDATE
  TO authenticated USING (is_admin());

-- ============================================================
-- 7. Enable realtime on new tables
-- ============================================================

ALTER TABLE field_job_messages REPLICA IDENTITY FULL;
ALTER TABLE field_location_pings REPLICA IDENTITY FULL;
ALTER TABLE field_job_notes REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE field_job_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE field_location_pings;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE field_job_notes;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 8. Add indexes for performance queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_field_job_messages_assignment ON field_job_messages(assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_field_job_notes_assignment ON field_job_notes(assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_field_location_pings_employee ON field_location_pings(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_field_job_scores_employee ON field_job_scores(employee_id);
CREATE INDEX IF NOT EXISTS idx_field_assignments_booking ON field_assignments(booking_id);
