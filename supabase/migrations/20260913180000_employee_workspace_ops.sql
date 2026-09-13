-- Employee workspace: booking assignment, leave, office attendance, HR docs, notify RPC

-- ── Bookings: assign to a staff user ─────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_assigned_to ON bookings(assigned_to);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_employee ON bookings(assigned_employee_id);

-- ── Teammates visible to division staff (for assign dropdowns) ───────────
DROP POLICY IF EXISTS "staff_select_division_colleagues" ON employees;
CREATE POLICY "staff_select_division_colleagues" ON employees
  FOR SELECT TO authenticated
  USING (
    service_id IS NOT NULL
    AND (
      has_capability('div.view', service_id)
      OR has_capability('div.manage_bookings', service_id)
      OR has_capability('div.delegate_tasks', service_id)
      OR has_capability('div.manage_staff_access', service_id)
    )
  );

-- ── Leave requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  leave_type text NOT NULL CHECK (leave_type IN ('annual', 'sick', 'unpaid', 'other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_dates_ok CHECK (end_date >= start_date)
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_service_status ON leave_requests(service_id, status);

DROP POLICY IF EXISTS "leave_select_own_or_head" ON leave_requests;
CREATE POLICY "leave_select_own_or_head" ON leave_requests FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR is_division_head(service_id)
    OR has_capability('div.manage_staff_access', service_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "leave_insert_own" ON leave_requests;
CREATE POLICY "leave_insert_own" ON leave_requests FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND employee_id = current_employee_id()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "leave_update_own_or_head" ON leave_requests;
CREATE POLICY "leave_update_own_or_head" ON leave_requests FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_division_head(service_id)
    OR has_capability('div.manage_staff_access', service_id)
    OR public.is_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_division_head(service_id)
    OR has_capability('div.manage_staff_access', service_id)
    OR public.is_admin()
  );

-- ── Office attendance ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS office_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'late', 'absent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

ALTER TABLE office_attendance ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_office_attendance_employee_date ON office_attendance(employee_id, work_date);

DROP POLICY IF EXISTS "office_att_select" ON office_attendance;
CREATE POLICY "office_att_select" ON office_attendance FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR is_division_head(service_id)
    OR has_capability('div.manage_staff_access', service_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "office_att_insert_own" ON office_attendance;
CREATE POLICY "office_att_insert_own" ON office_attendance FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND employee_id = current_employee_id()
  );

DROP POLICY IF EXISTS "office_att_update_own" ON office_attendance;
CREATE POLICY "office_att_update_own" ON office_attendance FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND employee_id = current_employee_id())
  WITH CHECK (user_id = auth.uid() AND employee_id = current_employee_id());

-- ── HR document types: payslip + policy ──────────────────────────────────
ALTER TABLE employee_documents DROP CONSTRAINT IF EXISTS employee_documents_document_type_check;
ALTER TABLE employee_documents ADD CONSTRAINT employee_documents_document_type_check
  CHECK (document_type IN (
    'resume', 'cover_letter', 'contract', 'offer_letter',
    'id_copy', 'certificate', 'performance_review',
    'warning_letter', 'medical', 'payslip', 'policy', 'other'
  ));

-- ── Notify booking client / assignee (staff cannot insert foreign notifications) ─
CREATE OR REPLACE FUNCTION public.notify_booking_party(
  p_booking_id uuid,
  p_title text,
  p_body text,
  p_type text DEFAULT 'booking_update',
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  svc uuid;
  owner uuid;
  target uuid;
BEGIN
  SELECT service_id, user_id INTO svc, owner FROM bookings WHERE id = p_booking_id;
  IF svc IS NULL THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  IF NOT (
    has_capability('div.manage_bookings', svc)
    OR has_capability('div.approve_quotes', svc)
    OR has_capability('div.message_clients', svc)
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  target := COALESCE(p_user_id, owner);
  IF target IS NULL THEN RETURN; END IF;

  INSERT INTO notifications (user_id, title, body, type, booking_id)
  VALUES (target, left(p_title, 120), left(p_body, 400), COALESCE(p_type, 'booking_update'), p_booking_id);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_booking_party(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_booking_party(uuid, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_booking_assigned_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO notifications (user_id, title, body, type, booking_id)
    VALUES (
      NEW.assigned_to,
      'Job assigned to you',
      'A booking in your division was assigned to you. Check My Schedule.',
      'booking_update',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_assigned_notify ON bookings;
CREATE TRIGGER trg_booking_assigned_notify
  AFTER UPDATE OF assigned_to ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_booking_assigned_notify();

-- Employees can download HR files stored under their employee id (admin upload path)
DROP POLICY IF EXISTS "employee_read_hr_files_by_employee_id" ON storage.objects;
CREATE POLICY "employee_read_hr_files_by_employee_id" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      (storage.foldername(name))[1] = current_employee_id()::text
      OR EXISTS (
        SELECT 1 FROM employee_documents d
        JOIN employees e ON e.id = d.employee_id
        WHERE d.file_path = name AND e.user_id = auth.uid()
      )
    )
  );
