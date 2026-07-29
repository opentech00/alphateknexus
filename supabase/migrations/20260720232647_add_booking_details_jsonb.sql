/*
# Add service-specific details column to bookings

## Why
The Clearing & Forwarding (C&F) hire form captures many specialized fields
(bill of lading number, port of loading/discharge, cargo description, container
numbers, freight mode, customs office, delivery destination, etc.) that don't
fit the generic bookings schema. Rather than adding 15+ nullable columns that
only apply to one service, we add a single JSONB `details` column that stores
service-specific payload alongside the existing common fields.

## Changes
- `bookings.details` (jsonb, nullable) — stores service-specific form data.
  For C&F it holds: shipment_type, cargo_type, bl_number, port_loading,
  port_discharge, container_numbers, freight_mode, customs_office,
  delivery_destination, cargo_description, weight, packages, declared_value,
  insurance_required, hazardous, document_checklist.

## Security
- No RLS policy changes. The column inherits the table's existing owner-scoped
  policies (select/insert/update/delete own bookings + admin override).
- No data is lost — the column is nullable with no default, so existing rows
  simply have NULL.
*/

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS details jsonb;
