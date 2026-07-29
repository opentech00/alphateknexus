ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS resume_url text;

-- Storage buckets for employee assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('employee-photos',  'employee-photos',  true,  5242880,  ARRAY['image/jpeg','image/png','image/webp']),
  ('employee-resumes', 'employee-resumes', false, 10485760, ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: admins can upload/read/delete; owners can read their own photo
CREATE POLICY "admin_upload_photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-photos' AND is_admin());

CREATE POLICY "admin_upload_resumes" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-resumes' AND is_admin());

CREATE POLICY "public_read_photos" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'employee-photos');

CREATE POLICY "admin_read_resumes" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-resumes' AND is_admin());

CREATE POLICY "admin_delete_photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-photos' AND is_admin());

CREATE POLICY "admin_delete_resumes" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-resumes' AND is_admin());
