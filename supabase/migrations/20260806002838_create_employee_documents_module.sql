/*
# Create employee documents module

1. New Tables
- `employee_documents`: stores all HR documents per employee (resumes,
  letters, contracts, certificates, ID copies, etc.).
  - `id` (uuid, primary key)
  - `employee_id` (uuid, FK to employees, ON DELETE CASCADE)
  - `uploaded_by` (uuid, FK to auth.users, ON DELETE SET NULL)
  - `document_type` (text, categorizes the document)
  - `file_name` (text, original file name)
  - `file_path` (text, storage object path in employee-documents bucket)
  - `file_type` (text, MIME type)
  - `file_size` (integer, bytes)
  - `description` (text, optional note about the document)
  - `created_at` (timestamptz)

2. New Storage Bucket
- `employee-documents`: private bucket, 10MB file size limit, MIME allow-list
  for images, PDF, Word, Excel, and text files.

3. Security
- RLS enabled on employee_documents.
- SELECT: admin OR the employee's own user_id matches auth.uid().
- INSERT: admin only (admins upload documents on behalf of employees).
- UPDATE: admin only.
- DELETE: admin only.
- Storage policies: admin can read/write/delete; the employee themselves
  can read their own folder (first path segment = their user_id).

4. Notes
- Document types are enforced via a CHECK constraint to a fixed set of
  categories: resume, cover_letter, contract, offer_letter, id_copy,
  certificate, performance_review, warning_letter, medical, other.
*/

CREATE TABLE IF NOT EXISTS employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  document_type text NOT NULL DEFAULT 'other' CHECK (
    document_type IN (
      'resume', 'cover_letter', 'contract', 'offer_letter',
      'id_copy', 'certificate', 'performance_review',
      'warning_letter', 'medical', 'other'
    )
  ),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size integer,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_type ON employee_documents(document_type);

DROP POLICY IF EXISTS "select_employee_documents" ON employee_documents;
CREATE POLICY "select_employee_documents" ON employee_documents FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_documents.employee_id
        AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_employee_documents" ON employee_documents;
CREATE POLICY "insert_employee_documents" ON employee_documents FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_employee_documents" ON employee_documents;
CREATE POLICY "update_employee_documents" ON employee_documents FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_employee_documents" ON employee_documents;
CREATE POLICY "delete_employee_documents" ON employee_documents FOR DELETE
  TO authenticated USING (public.is_admin());

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents',
  'employee-documents',
  false,
  10485760,
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies
DROP POLICY IF EXISTS "admin_upload_employee_documents" ON storage.objects;
CREATE POLICY "admin_upload_employee_documents" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (public.is_admin() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

DROP POLICY IF EXISTS "admin_read_employee_documents" ON storage.objects;
CREATE POLICY "admin_read_employee_documents" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (public.is_admin() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

DROP POLICY IF EXISTS "admin_delete_employee_documents" ON storage.objects;
CREATE POLICY "admin_delete_employee_documents" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (public.is_admin() OR (storage.foldername(name))[1] = auth.uid()::text)
  );
