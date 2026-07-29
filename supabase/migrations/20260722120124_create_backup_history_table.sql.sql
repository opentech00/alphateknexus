/*
# Create backup_history table for admin data backups

1. New Tables
- `backup_history`
  - `id` (uuid, primary key)
  - `created_by` (uuid, references profiles.id, the admin who triggered the backup)
  - `tables_included` (text[], list of table names included in the backup)
  - `table_counts` (jsonb, map of table name -> row count at backup time)
  - `file_size_bytes` (bigint, size of the generated JSON file)
  - `status` (text: 'completed' | 'failed')
  - `storage_path` (text, path in Supabase Storage bucket where the backup file is stored)
  - `error_message` (text, nullable, populated if status = 'failed')
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `backup_history`.
- Admin-only CRUD: only users with role = 'admin' in profiles can access backup records.
- Uses the existing `is_admin()` SECURITY DEFINER helper.

3. Storage
- Creates a `backups` storage bucket (private) for storing backup JSON files.
*/

CREATE TABLE IF NOT EXISTS public.backup_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tables_included text[] NOT NULL DEFAULT '{}',
  table_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  storage_path text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_backup_history" ON public.backup_history;
CREATE POLICY "admin_select_backup_history" ON public.backup_history
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_backup_history" ON public.backup_history;
CREATE POLICY "admin_insert_backup_history" ON public.backup_history
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_backup_history" ON public.backup_history;
CREATE POLICY "admin_delete_backup_history" ON public.backup_history
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_backup_history_created_at ON public.backup_history (created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admin_read_backups_bucket" ON storage.objects;
CREATE POLICY "admin_read_backups_bucket" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND public.is_admin());

DROP POLICY IF EXISTS "admin_write_backups_bucket" ON storage.objects;
CREATE POLICY "admin_write_backups_bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND public.is_admin());

DROP POLICY IF EXISTS "admin_delete_backups_bucket" ON storage.objects;
CREATE POLICY "admin_delete_backups_bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'backups' AND public.is_admin());
