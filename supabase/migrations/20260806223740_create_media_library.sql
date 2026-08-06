/*
# Media Library — Centralized App Media Management

## Purpose
Replaces hardcoded image/file paths across the app with a database-driven media library
that admins can manage through the admin panel (full CRUD). Supports images, videos,
and documents. The app logo, per-service branding galleries, login carousel slides,
splash screen assets, and general digital content all live here.

## 1. New Tables

### `media_assets`
Central registry for every digital asset the app uses.
- `id` (uuid, PK)
- `category` (text) — `app_logo` | `service_branding` | `login_carousel` | `splash` | `general`
- `key` (text) — links asset to what it represents (e.g. service slug `procurement`, or `app-logo`)
- `title` (text) — display name
- `alt_text` (text) — accessibility description
- `file_name` (text) — original uploaded file name
- `file_path` (text) — storage path in the `media` bucket
- `file_url` (text) — full public URL for rendering
- `file_type` (text) — MIME type (image/webp, video/mp4, application/pdf, etc.)
- `file_size` (bigint) — size in bytes
- `width` (int, nullable) — pixel width for images/videos
- `height` (int, nullable) — pixel height for images/videos
- `display_order` (int) — sort order within a category+key group
- `is_active` (boolean) — inactive assets stay in library but don't appear in app
- `uploaded_by` (uuid) — admin who uploaded, references auth.users
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

Unique constraint on `(category, key, display_order)` prevents duplicate ordering.

### `media_storage` (storage bucket)
Public bucket `media` — public read so the app (including unauthenticated login screens)
can display assets without signed URLs. Only admins can upload/update/delete.

## 2. Modified Tables

### `services`
Added two optional columns so each service can reference its branding and login images:
- `branding_image_url` (text, nullable) — primary branding image URL from media library
- `login_image_url` (text, nullable) — login carousel image URL from media library

These are nullable so existing services continue to work; the app falls back to
static assets when these are null.

## 3. Security

### `media_assets` table
- RLS enabled.
- SELECT: public (anon + authenticated) can read active assets — the login screen
  and splash screen render before authentication, so anon read is required.
- INSERT/UPDATE/DELETE: admin only (profiles.role = 'admin').

### `media` storage bucket
- Public read for anyone.
- Admin-only upload/update/delete via RLS storage policies.

## 4. Important Notes
1. The `media` bucket is public-read so login/splash screens work pre-auth.
2. Admin write access uses the same `profiles.role = 'admin'` check as other admin tables.
3. Services table branding columns are nullable for zero-downtime migration.
4. `display_order` allows multiple images per service (gallery support).
*/

-- ============================================================
-- 1. Create media_assets table
-- ============================================================
CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('app_logo', 'service_branding', 'login_carousel', 'splash', 'general')),
  key text NOT NULL,
  title text,
  alt_text text,
  file_name text,
  file_path text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  width int,
  height int,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique ordering within a category+key group
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_category_key_order_unique
  ON media_assets (category, key, display_order)
  WHERE is_active = true;

-- Index for common query: fetch active assets by category, optionally by key
CREATE INDEX IF NOT EXISTS idx_media_assets_category_active
  ON media_assets (category, is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_media_assets_key
  ON media_assets (key);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

-- Public read (anon + authenticated) for active assets only
DROP POLICY IF EXISTS "public_read_active_media" ON media_assets;
CREATE POLICY "public_read_active_media" ON media_assets FOR SELECT
  TO anon, authenticated USING (is_active = true);

-- Admin full CRUD
DROP POLICY IF EXISTS "admin_select_all_media" ON media_assets;
CREATE POLICY "admin_select_all_media" ON media_assets FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_media" ON media_assets;
CREATE POLICY "admin_insert_media" ON media_assets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_media" ON media_assets;
CREATE POLICY "admin_update_media" ON media_assets FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_media" ON media_assets;
CREATE POLICY "admin_delete_media" ON media_assets FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================================
-- 2. Add branding columns to services table
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'branding_image_url') THEN
    ALTER TABLE services ADD COLUMN branding_image_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'login_image_url') THEN
    ALTER TABLE services ADD COLUMN login_image_url text;
  END IF;
END $$;

-- ============================================================
-- 3. Create public media storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, admin write
DROP POLICY IF EXISTS "public_read_media_bucket" ON storage.objects;
CREATE POLICY "public_read_media_bucket" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'media');

DROP POLICY IF EXISTS "admin_insert_media_bucket" ON storage.objects;
CREATE POLICY "admin_insert_media_bucket" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'media' AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_media_bucket" ON storage.objects;
CREATE POLICY "admin_update_media_bucket" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'media' AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_media_bucket" ON storage.objects;
CREATE POLICY "admin_delete_media_bucket" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'media' AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================================
-- 4. Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_media_assets_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_media_assets_updated_at ON media_assets;
CREATE TRIGGER trg_media_assets_updated_at
  BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION update_media_assets_updated_at();