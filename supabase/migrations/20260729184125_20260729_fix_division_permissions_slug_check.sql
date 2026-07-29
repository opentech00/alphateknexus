/*
# Fix division_permissions CHECK constraint for Smart Sort slug

## Purpose
The Smart Sort division uses slug 'waste-management' in the frontend config (SmartSortPage.tsx).
The original CHECK constraint only allowed 'smart-sort'. This adds 'waste-management'
as an accepted value so the permissions tab works for Smart Sort.

## Changes
- Drop and recreate the CHECK constraint on division_permissions.division_slug
  to include both 'smart-sort' and 'waste-management'
*/

ALTER TABLE division_permissions DROP CONSTRAINT IF EXISTS division_permissions_division_slug_check;
ALTER TABLE division_permissions ADD CONSTRAINT division_permissions_division_slug_check
  CHECK (division_slug IN ('clearing-forwarding','smart-sort','waste-management','cleaning-services','private-security','procurement'));
