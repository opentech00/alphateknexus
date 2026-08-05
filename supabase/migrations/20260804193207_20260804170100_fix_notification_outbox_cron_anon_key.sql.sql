/*
# Fix Notification Outbox Processor Cron Job

## Purpose
The previous migration created the cron job but used an empty anon key
from a session setting that cron jobs can't access. This migration
drops and recreates the schedule with the anon key embedded directly.
The anon key is a public key (embedded in frontend JavaScript) so it
is safe to include in the cron job definition.

## Changes
- Drops the existing `process_notification_outbox` cron job
- Recreates it with the correct anon key in the Authorization header
- The job runs every minute and calls the send-notification edge function
  with ?mode=process to flush the notification outbox queue
*/

-- Drop existing job
DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'process_notification_outbox';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

-- Recreate with the anon key embedded (it's a public key, safe to include)
SELECT cron.schedule(
  'process_notification_outbox',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gkoapxptrwarqiasrtsu.supabase.co/functions/v1/send-notification?mode=process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdrb2FweHB0cndhcnFpYXNydHN1Iiwicm9sIjoiYW5vbiIsImlhdCI6MTc4NDU1MTcwNCwiZXhwIjoyMTAwMTI3NzA0fQ.f0iOA4UHr-2nRLQzbGVB0OwQFfNTEobhye_AzlpoQ9s'
    ),
    body := '{}'::jsonb
  );
  $$
);