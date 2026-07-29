/*
# Add signature column to field_assignments

## Changes
- Adds `customer_signature` (text) column to `field_assignments` to store
  base64 data-URL signature captured on the worker's phone at job completion.
- Adds `signature_captured_at` (timestamptz) to record when the signature was taken.

## Security
- No new tables. Existing RLS policies on field_assignments cover the new columns.
*/

ALTER TABLE field_assignments
  ADD COLUMN IF NOT EXISTS customer_signature text,
  ADD COLUMN IF NOT EXISTS signature_captured_at timestamptz;
