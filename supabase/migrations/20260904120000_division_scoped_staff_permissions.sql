/*
  Division-scoped staff permissions

  Super Admins (CEO/CIO) stay on the Admin dashboard.
  Division Heads work in the Employee app and grant staff capabilities
  only within their own service_id.
*/

-- ── Canonical division slugs on legacy division_permissions ──────────────
UPDATE division_permissions SET division_slug = 'waste-management'
  WHERE division_slug = 'smart-sort';
UPDATE division_permissions SET division_slug = 'cleaning-janitorial'
  WHERE division_slug = 'cleaning-services';

ALTER TABLE division_permissions DROP CONSTRAINT IF EXISTS division_permissions_division_slug_check;
ALTER TABLE division_permissions ADD CONSTRAINT division_permissions_division_slug_check
  CHECK (division_slug IN (
    'clearing-forwarding',
    'waste-management',
    'cleaning-janitorial',
    'private-security',
    'procurement'
  ));

ALTER TABLE division_permissions
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id) ON DELETE CASCADE;

UPDATE division_permissions dp
SET employee_id = e.id
FROM employees e
WHERE dp.employee_id IS NULL AND e.user_id = dp.user_id;

-- ── Org role on employees ────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS org_role text NOT NULL DEFAULT 'staff';

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_org_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_org_role_check
  CHECK (org_role IN ('staff', 'field_staff', 'division_head', 'super_admin'));

CREATE INDEX IF NOT EXISTS employees_org_role_idx ON employees(org_role);
CREATE INDEX IF NOT EXISTS employees_org_role_service_idx ON employees(org_role, service_id);

-- ── Catalog + grants ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capability_catalog (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  surface text NOT NULL CHECK (surface IN ('admin', 'employee', 'field')),
  grantable boolean NOT NULL DEFAULT true
);

INSERT INTO capability_catalog (key, label, description, surface, grantable) VALUES
  ('div.view', 'View division', 'See bookings and pipeline', 'employee', true),
  ('div.manage_bookings', 'Manage bookings', 'Update status and assign jobs', 'employee', true),
  ('div.approve_quotes', 'Approve quotes', 'Accept or reject quote requests', 'employee', true),
  ('div.manage_documents', 'Manage documents', 'Upload and manage documents', 'employee', true),
  ('div.message_clients', 'Message clients', 'Send messages on bookings', 'employee', true),
  ('div.cash_collections', 'Cash collections', 'Collect cash payments', 'employee', true),
  ('div.reports', 'Reports', 'View division reports', 'employee', true),
  ('div.delegate_tasks', 'Delegate tasks', 'Assign work to staff', 'employee', true),
  ('div.manage_staff_access', 'Manage staff access', 'Grant and revoke staff capabilities', 'employee', false),
  ('field.jobs', 'Field jobs', 'Field assignments', 'field', true),
  ('field.attendance', 'Field attendance', 'Clock in and out', 'field', true),
  ('field.incidents', 'Field incidents', 'Report incidents', 'field', true)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS employee_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  capability_key text NOT NULL REFERENCES capability_catalog(key) ON DELETE CASCADE,
  granted_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, capability_key)
);

CREATE INDEX IF NOT EXISTS employee_capabilities_employee_idx ON employee_capabilities(employee_id);
CREATE INDEX IF NOT EXISTS employee_capabilities_key_idx ON employee_capabilities(capability_key);

CREATE TABLE IF NOT EXISTS division_grant_ceilings (
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  capability_key text NOT NULL REFERENCES capability_catalog(key) ON DELETE CASCADE,
  PRIMARY KEY (service_id, capability_key)
);

INSERT INTO division_grant_ceilings (service_id, capability_key)
SELECT s.id, c.key
FROM services s
CROSS JOIN capability_catalog c
WHERE c.grantable = true
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS permission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  target_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  action text NOT NULL,
  capability_keys text[] NOT NULL DEFAULT '{}',
  before_keys text[] NOT NULL DEFAULT '{}',
  after_keys text[] NOT NULL DEFAULT '{}',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS permission_audit_target_idx ON permission_audit(target_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS permission_audit_actor_idx ON permission_audit(actor_employee_id, created_at DESC);

-- Seed a Division Head HR role per service (job title only; org_role drives access)
INSERT INTO hr_roles (service_id, name, description, is_active, display_order, is_default)
SELECT s.id, 'Division Head', 'Head of division — grants staff access in the employee portal', true, 0, false
FROM services s
WHERE NOT EXISTS (
  SELECT 1 FROM hr_roles r WHERE r.service_id = s.id AND r.name = 'Division Head'
);

-- ── Helper functions ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM employees WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.admin_role_id IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_division_head(p_service_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees e
    WHERE e.user_id = auth.uid()
      AND e.org_role = 'division_head'
      AND e.status = 'active'
      AND (p_service_id IS NULL OR e.service_id = p_service_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_capability(p_key text, p_service_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp employees%ROWTYPE;
BEGIN
  IF public.is_super_admin() OR public.is_admin() THEN
    RETURN true;
  END IF;

  SELECT * INTO emp FROM employees WHERE user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF emp.status IS DISTINCT FROM 'active' THEN
    RETURN false;
  END IF;
  IF p_service_id IS NOT NULL AND emp.service_id IS DISTINCT FROM p_service_id THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM employee_capabilities c
    WHERE c.employee_id = emp.id AND c.capability_key = p_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_capability_keys(p_employee_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(capability_key ORDER BY capability_key), '{}')
  FROM employee_capabilities
  WHERE employee_id = p_employee_id;
$$;

-- Guard org_role like other privileged columns
CREATE OR REPLACE FUNCTION public.guard_employee_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.employee_number IS DISTINCT FROM OLD.employee_number
     OR NEW.performance_score IS DISTINCT FROM OLD.performance_score
     OR NEW.jobs_completed IS DISTINCT FROM OLD.jobs_completed
     OR NEW.reports_to IS DISTINCT FROM OLD.reports_to
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.org_role IS DISTINCT FROM OLD.org_role
     OR (NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
         AND NEW.must_change_password = true)
  THEN
    RAISE EXCEPTION 'insufficient_privilege: this field can only be changed by an administrator';
  END IF;

  RETURN NEW;
END;
$$;

-- Sync flags onto division_permissions for the existing Admin tab
CREATE OR REPLACE FUNCTION public.sync_division_permissions_from_capabilities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp employees%ROWTYPE;
  slug text;
  keys text[];
BEGIN
  SELECT * INTO emp FROM employees WHERE id = COALESCE(NEW.employee_id, OLD.employee_id);
  IF NOT FOUND OR emp.user_id IS NULL OR emp.service_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT s.slug INTO slug FROM services s WHERE s.id = emp.service_id;
  IF slug IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  keys := public.employee_capability_keys(emp.id);

  INSERT INTO division_permissions (
    user_id, employee_id, division_slug,
    can_view, can_manage_bookings, can_approve_quotes,
    can_manage_documents, can_message_clients, can_delete_records, updated_at
  ) VALUES (
    emp.user_id, emp.id, slug,
    'div.view' = ANY (keys),
    'div.manage_bookings' = ANY (keys),
    'div.approve_quotes' = ANY (keys),
    'div.manage_documents' = ANY (keys),
    'div.message_clients' = ANY (keys),
    false,
    now()
  )
  ON CONFLICT (user_id, division_slug) DO UPDATE SET
    employee_id = EXCLUDED.employee_id,
    can_view = EXCLUDED.can_view,
    can_manage_bookings = EXCLUDED.can_manage_bookings,
    can_approve_quotes = EXCLUDED.can_approve_quotes,
    can_manage_documents = EXCLUDED.can_manage_documents,
    can_message_clients = EXCLUDED.can_message_clients,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_div_perms_caps ON employee_capabilities;
CREATE TRIGGER trg_sync_div_perms_caps
  AFTER INSERT OR UPDATE OR DELETE ON employee_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.sync_division_permissions_from_capabilities();

-- ── Grant / appoint RPCs ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._assert_can_grant_to(target employees, actor employees, keys text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  IF target.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Cannot change access for inactive staff';
  END IF;

  IF 'div.manage_staff_access' = ANY (keys) THEN
    RAISE EXCEPTION 'Cannot grant manage-staff-access to staff';
  END IF;

  IF public.is_admin() THEN
    RETURN;
  END IF;

  IF actor.id IS NULL OR actor.org_role IS DISTINCT FROM 'division_head' OR actor.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Permission denied: only a division head or super admin can grant access';
  END IF;

  IF target.service_id IS DISTINCT FROM actor.service_id THEN
    RAISE EXCEPTION 'Permission denied: staff must belong to your division';
  END IF;

  IF target.org_role IN ('division_head', 'super_admin') THEN
    RAISE EXCEPTION 'Permission denied: cannot change access for another head or super admin';
  END IF;

  FOREACH k IN ARRAY keys LOOP
    IF NOT EXISTS (
      SELECT 1 FROM division_grant_ceilings c
      WHERE c.service_id = actor.service_id AND c.capability_key = k
    ) THEN
      RAISE EXCEPTION 'Capability % is not in the grant ceiling for this division', k;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM capability_catalog cat WHERE cat.key = k AND cat.grantable = true
    ) THEN
      RAISE EXCEPTION 'Capability % cannot be granted', k;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.appoint_division_head(target_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target employees%ROWTYPE;
  actor_id uuid;
  k text;
  head_keys text[] := ARRAY[
    'div.view','div.manage_bookings','div.approve_quotes','div.manage_documents',
    'div.message_clients','div.cash_collections','div.reports','div.delegate_tasks',
    'div.manage_staff_access','field.jobs','field.attendance','field.incidents'
  ];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only super admins can appoint division heads';
  END IF;

  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  IF target.service_id IS NULL THEN RAISE EXCEPTION 'Assign a division before appointing a head'; END IF;

  actor_id := public.current_employee_id();

  UPDATE employees SET org_role = 'division_head', updated_at = now() WHERE id = target.id;

  FOREACH k IN ARRAY head_keys LOOP
    INSERT INTO employee_capabilities (employee_id, capability_key, granted_by)
    VALUES (target.id, k, actor_id)
    ON CONFLICT (employee_id, capability_key) DO NOTHING;
  END LOOP;

  INSERT INTO app_access (employee_id, app_type, is_active, granted_by, notes)
  VALUES (target.id, 'employee', true, auth.uid(), 'Appointed division head')
  ON CONFLICT (employee_id) DO UPDATE SET
    app_type = 'employee', is_active = true, updated_at = now(), notes = 'Appointed division head';

  INSERT INTO permission_audit (actor_employee_id, target_employee_id, action, capability_keys, after_keys, metadata)
  VALUES (actor_id, target.id, 'appoint_head', head_keys, head_keys, jsonb_build_object('service_id', target.service_id));

  INSERT INTO employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (target.id, auth.uid(), 'role_assigned', 'Appointed Division Head', jsonb_build_object('org_role', 'division_head'));
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_division_head(target_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target employees%ROWTYPE;
  actor_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only super admins can remove division heads';
  END IF;

  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;

  actor_id := public.current_employee_id();

  UPDATE employees SET org_role = 'staff', updated_at = now() WHERE id = target.id;
  DELETE FROM employee_capabilities
    WHERE employee_id = target.id AND capability_key = 'div.manage_staff_access';

  INSERT INTO permission_audit (actor_employee_id, target_employee_id, action, capability_keys, metadata)
  VALUES (actor_id, target.id, 'remove_head', ARRAY['div.manage_staff_access'], jsonb_build_object('org_role', 'staff'));

  INSERT INTO employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (target.id, auth.uid(), 'role_unassigned', 'Removed as Division Head', jsonb_build_object('org_role', 'staff'));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_division_grant_ceiling(p_service_id uuid, p_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can set grant ceilings';
  END IF;

  DELETE FROM division_grant_ceilings WHERE service_id = p_service_id;
  INSERT INTO division_grant_ceilings (service_id, capability_key)
  SELECT p_service_id, k
  FROM unnest(p_keys) AS k
  WHERE EXISTS (SELECT 1 FROM capability_catalog c WHERE c.key = k AND c.grantable = true);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_division_capabilities(target_employee_id uuid, p_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target employees%ROWTYPE;
  actor employees%ROWTYPE;
  before_keys text[];
  k text;
BEGIN
  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT * INTO actor FROM employees WHERE user_id = auth.uid();

  PERFORM public._assert_can_grant_to(target, actor, p_keys);

  before_keys := public.employee_capability_keys(target.id);

  FOREACH k IN ARRAY p_keys LOOP
    INSERT INTO employee_capabilities (employee_id, capability_key, granted_by)
    VALUES (target.id, k, actor.id)
    ON CONFLICT (employee_id, capability_key) DO NOTHING;
  END LOOP;

  IF 'field.jobs' = ANY (p_keys) OR 'field.attendance' = ANY (p_keys) THEN
    UPDATE employees SET org_role = CASE
      WHEN org_role = 'division_head' THEN org_role
      ELSE 'field_staff'
    END WHERE id = target.id AND org_role NOT IN ('division_head', 'super_admin');
    INSERT INTO app_access (employee_id, app_type, is_active, granted_by)
    VALUES (target.id, 'field', true, auth.uid())
    ON CONFLICT (employee_id) DO UPDATE SET app_type = 'field', is_active = true, updated_at = now();
  END IF;

  INSERT INTO permission_audit (actor_employee_id, target_employee_id, action, capability_keys, before_keys, after_keys)
  VALUES (actor.id, target.id, 'grant', p_keys, before_keys, public.employee_capability_keys(target.id));

  INSERT INTO employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (target.id, auth.uid(), 'profile_updated', 'Division capabilities granted', jsonb_build_object('keys', p_keys));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_division_capabilities(target_employee_id uuid, p_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target employees%ROWTYPE;
  actor employees%ROWTYPE;
  before_keys text[];
  remaining text[];
BEGIN
  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT * INTO actor FROM employees WHERE user_id = auth.uid();

  PERFORM public._assert_can_grant_to(target, actor, p_keys);

  before_keys := public.employee_capability_keys(target.id);

  DELETE FROM employee_capabilities
  WHERE employee_id = target.id AND capability_key = ANY (p_keys);

  remaining := public.employee_capability_keys(target.id);

  IF NOT ('field.jobs' = ANY (remaining) OR 'field.attendance' = ANY (remaining) OR 'field.incidents' = ANY (remaining)) THEN
    IF target.org_role = 'field_staff' THEN
      UPDATE employees SET org_role = 'staff' WHERE id = target.id;
    END IF;
    UPDATE app_access SET app_type = 'employee', updated_at = now() WHERE employee_id = target.id AND app_type = 'field';
  END IF;

  INSERT INTO permission_audit (actor_employee_id, target_employee_id, action, capability_keys, before_keys, after_keys)
  VALUES (actor.id, target.id, 'revoke', p_keys, before_keys, remaining);

  INSERT INTO employee_activity_logs (employee_id, actor_id, action, description, metadata)
  VALUES (target.id, auth.uid(), 'profile_updated', 'Division capabilities revoked', jsonb_build_object('keys', p_keys));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_staff_app_access(target_employee_id uuid, p_app_type text, p_is_active boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target employees%ROWTYPE;
  actor employees%ROWTYPE;
BEGIN
  IF p_app_type NOT IN ('employee', 'field') THEN
    RAISE EXCEPTION 'Invalid app type';
  END IF;

  SELECT * INTO target FROM employees WHERE id = target_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
  SELECT * INTO actor FROM employees WHERE user_id = auth.uid();

  IF NOT public.is_admin() THEN
    IF actor.org_role IS DISTINCT FROM 'division_head' OR actor.service_id IS DISTINCT FROM target.service_id THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
    IF target.org_role IN ('division_head', 'super_admin') THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  INSERT INTO app_access (employee_id, app_type, is_active, granted_by)
  VALUES (target.id, p_app_type, p_is_active, auth.uid())
  ON CONFLICT (employee_id) DO UPDATE SET
    app_type = EXCLUDED.app_type,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  IF p_app_type = 'field' AND p_is_active THEN
    UPDATE employees SET org_role = 'field_staff' WHERE id = target.id AND org_role = 'staff';
    INSERT INTO employee_capabilities (employee_id, capability_key, granted_by)
    VALUES (target.id, 'field.jobs', actor.id)
    ON CONFLICT (employee_id, capability_key) DO NOTHING;
  ELSIF p_app_type = 'employee' AND target.org_role = 'field_staff' THEN
    UPDATE employees SET org_role = 'staff' WHERE id = target.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_division_staff()
RETURNS TABLE (
  id uuid,
  full_name text,
  employee_number text,
  email text,
  phone text,
  role_id uuid,
  org_role text,
  status text,
  user_id uuid,
  photo_url text,
  hr_role_name text,
  app_type text,
  app_active boolean,
  capability_keys text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  svc uuid;
BEGIN
  IF public.is_admin() THEN
    svc := NULL;
  ELSE
    SELECT e.service_id INTO svc FROM employees e
    WHERE e.user_id = auth.uid() AND e.org_role = 'division_head' AND e.status = 'active';
    IF svc IS NULL THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.full_name, e.employee_number, e.email, e.phone, e.role_id, e.org_role, e.status,
    e.user_id, e.photo_url, r.name,
    COALESCE(a.app_type, 'employee'), COALESCE(a.is_active, true),
    public.employee_capability_keys(e.id)
  FROM employees e
  LEFT JOIN hr_roles r ON r.id = e.role_id
  LEFT JOIN app_access a ON a.employee_id = e.id
  WHERE (svc IS NULL OR e.service_id = svc)
  ORDER BY e.full_name;
END;
$$;

-- Allow Super Admin grant with NULL admin_role_id
CREATE OR REPLACE FUNCTION grant_admin_access(target_employee_id uuid, role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can grant admin access';
  END IF;

  UPDATE profiles
  SET role = 'admin',
      admin_role_id = role_id
  WHERE id = (
    SELECT user_id FROM employees WHERE id = target_employee_id
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee has no linked user account';
  END IF;
END;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE employee_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE division_grant_ceilings ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_capability_catalog" ON capability_catalog;
CREATE POLICY "read_capability_catalog" ON capability_catalog FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_capability_catalog" ON capability_catalog;
CREATE POLICY "admin_manage_capability_catalog" ON capability_catalog FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "read_grant_ceilings" ON division_grant_ceilings;
CREATE POLICY "read_grant_ceilings" ON division_grant_ceilings FOR SELECT
  TO authenticated USING (is_admin() OR is_division_head(service_id));

DROP POLICY IF EXISTS "admin_manage_grant_ceilings" ON division_grant_ceilings;
CREATE POLICY "admin_manage_grant_ceilings" ON division_grant_ceilings FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "select_employee_capabilities" ON employee_capabilities;
CREATE POLICY "select_employee_capabilities" ON employee_capabilities FOR SELECT
  TO authenticated USING (
    is_admin()
    OR employee_id = current_employee_id()
    OR EXISTS (
      SELECT 1 FROM employees target
      WHERE target.id = employee_capabilities.employee_id
        AND is_division_head(target.service_id)
    )
  );

DROP POLICY IF EXISTS "select_permission_audit" ON permission_audit;
CREATE POLICY "select_permission_audit" ON permission_audit FOR SELECT
  TO authenticated USING (
    is_admin()
    OR actor_employee_id = current_employee_id()
    OR EXISTS (
      SELECT 1 FROM employees target
      WHERE target.id = permission_audit.target_employee_id
        AND is_division_head(target.service_id)
    )
  );

DROP POLICY IF EXISTS "division_head_select_team" ON employees;
CREATE POLICY "division_head_select_team" ON employees
  FOR SELECT TO authenticated
  USING (is_division_head(service_id));

DROP POLICY IF EXISTS "head_select_team_app_access" ON app_access;
CREATE POLICY "head_select_team_app_access" ON app_access FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = app_access.employee_id AND is_division_head(e.service_id)
    )
  );

-- Bookings: division staff with view/manage
DROP POLICY IF EXISTS "staff_select_division_bookings" ON bookings;
CREATE POLICY "staff_select_division_bookings" ON bookings FOR SELECT
  TO authenticated USING (
    has_capability('div.view', service_id)
    OR has_capability('div.manage_bookings', service_id)
    OR has_capability('div.approve_quotes', service_id)
  );

DROP POLICY IF EXISTS "staff_update_division_bookings" ON bookings;
CREATE POLICY "staff_update_division_bookings" ON bookings FOR UPDATE
  TO authenticated
  USING (
    has_capability('div.manage_bookings', service_id)
    OR has_capability('div.approve_quotes', service_id)
  )
  WITH CHECK (
    has_capability('div.manage_bookings', service_id)
    OR has_capability('div.approve_quotes', service_id)
  );

DROP POLICY IF EXISTS "staff_select_division_messages" ON messages;
CREATE POLICY "staff_select_division_messages" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = messages.booking_id
        AND (
          has_capability('div.message_clients', b.service_id)
          OR has_capability('div.view', b.service_id)
        )
    )
  );

DROP POLICY IF EXISTS "staff_insert_division_messages" ON messages;
CREATE POLICY "staff_insert_division_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = messages.booking_id
        AND has_capability('div.message_clients', b.service_id)
    )
  );

DROP POLICY IF EXISTS "staff_select_division_documents" ON documents;
CREATE POLICY "staff_select_division_documents" ON documents FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = documents.booking_id
        AND (
          has_capability('div.manage_documents', b.service_id)
          OR has_capability('div.view', b.service_id)
        )
    )
  );

DROP POLICY IF EXISTS "staff_insert_division_documents" ON documents;
CREATE POLICY "staff_insert_division_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = documents.booking_id AND has_capability('div.manage_documents', b.service_id)
    )
  );

DROP POLICY IF EXISTS "head_insert_delegations" ON task_delegations;
CREATE POLICY "head_insert_delegations" ON task_delegations FOR INSERT
  TO authenticated WITH CHECK (
    assigned_by = auth.uid()
    AND has_capability('div.delegate_tasks', service_id)
  );

-- ── Grants ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.current_employee_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_division_head(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_capability(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_capability_keys(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.appoint_division_head(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_division_head(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_division_grant_ceiling(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_division_capabilities(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_division_capabilities(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_staff_app_access(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_division_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_can_grant_to(employees, employees, text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_division_head(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_capability(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_capability_keys(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appoint_division_head(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_division_head(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_division_grant_ceiling(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_division_capabilities(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_division_capabilities(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_app_access(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_division_staff() TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON employee_capabilities FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON permission_audit FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON division_grant_ceilings FROM authenticated;
GRANT SELECT ON employee_capabilities TO authenticated;
GRANT SELECT ON capability_catalog TO authenticated;
GRANT SELECT ON division_grant_ceilings TO authenticated;
GRANT SELECT ON permission_audit TO authenticated;
