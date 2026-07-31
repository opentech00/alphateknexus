/*
# Field Dispatch Pro Features

## Overview
Adds 5 pro features to the field dispatch module:
1. Live GPS tracking — stores location pings with heading/speed
2. Smart auto-dispatch — stores dispatch suggestions with match scores
3. Route optimization — stores optimized route stops for multi-job assignments
4. Job status timeline with ETA — tracks job state transitions with estimated arrival times
5. Offline sync queue dashboard — tracks pending offline data from field workers

## New Tables
- field_job_events: job state transitions (assigned → en_route → on_site → completed)
- field_dispatch_suggestions: auto-dispatch recommendations with match scores
- field_route_stops: optimized multi-stop routes for field workers
- field_offline_sync_queue: pending offline data from field workers

## Modified Tables
- field_location_pings: added heading and speed columns

## Security
- RLS enabled on all new tables
- Admin access via is_admin() function
- Employees can read/insert their own rows
*/

-- field_job_events
CREATE TABLE IF NOT EXISTS field_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES field_assignments(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('assigned','en_route','on_site','paused','resumed','completed','cancelled')),
  latitude double precision,
  longitude double precision,
  eta_minutes integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE field_job_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_field_job_events" ON field_job_events;
CREATE POLICY "admin_all_field_job_events" ON field_job_events
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "employee_read_own_job_events" ON field_job_events;
CREATE POLICY "employee_read_own_job_events" ON field_job_events
  TO authenticated USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee_insert_own_job_events" ON field_job_events;
CREATE POLICY "employee_insert_own_job_events" ON field_job_events
  TO authenticated WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

-- field_dispatch_suggestions
CREATE TABLE IF NOT EXISTS field_dispatch_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES field_assignments(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  match_score integer NOT NULL DEFAULT 0,
  distance_km numeric,
  workload_score integer DEFAULT 0,
  performance_factor numeric DEFAULT 0,
  skill_match boolean DEFAULT false,
  is_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE field_dispatch_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_dispatch_suggestions" ON field_dispatch_suggestions;
CREATE POLICY "admin_all_dispatch_suggestions" ON field_dispatch_suggestions
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- field_route_stops
CREATE TABLE IF NOT EXISTS field_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES field_assignments(id) ON DELETE CASCADE,
  stop_order integer NOT NULL DEFAULT 0,
  latitude double precision,
  longitude double precision,
  address text,
  estimated_travel_minutes integer,
  estimated_arrival timestamptz,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE field_route_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_route_stops" ON field_route_stops;
CREATE POLICY "admin_all_route_stops" ON field_route_stops
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "employee_read_own_route_stops" ON field_route_stops;
CREATE POLICY "employee_read_own_route_stops" ON field_route_stops
  TO authenticated USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

-- field_offline_sync_queue
CREATE TABLE IF NOT EXISTS field_offline_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES field_assignments(id) ON DELETE CASCADE,
  data_type text NOT NULL CHECK (data_type IN ('photo','signature','form','incident_report','checklist','attendance')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_id text,
  synced boolean NOT NULL DEFAULT false,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE field_offline_sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_offline_sync_queue" ON field_offline_sync_queue;
CREATE POLICY "admin_all_offline_sync_queue" ON field_offline_sync_queue
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "employee_read_own_sync_queue" ON field_offline_sync_queue;
CREATE POLICY "employee_read_own_sync_queue" ON field_offline_sync_queue
  TO authenticated USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee_insert_own_sync_queue" ON field_offline_sync_queue;
CREATE POLICY "employee_insert_own_sync_queue" ON field_offline_sync_queue
  TO authenticated WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee_update_own_sync_queue" ON field_offline_sync_queue;
CREATE POLICY "employee_update_own_sync_queue" ON field_offline_sync_queue
  TO authenticated USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

-- Add heading and speed to field_location_pings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_location_pings' AND column_name = 'heading') THEN
    ALTER TABLE field_location_pings ADD COLUMN heading double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_location_pings' AND column_name = 'speed') THEN
    ALTER TABLE field_location_pings ADD COLUMN speed double precision;
  END IF;
END $$;

-- Enable realtime for new tables
ALTER TABLE field_job_events REPLICA IDENTITY FULL;
ALTER TABLE field_location_pings REPLICA IDENTITY FULL;
ALTER TABLE field_offline_sync_queue REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'field_job_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE field_job_events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'field_location_pings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE field_location_pings;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'field_offline_sync_queue') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE field_offline_sync_queue;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_field_job_events_assignment ON field_job_events(assignment_id);
CREATE INDEX IF NOT EXISTS idx_field_job_events_employee ON field_job_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_field_job_events_created ON field_job_events(created_at);
CREATE INDEX IF NOT EXISTS idx_field_location_pings_assignment ON field_location_pings(assignment_id);
CREATE INDEX IF NOT EXISTS idx_field_location_pings_created ON field_location_pings(created_at);
CREATE INDEX IF NOT EXISTS idx_field_dispatch_suggestions_assignment ON field_dispatch_suggestions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_field_route_stops_employee ON field_route_stops(employee_id);
CREATE INDEX IF NOT EXISTS idx_field_offline_sync_queue_employee ON field_offline_sync_queue(employee_id);
CREATE INDEX IF NOT EXISTS idx_field_offline_sync_queue_synced ON field_offline_sync_queue(synced);
