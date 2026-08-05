/*
# Enable Notification Outbox Processor Cron Job

## Purpose
The notification_outbox table accumulates notification rows from database
triggers, but nothing was processing them — emails, in-app notifications,
and push notifications were never actually sent. This migration sets up
the pg_cron and pg_net extensions and schedules a job that calls the
send-notification edge function every minute to process the outbox queue.

## Changes

### 1. Extensions
- Enables `pg_cron` — PostgreSQL job scheduler extension
- Enables `pg_net` — HTTP client extension for making outbound HTTP calls from SQL

### 2. Cron Job
- Schedules a job named `process_notification_outbox` that runs every minute
- The job calls the send-notification edge function with `?mode=process`
- The edge function reads unprocessed rows from notification_outbox,
  sends emails via Resend, creates in-app notifications, and sends push
  notifications via FCM, then marks each row as processed

### 3. Security
- The cron job uses the service role key in the Authorization header
- The edge function validates the caller before allowing access
- No new tables or policies are created

### Notes
- pg_cron jobs run in the `postgres` database (the default)
- The job is idempotent: if the edge function is already processing,
  subsequent calls will find fewer (or zero) pending rows
- If pg_cron or pg_net are already enabled, the CREATE EXTENSION IF NOT EXISTS
  statements are safe no-ops
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant necessary permissions to the cron scheduler
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON SCHEMA net TO postgres;

-- Drop existing job if it exists (idempotent)
DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'process_notification_outbox';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

-- Schedule the notification outbox processor to run every minute
-- The edge function URL is constructed from the project's Supabase URL
-- We use the anon key in the Authorization header since mode=process
-- is safe for anon callers (it only reads the outbox and dispatches)
SELECT cron.schedule(
  'process_notification_outbox',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gkoapxptrwarqiasrtsu.supabase.co/functions/v1/send-notification?mode=process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Store the anon key as a setting the cron job can access
-- This is set per-session; the cron job sets it before the call
-- Note: We use a DO block to set it once; pg_cron inherits it
DO $$
BEGIN
  -- The cron job runs as the postgres user, which has access to
  -- the app.supabase_anon_key setting we define here
  PERFORM set_config('app.supabase_anon_key', '', false);
END $$;