/*
# Finance Pro: Email Notifications, Realtime Alerts & Scheduled Reports

## Overview
Adds infrastructure for three pro features:
1. Automated email notifications for financial events (invoices, payments, withdrawals)
2. Realtime in-app notification triggers on financial events
3. Scheduled financial reports and client statements

## 1. New Tables

### `email_log`
Tracks all outgoing finance-related emails for audit and retry.
- `id` (uuid PK)
- `user_id` (uuid, references auth.users) — recipient
- `recipient_email` (text) — email address sent to
- `event_type` (text) — invoice_issued | payment_received | withdrawal_approved | withdrawal_rejected | low_balance | finance_report
- `subject` (text) — email subject
- `status` (text) — sent | failed (default sent)
- `reference_id` (uuid) — optional ID of the related entity (invoice, withdrawal, etc.)
- `error_message` (text) — error details if failed
- `created_at` (timestamptz)

### `finance_reports`
Stores generated financial reports and client statements.
- `id` (uuid PK)
- `user_id` (uuid, references auth.users, nullable) — null for admin-level reports
- `report_type` (text) — weekly_digest | monthly_statement | client_statement | admin_revenue
- `period_start` (date) — report period start
- `period_end` (date) — report period end
- `summary` (jsonb) — structured summary data (totals, counts, breakdowns)
- `status` (text) — generated | emailed (default generated)
- `created_at` (timestamptz)

## 2. Functions & Triggers

### `notify_invoice_status_change()`
Trigger on invoices UPDATE — when status changes to 'sent' or 'paid', inserts an in-app
notification for the client. This powers realtime toasts in the client app.

### `notify_withdrawal_status_change()`
Trigger on withdrawal_requests UPDATE — when status changes to approved/rejected/completed,
inserts an in-app notification for the client.

### `notify_wallet_transaction()`
Trigger on wallet_transactions INSERT — inserts an in-app notification for the client
when a new transaction is recorded (topup, payment, refund).

## 3. Security
- RLS enabled on both new tables.
- `email_log`: admins can see all; users can see their own.
- `finance_reports`: admins can see all; users can see their own. Admins can insert/update/delete.

## 4. Important Notes
1. The triggers insert in-app notifications only — actual email delivery is handled by edge
   functions called from the frontend (or manually triggered). This separation ensures
   notifications always work even if the email provider is down.
2. Full admins bypass all RLS on finance_reports and email_log.
3. The `notify_*` functions use `NEW.user_id` to target the correct client.
4. Triggers are idempotent — they check the OLD vs NEW status to avoid duplicate notifications.
*/

-- ── email_log ──
CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'invoice_issued', 'payment_received', 'withdrawal_approved',
    'withdrawal_rejected', 'low_balance', 'finance_report', 'invoice_paid'
  )),
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  reference_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_event ON email_log(event_type);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_all_email_log" ON email_log;
CREATE POLICY "admin_select_all_email_log" ON email_log FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "select_own_email_log" ON email_log;
CREATE POLICY "select_own_email_log" ON email_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_insert_email_log" ON email_log;
CREATE POLICY "admin_insert_email_log" ON email_log FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ── finance_reports ──
CREATE TABLE IF NOT EXISTS finance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN (
    'weekly_digest', 'monthly_statement', 'client_statement', 'admin_revenue'
  )),
  period_start date NOT NULL,
  period_end date NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'emailed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_reports_user ON finance_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_reports_type ON finance_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_finance_reports_period ON finance_reports(period_start);

ALTER TABLE finance_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_all_finance_reports" ON finance_reports;
CREATE POLICY "admin_select_all_finance_reports" ON finance_reports FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "select_own_finance_reports" ON finance_reports;
CREATE POLICY "select_own_finance_reports" ON finance_reports FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_insert_finance_reports" ON finance_reports;
CREATE POLICY "admin_insert_finance_reports" ON finance_reports FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_update_finance_reports" ON finance_reports;
CREATE POLICY "admin_update_finance_reports" ON finance_reports FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_finance_reports" ON finance_reports;
CREATE POLICY "admin_delete_finance_reports" ON finance_reports FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ── Trigger: notify_invoice_status_change ──
CREATE OR REPLACE FUNCTION notify_invoice_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent' THEN
      INSERT INTO notifications (user_id, title, body, type, read, service_slug)
      VALUES (NEW.user_id, 'Invoice ' || NEW.invoice_number, 'You have a new invoice for ' || NEW.currency || ' ' || trim(to_char(NEW.total, '999,999,990.00')) || '. Due ' || to_char(NEW.due_date::date, 'DD Mon YYYY') || '.', 'invoice', false, 'finance');
    ELSIF NEW.status = 'paid' THEN
      INSERT INTO notifications (user_id, title, body, type, read, service_slug)
      VALUES (NEW.user_id, 'Invoice Paid', 'Invoice ' || NEW.invoice_number || ' has been marked as paid. Thank you!', 'invoice', false, 'finance');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_status_notify ON invoices;
CREATE TRIGGER trg_invoice_status_notify
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION notify_invoice_status_change();

-- ── Trigger: notify_withdrawal_status_change ──
CREATE OR REPLACE FUNCTION notify_withdrawal_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO notifications (user_id, title, body, type, read, service_slug)
      VALUES (NEW.user_id, 'Withdrawal Approved', 'Your withdrawal request for SLE ' || trim(to_char(NEW.amount_sle, '999,999,990.00')) || ' has been approved. Processing is underway.', 'system', false, 'finance');
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO notifications (user_id, title, body, type, read, service_slug)
      VALUES (NEW.user_id, 'Withdrawal Rejected', 'Your withdrawal request for SLE ' || trim(to_char(NEW.amount_sle, '999,999,990.00')) || ' was rejected. ' || COALESCE(NEW.admin_note, 'Please contact support for details.'), 'system', false, 'finance');
    ELSIF NEW.status = 'completed' THEN
      INSERT INTO notifications (user_id, title, body, type, read, service_slug)
      VALUES (NEW.user_id, 'Withdrawal Completed', 'Your withdrawal of SLE ' || trim(to_char(NEW.amount_sle, '999,999,990.00')) || ' has been completed. The funds have been sent.', 'system', false, 'finance');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_withdrawal_status_notify ON withdrawal_requests;
CREATE TRIGGER trg_withdrawal_status_notify
  AFTER UPDATE ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_withdrawal_status_change();

-- ── Trigger: notify_wallet_transaction ──
CREATE OR REPLACE FUNCTION notify_wallet_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  type_label text;
  amount_label text;
BEGIN
  type_label := CASE NEW.type
    WHEN 'topup' THEN 'Wallet Top-Up'
    WHEN 'payment' THEN 'Payment'
    WHEN 'refund' THEN 'Refund'
    WHEN 'adjustment' THEN 'Wallet Adjustment'
    ELSE 'Transaction'
  END;
  amount_label := 'SLE ' || trim(to_char(abs(NEW.amount_sle), '999,999,990.00'));

  IF NEW.type = 'topup' THEN
    INSERT INTO notifications (user_id, title, body, type, read, service_slug)
    VALUES (NEW.user_id, 'Wallet Credited', type_label || ' of ' || amount_label || ' has been added to your wallet.', 'system', false, 'finance');
  ELSIF NEW.type = 'payment' THEN
    INSERT INTO notifications (user_id, title, body, type, read, service_slug)
    VALUES (NEW.user_id, 'Payment Processed', 'A payment of ' || amount_label || ' was deducted from your wallet.', 'system', false, 'finance');
  ELSIF NEW.type = 'refund' THEN
    INSERT INTO notifications (user_id, title, body, type, read, service_slug)
    VALUES (NEW.user_id, 'Refund Received', 'A refund of ' || amount_label || ' has been credited to your wallet.', 'system', false, 'finance');
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_tx_notify ON wallet_transactions;
CREATE TRIGGER trg_wallet_tx_notify
  AFTER INSERT ON wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION notify_wallet_transaction();

GRANT EXECUTE ON FUNCTION notify_invoice_status_change() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_withdrawal_status_change() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_wallet_transaction() TO authenticated;
