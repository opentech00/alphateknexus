/*
# Cash Payment Module — payments, cash_collections, audit log

## Overview
Adds the foundation for a production cash payment lifecycle alongside the
existing Monime online payments. Clients can choose "pay with cash" for
bookings, invoices, and wallet top-ups; field staff log cash collected
on-site; admins confirm and reconcile deposits. Every state change is
audited.

## 1. New Tables

### `payments`
The single source of truth for every payment (online or cash) linked to a
booking, invoice, or wallet top-up. Replaces ad-hoc payment tracking spread
across bookings/invoices.
- `id` (uuid PK)
- `user_id` (uuid, FK auth.users, defaults to auth.uid()) — the paying client
- `payable_type` (text) — 'booking' | 'invoice' | 'wallet_topup' | 'subscription'
- `payable_id` (uuid, nullable) — FK to the related record (booking/invoice id)
- `amount_sle` (numeric, > 0) — amount to collect
- `method` (text) — 'monime' | 'cash' | 'wallet' | 'bank_transfer'
- `status` (text) — 'pending' | 'collected' | 'confirmed' | 'cancelled' | 'failed' (default pending)
- `reference` (text) — human-readable reference (e.g. CSH-2026-0001)
- `collector_id` (uuid, FK auth.users, nullable) — field staff who collected cash
- `collected_at` (timestamptz, nullable) — when cash was collected on-site
- `confirmed_by` (uuid, FK auth.users, nullable) — admin who confirmed the deposit
- `confirmed_at` (timestamptz, nullable) — when cash was confirmed deposited
- `deposit_reference` (text, nullable) — bank deposit slip number
- `notes` (text, nullable)
- `created_at` / `updated_at` (timestamptz)

### `cash_collections`
Field-staff on-site cash collection logs, linked to a payment. Admins
confirm these to complete the audit trail.
- `id` (uuid PK)
- `payment_id` (uuid, FK payments, ON DELETE CASCADE)
- `employee_id` (uuid, FK auth.users) — the field staff member
- `amount_received` (numeric, > 0) — cash handed over
- `photo_url` (text, nullable) — photo of cash/count (storage URL)
- `gps_lat` (numeric, nullable) / `gps_lng` (numeric, nullable) — collection location
- `client_signature` (text, nullable) — base64 signature or name
- `status` (text) — 'pending_confirmation' | 'confirmed' | 'rejected' (default pending_confirmation)
- `confirmed_by` (uuid, FK auth.users, nullable)
- `confirmed_at` (timestamptz, nullable)
- `rejection_reason` (text, nullable)
- `created_at` / `updated_at` (timestamptz)

### `payment_audit_log`
Immutable record of every payment state change for reconciliation and
dispute resolution.
- `id` (uuid PK)
- `payment_id` (uuid, FK payments, ON DELETE CASCADE)
- `actor_id` (uuid, FK auth.users, nullable) — who made the change
- `previous_status` (text, nullable)
- `new_status` (text)
- `note` (text, nullable)
- `created_at` (timestamptz, default now())

## 2. Modified Tables
- `bookings` — add `payment_method` (text) and `payment_status` (text) columns
  so each booking knows how it is being paid and whether cash is pending.
- `invoices` — add `payment_method` (text) column to track cash vs online.

## 3. Security
- RLS enabled on all new tables.
- `payments`: clients SELECT/INSERT own; admins SELECT/UPDATE all.
- `cash_collections`: employees SELECT/INSERT own; admins SELECT/UPDATE all.
- `payment_audit_log`: admins SELECT all; INSERT allowed for authenticated
  (the trigger/edge function writes rows scoped to the actor).

## 4. Important Notes
1. A trigger writes to `payment_audit_log` on every `payments` UPDATE so the
   audit trail cannot be bypassed from the client.
2. A sequence generates human-readable cash references (CSH-YYYY-NNNN).
3. An idempotency guard prevents double-confirmation of a cash payment.
4. `payments.payable_id` is nullable (not all payments link to a concrete
   record; e.g. ad-hoc cash top-ups). When present it is NOT a hard FK to
   avoid coupling to multiple tables; validation is done in app code.
*/

-- ── Sequence for cash payment references ──
CREATE SEQUENCE IF NOT EXISTS cash_payment_ref_seq START 1;

CREATE OR REPLACE FUNCTION generate_cash_reference()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'CSH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('cash_payment_ref_seq')::text, 4, '0');
$$;

-- ── payments table ──
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  payable_type text NOT NULL CHECK (payable_type IN ('booking','invoice','wallet_topup','subscription')),
  payable_id uuid,
  amount_sle numeric(14,2) NOT NULL CHECK (amount_sle > 0),
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('monime','cash','wallet','bank_transfer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','collected','confirmed','cancelled','failed')),
  reference text NOT NULL DEFAULT generate_cash_reference(),
  collector_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  collected_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  deposit_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_payable ON payments(payable_type, payable_id);

DROP POLICY IF EXISTS "select_own_payments" ON payments;
CREATE POLICY "select_own_payments" ON payments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_select_all_payments" ON payments;
CREATE POLICY "admin_select_all_payments" ON payments FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "insert_own_payments" ON payments;
CREATE POLICY "insert_own_payments" ON payments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_update_payments" ON payments;
CREATE POLICY "admin_update_payments" ON payments FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "collector_update_payments" ON payments;
CREATE POLICY "collector_update_payments" ON payments FOR UPDATE
  TO authenticated
  USING (auth.uid() = collector_id AND status = 'pending')
  WITH CHECK (auth.uid() = collector_id);

-- ── cash_collections table ──
CREATE TABLE IF NOT EXISTS cash_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_received numeric(14,2) NOT NULL CHECK (amount_received > 0),
  photo_url text,
  gps_lat numeric(9,6),
  gps_lng numeric(9,6),
  client_signature text,
  status text NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation','confirmed','rejected')),
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cash_collections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cash_collections_employee ON cash_collections(employee_id);
CREATE INDEX IF NOT EXISTS idx_cash_collections_status ON cash_collections(status);

DROP POLICY IF EXISTS "select_own_cash_collections" ON cash_collections;
CREATE POLICY "select_own_cash_collections" ON cash_collections FOR SELECT
  TO authenticated USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "admin_select_all_cash_collections" ON cash_collections;
CREATE POLICY "admin_select_all_cash_collections" ON cash_collections FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "insert_own_cash_collections" ON cash_collections;
CREATE POLICY "insert_own_cash_collections" ON cash_collections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "admin_update_cash_collections" ON cash_collections;
CREATE POLICY "admin_update_cash_collections" ON cash_collections FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ── payment_audit_log table ──
CREATE TABLE IF NOT EXISTS payment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status text,
  new_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_audit_payment ON payment_audit_log(payment_id);

DROP POLICY IF EXISTS "admin_select_audit_log" ON payment_audit_log;
CREATE POLICY "admin_select_audit_log" ON payment_audit_log FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "insert_audit_log" ON payment_audit_log;
CREATE POLICY "insert_audit_log" ON payment_audit_log FOR INSERT
  TO authenticated WITH CHECK (true);

-- ── Audit trigger on payments ──
CREATE OR REPLACE FUNCTION log_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO payment_audit_log (payment_id, actor_id, previous_status, new_status)
    VALUES (NEW.id, auth.uid(), OLD.status, NEW.status);
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_status_change ON payments;
CREATE TRIGGER payments_status_change AFTER UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION log_payment_status_change();

-- ── Idempotency guard: prevent double-confirmation ──
CREATE OR REPLACE FUNCTION prevent_double_payment_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.status = 'confirmed' AND NEW.status = 'confirmed') THEN
    RAISE EXCEPTION 'Payment % is already confirmed — double confirmation blocked', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_no_double_confirm ON payments;
CREATE TRIGGER payments_no_double_confirm BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION prevent_double_payment_confirmation();

-- ── Add payment columns to bookings ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'payment_method') THEN
    ALTER TABLE bookings ADD COLUMN payment_method text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'payment_status') THEN
    ALTER TABLE bookings ADD COLUMN payment_status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- ── Add payment_method to invoices ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'payment_method') THEN
    ALTER TABLE invoices ADD COLUMN payment_method text;
  END IF;
END $$;

-- ── updated_at triggers for new tables ──
DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS cash_collections_updated_at ON cash_collections;
CREATE TRIGGER cash_collections_updated_at BEFORE UPDATE ON cash_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
