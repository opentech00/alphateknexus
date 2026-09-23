/*
HR-managed employee payslips.

- employee_compensation: admin-only salary template + bank details (not on employees;
  staff can update their own employee row).
- payslips: one live draft/issued slip per employee per calendar month; voided
  rows may be replaced.
- Storage reuses the private employee-documents bucket. Paths must start with
  the employee's auth user_id so they can download via existing storage RLS.
- Issue enqueue: payslip_issued (category hr) — do not insert employee_documents
  or the HR-file trigger would double-notify.
*/

-- ── Compensation (admin only) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_compensation (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  basic_salary numeric(14, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SLE',
  bank_name text,
  account_name text,
  account_number text,
  default_earnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_compensation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_employee_compensation_admin" ON public.employee_compensation;
CREATE POLICY "select_employee_compensation_admin" ON public.employee_compensation
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "insert_employee_compensation_admin" ON public.employee_compensation;
CREATE POLICY "insert_employee_compensation_admin" ON public.employee_compensation
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_employee_compensation_admin" ON public.employee_compensation;
CREATE POLICY "update_employee_compensation_admin" ON public.employee_compensation
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_employee_compensation_admin" ON public.employee_compensation;
CREATE POLICY "delete_employee_compensation_admin" ON public.employee_compensation
  FOR DELETE TO authenticated USING (public.is_admin());

-- ── Payslips ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_year integer NOT NULL CHECK (period_year >= 2020 AND period_year <= 2100),
  period_month integer NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'voided')),
  currency text NOT NULL DEFAULT 'SLE',
  earnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
  gross_pay numeric(14, 2) NOT NULL DEFAULT 0,
  total_deductions numeric(14, 2) NOT NULL DEFAULT 0,
  net_pay numeric(14, 2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer', 'cash', 'other')),
  bank_name text,
  account_name text,
  account_number text,
  notes text,
  pdf_path text,
  attachment_path text,
  attachment_name text,
  issued_at timestamptz,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payslips_dates_ok CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS payslips_live_period_uidx
  ON public.payslips (employee_id, period_year, period_month)
  WHERE status <> 'voided';

CREATE INDEX IF NOT EXISTS payslips_period_idx
  ON public.payslips (period_year, period_month, status);

CREATE INDEX IF NOT EXISTS payslips_employee_idx
  ON public.payslips (employee_id, period_year DESC, period_month DESC);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_payslips" ON public.payslips;
CREATE POLICY "select_payslips" ON public.payslips
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR (
      status = 'issued'
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = payslips.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "insert_payslips_admin" ON public.payslips;
CREATE POLICY "insert_payslips_admin" ON public.payslips
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_payslips_admin" ON public.payslips;
CREATE POLICY "update_payslips_admin" ON public.payslips
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_payslips_admin" ON public.payslips;
CREATE POLICY "delete_payslips_admin" ON public.payslips
  FOR DELETE TO authenticated USING (public.is_admin());

-- ── Notification types for deep-links ───────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_type_check'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;
END $$;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'booking_update', 'message', 'system',
    'field_dispatch', 'hr_update', 'payment',
    'assignment', 'incident', 'review_prompt',
    'subscription', 'announcement',
    'payslip_issued', 'hr_file_uploaded'
  ));

-- ── Issue → employee ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_payslip_issued_enqueue_notif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_period text;
BEGIN
  IF NEW.status = 'issued' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'issued') THEN
    SELECT user_id INTO v_user FROM public.employees WHERE id = NEW.employee_id;
    IF v_user IS NOT NULL AND v_user IS DISTINCT FROM NEW.issued_by THEN
      v_period := to_char(make_date(NEW.period_year, NEW.period_month, 1), 'FMMonth YYYY');
      PERFORM public.enqueue_notification(
        v_user,
        'employee',
        'payslip_issued',
        'Payslip issued',
        'Your payslip for ' || v_period || ' is ready to download.',
        'hr',
        jsonb_build_object(
          'payslip_id', NEW.id,
          'period_year', NEW.period_year,
          'period_month', NEW.period_month,
          'actor_id', NEW.issued_by
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_payslip_issued_enqueue ON public.payslips;
CREATE TRIGGER on_payslip_issued_enqueue
  AFTER INSERT OR UPDATE OF status ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.on_payslip_issued_enqueue_notif();
