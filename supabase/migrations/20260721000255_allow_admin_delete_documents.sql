-- Allow admins to delete any document row (not just their own)
DROP POLICY IF EXISTS "delete_own_documents" ON documents;
CREATE POLICY "delete_own_documents" ON documents FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Allow admins to delete any storage object in the documents bucket
DROP POLICY IF EXISTS "owner_delete_documents" ON storage.objects;
CREATE POLICY "owner_delete_documents" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    )
  );
