-- Internal Admin & Finance department (not a client-bookable service).

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

INSERT INTO public.services (name, slug, description, icon, price_range, is_active, is_internal)
VALUES (
  'Admin & Finance',
  'admin-finance',
  'Internal administration and finance department. Not available for client bookings.',
  'building',
  'Internal',
  false,
  true
)
ON CONFLICT (slug) DO UPDATE
SET
  is_internal = true,
  is_active = false,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  price_range = EXCLUDED.price_range;

-- Clients only see bookable services.
DROP POLICY IF EXISTS "anyone_can_read_active_services" ON public.services;
CREATE POLICY "anyone_can_read_active_services"
  ON public.services FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND is_internal = false);

-- Staff can read their assigned department even when it is internal / inactive.
DROP POLICY IF EXISTS "employee_read_own_service" ON public.services;
CREATE POLICY "employee_read_own_service"
  ON public.services FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND e.service_id = services.id
    )
  );

-- Department-scoped HR roles
DO $$
DECLARE
  v_service_id uuid;
BEGIN
  SELECT id INTO v_service_id FROM public.services WHERE slug = 'admin-finance';
  IF v_service_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hr_roles WHERE service_id = v_service_id AND name = 'Admin'
  ) THEN
    INSERT INTO public.hr_roles (service_id, name, description, is_active, display_order, is_default)
    VALUES (
      v_service_id,
      'Admin',
      'Department administrator for Admin & Finance.',
      true,
      1,
      true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hr_roles WHERE service_id = v_service_id AND name = 'Finance Officer'
  ) THEN
    INSERT INTO public.hr_roles (service_id, name, description, is_active, display_order, is_default)
    VALUES (
      v_service_id,
      'Finance Officer',
      'Handles invoices, receipts, and day-to-day finance operations.',
      true,
      2,
      false
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hr_roles WHERE service_id = v_service_id AND name = 'Admin Assistant'
  ) THEN
    INSERT INTO public.hr_roles (service_id, name, description, is_active, display_order, is_default)
    VALUES (
      v_service_id,
      'Admin Assistant',
      'Supports administration, records, and internal coordination.',
      true,
      3,
      false
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hr_roles WHERE service_id = v_service_id AND name = 'Admin Manager'
  ) THEN
    INSERT INTO public.hr_roles (service_id, name, description, is_active, display_order, is_default)
    VALUES (
      v_service_id,
      'Admin Manager',
      'Leads the Admin & Finance department and coordinates internal staff.',
      true,
      4,
      false
    );
  END IF;
END $$;

-- Internal activities only (no bookings / schedule)
INSERT INTO public.role_activities (
  role_id, service_id, activity_key, activity_label, activity_description, activity_type, display_order
)
SELECT NULL, s.id, 'documents', 'Documents', 'Upload and view department documents', 'page', 1
FROM public.services s
WHERE s.slug = 'admin-finance'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_activities (
  role_id, service_id, activity_key, activity_label, activity_description, activity_type, display_order
)
SELECT NULL, s.id, 'report', 'Submit Report', 'Submit internal admin or finance reports', 'action', 2
FROM public.services s
WHERE s.slug = 'admin-finance'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_activities (
  role_id, service_id, activity_key, activity_label, activity_description, activity_type, display_order
)
SELECT NULL, s.id, 'performance', 'My Performance', 'View your internal performance metrics', 'report', 3
FROM public.services s
WHERE s.slug = 'admin-finance'
ON CONFLICT DO NOTHING;

ALTER TABLE public.division_permissions
  DROP CONSTRAINT IF EXISTS division_permissions_division_slug_check;

ALTER TABLE public.division_permissions
  ADD CONSTRAINT division_permissions_division_slug_check
  CHECK (division_slug IN (
    'clearing-forwarding',
    'waste-management',
    'smart-sort',
    'cleaning-janitorial',
    'cleaning-services',
    'private-security',
    'procurement',
    'admin-finance'
  ));
