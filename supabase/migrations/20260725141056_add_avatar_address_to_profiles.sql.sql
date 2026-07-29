/*
# Add avatar_url and address to profiles + avatars storage bucket

1. Modified Tables
- `profiles`
  - `avatar_url` (text, nullable) — public URL of the user's profile picture in the `avatars` storage bucket.
  - `address` (text, nullable) — user's service address (street, city, etc.).
2. New Storage Bucket
- `avatars` (public, 5MB, images only) — stores user profile pictures.
3. Security
- Storage policies on `avatars` bucket:
  - Authenticated users can upload/update/delete objects whose path starts with their own user id.
  - Public read access for avatars (bucket is public).
- `profiles` UPDATE policy already exists (users can update own row); no new RLS needed.
4. Notes
- Columns are nullable so existing rows are unaffected.
- Avatar object path convention: `<user_id>/<filename>` — enforced in storage policies.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS address text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "users_upload_own_avatar" ON storage.objects;
CREATE POLICY "users_upload_own_avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "users_update_own_avatar" ON storage.objects;
CREATE POLICY "users_update_own_avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "users_delete_own_avatar" ON storage.objects;
CREATE POLICY "users_delete_own_avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "public_read_avatars" ON storage.objects;
CREATE POLICY "public_read_avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');
