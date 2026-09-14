-- Per-service finance ledgers for Admin & Finance CRUD.

CREATE TABLE IF NOT EXISTS public.service_finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL CHECK (kind IN ('revenue', 'expense', 'adjustment')),
  category text NOT NULL DEFAULT 'other',
  amount_sle numeric(14,2) NOT NULL,
  description text,
  reference text,
  notes text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_finance_entries_service_idx
  ON public.service_finance_entries (service_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS service_finance_entries_kind_idx
  ON public.service_finance_entries (kind);

ALTER TABLE public.service_finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_service_finance_entries" ON public.service_finance_entries;
CREATE POLICY "select_service_finance_entries" ON public.service_finance_entries FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_admin_finance_staff()
    OR public.has_finance_permission('can_view_finance')
  );

DROP POLICY IF EXISTS "insert_service_finance_entries" ON public.service_finance_entries;
CREATE POLICY "insert_service_finance_entries" ON public.service_finance_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_finance_permission('can_add_transactions')
    OR public.has_finance_permission('can_manage_invoices')
  );

DROP POLICY IF EXISTS "update_service_finance_entries" ON public.service_finance_entries;
CREATE POLICY "update_service_finance_entries" ON public.service_finance_entries FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_finance_permission('can_add_transactions')
    OR public.has_finance_permission('can_manage_invoices')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_finance_permission('can_add_transactions')
    OR public.has_finance_permission('can_manage_invoices')
  );

DROP POLICY IF EXISTS "delete_service_finance_entries" ON public.service_finance_entries;
CREATE POLICY "delete_service_finance_entries" ON public.service_finance_entries FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_finance_permission('can_delete_transactions')
    OR public.has_finance_permission('can_manage_invoices')
  );

DROP TRIGGER IF EXISTS service_finance_entries_updated_at ON public.service_finance_entries;
CREATE TRIGGER service_finance_entries_updated_at
  BEFORE UPDATE ON public.service_finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Page ACL for service ledgers
INSERT INTO public.hr_role_permissions (role_id, page_key, can_access)
SELECT r.id, p.page_key, true
FROM public.hr_roles r
JOIN public.services s ON s.id = r.service_id AND s.slug = 'admin-finance'
CROSS JOIN (VALUES
  ('finance-services'),
  ('finance-cf'),
  ('finance-smart-sort'),
  ('finance-cleaning'),
  ('finance-security'),
  ('finance-procurement')
) AS p(page_key)
WHERE r.name IN ('Admin', 'Finance Officer', 'Admin Manager', 'Admin Assistant')
ON CONFLICT (role_id, page_key) DO NOTHING;

INSERT INTO public.hr_role_permissions (role_id, page_key, can_access)
SELECT r.id, p.page_key, true
FROM public.hr_roles r
CROSS JOIN (VALUES
  ('finance-services'),
  ('finance-cf'),
  ('finance-smart-sort'),
  ('finance-cleaning'),
  ('finance-security'),
  ('finance-procurement')
) AS p(page_key)
WHERE r.name = 'Finance Manager' AND r.service_id IS NULL
ON CONFLICT (role_id, page_key) DO NOTHING;
