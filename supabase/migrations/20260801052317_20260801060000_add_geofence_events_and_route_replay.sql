/*
# Geofence Auto-Status + Route Replay Pro Features

## Overview
Adds 2 pro features to the field dispatch GPS tracking system:
1. Geofence Auto-Status + ETA Alerts — tracks when workers enter/exit job site geofences, auto-fires events, and calculates ETAs
2. Live Route Replay & Playback History — stores location pings per job for route replay with speed, idle time, and detour analysis

## New Tables
- `field_geofence_events` — Records each geofence enter/exit event with distance, ETA, and coordinates
  - `id` (uuid, primary key)
  - `assignment_id` (uuid, FK to field_assignments)
  - `employee_id` (uuid, FK to employees)
  - `event_type` (text: 'enter' or 'exit')
  - `latitude` (double precision)
  - `longitude` (double precision)
  - `distance_meters` (numeric — distance from job site when event fired)
  - `eta_minutes` (integer — estimated minutes to arrive, null on exit)
  - `created_at` (timestamptz)

## Modified Tables
- `field_job_events` — adds 3 new event types to the CHECK constraint: 'geofence_entered', 'geofence_exited', 'eta_updated'
- `field_location_pings` — adds `heading` and `speed` columns (if not already present from prior migration)

## Security
- RLS enabled on `field_geofence_events`
- Admins have full access via `is_admin()`
- Employees can read their own geofence events and insert them
- Realtime enabled on `field_geofence_events` for live dispatch alerts
*/

-- ============================================================
-- 1. Add new event types to field_job_events CHECK constraint
-- ============================================================

ALTER TABLE field_job_events DROP CONSTRAINT IF EXISTS field_job_events_event_type_check;
ALTER TABLE field_job_events ADD CONSTRAINT field_job_events_event_type_check
  CHECK (event_type IN ('assigned','en_route','on_site','paused','resumed','completed','cancelled','geofence_entered','geofence_exited','eta_updated'));

-- ============================================================
-- 2. Ensure heading and speed columns exist on field_location_pings
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_location_pings' AND column_name = 'heading') THEN
    ALTER TABLE field_location_pings ADD COLUMN heading double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_location_pings' AND column_name = 'speed') THEN
    ALTER TABLE field_location_pings ADD COLUMN speed double precision;
  END IF;
END $$;

-- ============================================================
-- 3. Create field_geofence_events table
-- ============================================================

CREATE TABLE IF NOT EXISTS field_geofence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('enter', 'exit')),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  distance_meters numeric,
  eta_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE field_geofence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_geofence_events" ON field_geofence_events;
CREATE POLICY "admin_all_geofence_events" ON field_geofence_events
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "employee_read_own_geofence_events" ON field_geofence_events;
CREATE POLICY "employee_read_own_geofence_events" ON field_geofence_events
  TO authenticated USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee_insert_own_geofence_events" ON field_geofence_events;
CREATE POLICY "employee_insert_own_geofence_events" ON field_geofence_events
  TO authenticated WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

-- ============================================================
-- 4. Enable realtime on field_geofence_events
-- ============================================================

ALTER TABLE field_geofence_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'field_geofence_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE field_geofence_events;
  END IF;
END $$;

-- ============================================================
-- 5. Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_field_geofence_events_assignment ON field_geofence_events(assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_field_geofence_events_employee ON field_geofence_events(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_field_location_pings_assignment_created ON field_location_pings(assignment_id, created_at);
