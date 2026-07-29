/*
# Add public read policy for employee-photos bucket

The employee-photos bucket is public, but there's no SELECT policy for it.
This means the getPublicUrl() call works but the actual image fetch may
fail for non-admins (e.g., employee portal loading their own photo).

Add a policy allowing public read of employee-photos objects.
*/

CREATE POLICY "public_read_employee_photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'employee-photos');
