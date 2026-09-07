/*
  # Fix division_permissions slug check and sync trigger

  Resolves check constraint violation:
  "new row for relation \"division_permissions\" violates check constraint \"division_permissions_division_slug_check\""
  when granting capabilities or permissions to Cleaning & Janitorial staff.

  1. Drops the restrictive check constraint before updating legacy rows.
  2. Updates check constraint to accept both canonical and legacy slugs:
     - 'cleaning-janitorial' and 'cleaning-services'
     - 'waste-management' and 'smart-sort'
     - 'clearing-forwarding', 'private-security', 'procurement'
  3. Ensures employee_id column exists on division_permissions.
  4. Updates sync_division_permissions_from_capabilities() to canonicalize slugs
     and safely catch any mirror-sync errors without blocking capability grants.
*/

-- ── 1. Drop existing check constraint first ───────────────────────────────
ALTER TABLE division_permissions
  DROP CONSTRAINT IF EXISTS division_permissions_division_slug_check;

-- ── 2. Deduplicate and normalize legacy rows ──────────────────────────────
-- Cleaning & Janitorial
DELETE FROM division_permissions dp1
WHERE dp1.division_slug = 'cleaning-services'
  AND EXISTS (
    SELECT 1 FROM division_permissions dp2
    WHERE dp2.user_id = dp1.user_id AND dp2.division_slug = 'cleaning-janitorial'
  );

UPDATE division_permissions
SET division_slug = 'cleaning-janitorial'
WHERE division_slug = 'cleaning-services';

-- Smart Sort / Waste Management
DELETE FROM division_permissions dp1
WHERE dp1.division_slug = 'smart-sort'
  AND EXISTS (
    SELECT 1 FROM division_permissions dp2
    WHERE dp2.user_id = dp1.user_id AND dp2.division_slug = 'waste-management'
  );

UPDATE division_permissions
SET division_slug = 'waste-management'
WHERE division_slug = 'smart-sort';

-- ── 3. Add robust check constraint that permits canonical and alias slugs ─
ALTER TABLE division_permissions
  ADD CONSTRAINT division_permissions_division_slug_check
  CHECK (division_slug IN (
    'clearing-forwarding',
    'waste-management',
    'smart-sort',
    'cleaning-janitorial',
    'cleaning-services',
    'private-security',
    'procurement'
  ));

-- ── 4. Ensure employee_id column exists and is backfilled ─────────────────
ALTER TABLE division_permissions
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id) ON DELETE CASCADE;

UPDATE division_permissions dp
SET employee_id = e.id
FROM employees e
WHERE dp.employee_id IS NULL AND e.user_id = dp.user_id;

-- ── 5. Safe trigger function for syncing capabilities to division_permissions
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

  -- Canonicalize slug
  IF slug = 'cleaning-services' THEN
    slug := 'cleaning-janitorial';
  ELSIF slug = 'smart-sort' THEN
    slug := 'waste-management';
  END IF;

  keys := public.employee_capability_keys(emp.id);

  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    -- If sync fails for legacy division_permissions, log warning and do not block capability grant
    RAISE WARNING 'sync_division_permissions_from_capabilities failed for employee %: %', emp.id, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_div_perms_caps ON employee_capabilities;
CREATE TRIGGER trg_sync_div_perms_caps
  AFTER INSERT OR UPDATE OR DELETE ON employee_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.sync_division_permissions_from_capabilities();
