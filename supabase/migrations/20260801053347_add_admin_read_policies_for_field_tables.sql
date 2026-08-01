-- Admin read policies for field tables that were missing them

-- field_location_pings: admin needs to read all pings for the live map
CREATE POLICY "admin_read_all_location_pings"
  ON field_location_pings FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- field_assignments: admin needs to read all assignments for dispatch
CREATE POLICY "admin_read_all_assignments"
  ON field_assignments FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- field_assignments: admin needs to update assignments (status changes, etc.)
CREATE POLICY "admin_update_all_assignments"
  ON field_assignments FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- field_job_scores: admin needs to read all scores for leaderboard
CREATE POLICY "admin_read_all_job_scores"
  ON field_job_scores FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
