/*
# Field Job Review & Incident Management

## Overview
Adds audit/review columns to field_assignments and field_incidents so admins can
review completed work, approve/reject with feedback, score quality, and triage
incident reports with resolution notes.

## Modified Tables

### field_assignments
- `reviewed_by` (uuid, nullable) — links to auth.users who reviewed the job
- `reviewed_at` (timestamptz, nullable) — when the review happened
- `review_note` (text, nullable) — admin feedback (approval or rejection reason)
- `rejection_reason` (text, nullable) — specific rejection reason (for quick filtering)

### field_incidents
- `resolved_by` (uuid, nullable) — links to auth.users who resolved the incident
- `resolved_at` (timestamptz, nullable) — when it was resolved
- `resolution_note` (text, nullable) — admin's resolution notes
- `priority` (text, default 'normal') — incident priority: low | normal | high | critical

## Security
- No new tables; existing RLS policies on field_assignments already allow admin updates.
- field_incidents already has admin UPDATE policy; new columns are covered by it.
- Added index on field_incidents.status and field_incidents.priority for faster filtering.
- Added index on field_assignments.status for pending_review queries.
*/

-- ─── field_assignments review columns ─────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_assignments' AND column_name = 'reviewed_by') THEN
    ALTER TABLE field_assignments ADD COLUMN reviewed_by uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_assignments' AND column_name = 'reviewed_at') THEN
    ALTER TABLE field_assignments ADD COLUMN reviewed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_assignments' AND column_name = 'review_note') THEN
    ALTER TABLE field_assignments ADD COLUMN review_note text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_assignments' AND column_name = 'rejection_reason') THEN
    ALTER TABLE field_assignments ADD COLUMN rejection_reason text;
  END IF;
END $$;

-- ─── field_incidents resolution columns ────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_incidents' AND column_name = 'resolved_by') THEN
    ALTER TABLE field_incidents ADD COLUMN resolved_by uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_incidents' AND column_name = 'resolved_at') THEN
    ALTER TABLE field_incidents ADD COLUMN resolved_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_incidents' AND column_name = 'resolution_note') THEN
    ALTER TABLE field_incidents ADD COLUMN resolution_note text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'field_incidents' AND column_name = 'priority') THEN
    ALTER TABLE field_incidents ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical'));
  END IF;
END $$;

-- ─── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_field_incidents_status ON field_incidents(status);
CREATE INDEX IF NOT EXISTS idx_field_incidents_priority ON field_incidents(priority);
CREATE INDEX IF NOT EXISTS idx_field_assignments_review_status ON field_assignments(status, reviewed_at);

-- ─── Enable realtime for incidents (admin needs live updates) ───────────────────
ALTER TABLE field_incidents REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'field_incidents') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE field_incidents;
  END IF;
END $$;
