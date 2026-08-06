-- Seed a cross-division Finance Manager role and default permissions
-- This role manages financial transactions across all 5 services

INSERT INTO hr_roles (service_id, name, description, is_active, display_order, is_default)
VALUES (
  NULL,
  'Finance Manager',
  'Manages financial transactions, invoices, payments, wallets and receipts across all 5 service divisions. Oversees revenue, payouts and financial reporting.',
  true,
  0,
  false
)
ON CONFLICT DO NOTHING;

-- Grant finance-related page permissions to the Finance Manager role
INSERT INTO hr_role_permissions (role_id, page_key, can_access)
SELECT r.id, p.page_key, true
FROM hr_roles r
CROSS JOIN (VALUES
  ('overview'),
  ('analytics'),
  ('bookings'),
  ('wallet'),
  ('finance'),
  ('receipts'),
  ('clients'),
  ('booking-review'),
  ('division-cf'),
  ('division-smart-sort'),
  ('division-cleaning'),
  ('division-security'),
  ('division-procurement')
) AS p(page_key)
WHERE r.name = 'Finance Manager' AND r.service_id IS NULL
ON CONFLICT (role_id, page_key) DO NOTHING;
