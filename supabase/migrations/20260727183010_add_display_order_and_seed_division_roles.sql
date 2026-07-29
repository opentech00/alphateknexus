/*
# Add display_order to hr_roles and seed default division roles

## Changes
1. Adds `display_order` (integer, default 0) column to `hr_roles` so roles
   can be sorted within a division in a controlled order rather than by
   creation date.
2. Adds `is_default` (boolean, default false) column to `hr_roles` to mark
   the default/primary role for a division (used for quick-assign).
3. Seeds a curated set of roles for each of the 5 divisions:
   - Clearing & Forwarding: Clearing Officer, Forwarding Agent, Customs Broker, Warehouse Supervisor, Logistics Coordinator
   - Smart Sort: Sorter, Recycling Operator, Collection Driver, Facility Supervisor, Weighbridge Operator
   - Cleaning & Janitorial: Janitor, Cleaner, Supervisor, Floor Technician, Restroom Attendant
   - Private Security: Security Guard, Patrol Officer, Supervisor, Control Room Operator, K9 Handler
   - Procurement: Procurement Officer, Buyer, Supply Chain Analyst, Warehouse Clerk, Vendor Manager
4. Adds a partial unique index so each division can have at most one
   `is_default` role.

## Security
- No new tables. Existing RLS policies on `hr_roles` cover the new columns.
- The new columns are nullable / have safe defaults so existing rows are
  unaffected.

## Notes
- Idempotent: uses `IF NOT EXISTS` for column additions and `ON CONFLICT`
  for the seed inserts so re-running is safe.
- The seed uses the actual `services.id` values looked up by slug, so it
  works regardless of the UUIDs assigned.
*/

ALTER TABLE hr_roles
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- One default role per division
DROP INDEX IF EXISTS hr_roles_one_default_per_division;
CREATE UNIQUE INDEX hr_roles_one_default_per_division
  ON hr_roles (service_id) WHERE is_default = true AND service_id IS NOT NULL;

-- Seed default roles per division (idempotent via ON CONFLICT)
-- We match on (service_id, name) so re-running won't duplicate.
DO $$
DECLARE
  v_cf uuid;  -- clearing & forwarding
  v_ss uuid;  -- smart sort
  v_cl uuid;  -- cleaning & janitorial
  v_ps uuid;  -- private security
  v_pr uuid;  -- procurement
BEGIN
  SELECT id INTO v_cf FROM services WHERE slug = 'clearing-forwarding';
  SELECT id INTO v_ss FROM services WHERE slug = 'waste-management';
  SELECT id INTO v_cl FROM services WHERE slug = 'cleaning-janitorial';
  SELECT id INTO v_ps FROM services WHERE slug = 'private-security';
  SELECT id INTO v_pr FROM services WHERE slug = 'procurement';

  -- Clearing & Forwarding
  INSERT INTO hr_roles (service_id, name, description, is_active, display_order, is_default)
  VALUES
    (v_cf, 'Clearing Officer',    'Handles customs clearance documentation and cargo release',          true, 1, true),
    (v_cf, 'Forwarding Agent',    'Coordinates freight movement and carrier bookings',                 true, 2, false),
    (v_cf, 'Customs Broker',      'Licensed broker for customs entries and duty payments',              true, 3, false),
    (v_cf, 'Warehouse Supervisor','Manages warehouse operations and inventory',                         true, 4, false),
    (v_cf, 'Logistics Coordinator','Schedules deliveries and tracks shipments end-to-end',              true, 5, false)
  ON CONFLICT DO NOTHING;

  -- Smart Sort / Recycling
  INSERT INTO hr_roles (service_id, name, description, is_active, display_order, is_default)
  VALUES
    (v_ss, 'Sorter',               'Sorts recyclables on the picking line',                            true, 1, true),
    (v_ss, 'Recycling Operator',   'Operates baling and processing machinery',                        true, 2, false),
    (v_ss, 'Collection Driver',    'Drives collection trucks on scheduled routes',                    true, 3, false),
    (v_ss, 'Facility Supervisor',  'Oversees facility operations and staff',                          true, 4, false),
    (v_ss, 'Weighbridge Operator', 'Operates weighbridge and records tonnage',                         true, 5, false)
  ON CONFLICT DO NOTHING;

  -- Cleaning & Janitorial
  INSERT INTO hr_roles (service_id, name, description, is_active, display_order, is_default)
  VALUES
    (v_cl, 'Janitor',             'General cleaning and maintenance of facilities',                   true, 1, true),
    (v_cl, 'Cleaner',              'Performs cleaning duties across assigned areas',                   true, 2, false),
    (v_cl, 'Supervisor',           'Supervises cleaning teams and quality of work',                    true, 3, false),
    (v_cl, 'Floor Technician',     'Specialized in floor care, stripping, and waxing',                 true, 4, false),
    (v_cl, 'Restroom Attendant',   'Maintains restroom cleanliness and supplies',                     true, 5, false)
  ON CONFLICT DO NOTHING;

  -- Private Security
  INSERT INTO hr_roles (service_id, name, description, is_active, display_order, is_default)
  VALUES
    (v_ps, 'Security Guard',           'Guards premises and monitors access points',                 true, 1, true),
    (v_ps, 'Patrol Officer',           'Conducts patrols and responds to incidents',                 true, 2, false),
    (v_ps, 'Supervisor',               'Supervises security teams and shift operations',             true, 3, false),
    (v_ps, 'Control Room Operator',    'Monitors CCTV and alarm systems',                            true, 4, false),
    (v_ps, 'K9 Handler',               'Handles security dogs for patrol and detection',             true, 5, false)
  ON CONFLICT DO NOTHING;

  -- Procurement
  INSERT INTO hr_roles (service_id, name, description, is_active, display_order, is_default)
  VALUES
    (v_pr, 'Procurement Officer',  'Manages purchasing requests and vendor contracts',                true, 1, true),
    (v_pr, 'Buyer',                 'Sources and purchases goods at best value',                      true, 2, false),
    (v_pr, 'Supply Chain Analyst',  'Analyzes supply chain data and optimizes flows',                 true, 3, false),
    (v_pr, 'Warehouse Clerk',      'Manages stock receipts and dispatch records',                    true, 4, false),
    (v_pr, 'Vendor Manager',        'Maintains vendor relationships and performance reviews',        true, 5, false)
  ON CONFLICT DO NOTHING;
END $$;
