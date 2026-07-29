/*
# Create procurement_requests table

## Summary
Adds a `procurement_requests` table to support the user-facing Procurement service flow.
Users can submit itemised procurement requests (RFQs) which are tracked as open/quoted/ordered/delivered.

## New Tables
- `procurement_requests`
  - `id` uuid PK
  - `user_id` uuid FK → auth.users, defaults to auth.uid()
  - `title` text NOT NULL — short description of the request (e.g. "Office furniture")
  - `description` text — context, special requirements, delivery address
  - `currency` text NOT NULL default 'USD' — chosen currency for pricing
  - `needed_by` date — deadline for delivery
  - `items` jsonb NOT NULL default '[]' — array of {description, qty, unit, specs}
  - `status` text NOT NULL default 'open' — open | quoted | ordered | delivered | cancelled
  - `type` text NOT NULL default 'hire' — hire | quote
  - `admin_notes` text — internal notes added by admin
  - `created_at` timestamptz default now()

## Security
- RLS enabled, owner-scoped policies for authenticated users.
- Admin can read/update all rows via a service-role bypass (no extra policy needed for now).
*/

CREATE TABLE IF NOT EXISTS procurement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  currency text NOT NULL DEFAULT 'USD',
  needed_by date,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  type text NOT NULL DEFAULT 'hire',
  admin_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE procurement_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_procurement" ON procurement_requests;
CREATE POLICY "select_own_procurement" ON procurement_requests FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_procurement" ON procurement_requests;
CREATE POLICY "insert_own_procurement" ON procurement_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_procurement" ON procurement_requests;
CREATE POLICY "update_own_procurement" ON procurement_requests FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_procurement" ON procurement_requests;
CREATE POLICY "delete_own_procurement" ON procurement_requests FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
