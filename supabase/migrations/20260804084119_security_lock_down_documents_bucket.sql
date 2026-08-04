/*
  # Lock down the documents bucket

  The `documents` bucket held payment proofs, ID documents and booking
  attachments while being marked public, so any object path could be fetched
  by anyone with no session at all. Its only INSERT policy checked the bucket
  and nothing else, so a signed-in user could write into another user's
  folder, and there was no size or content-type limit.

  1. Bucket
    - `public` = false (reads now require a signed URL)
    - 10 MB size limit, explicit MIME allow-list (no SVG, which can carry script)
  2. Policies on storage.objects for the documents bucket
    - SELECT: the folder owner or an admin
    - INSERT: into your own folder, or an admin uploading on a client's behalf
    - DELETE: unchanged (owner or admin)
*/

UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/gif','image/webp',
      'application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain','text/csv'
    ]
WHERE id = 'documents';

DROP POLICY IF EXISTS "auth_upload_documents" ON storage.objects;
CREATE POLICY "owner_upload_documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "owner_read_documents" ON storage.objects;
CREATE POLICY "owner_read_documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.is_admin()
    )
  );
