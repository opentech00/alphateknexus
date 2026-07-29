/*
# Add waste_kg to smart_sort_pickups for impact tracking

1. Purpose
  Support the Impact & Sustainability Analytics feature by recording the actual
  weight of waste collected per pickup. This enables per-client and aggregate
  reporting on waste diverted from landfill, CO2 emissions saved, and recycling
  rates by waste type.

2. Changes
  - Add `waste_kg` (numeric, nullable) to `smart_sort_pickups`.
    Nullable because it's recorded by the driver/admin on completion, not at
    scheduling time. A null value means the pickup hasn't been weighed yet.
  - Add `diverted_kg` (numeric, nullable) to `smart_sort_pickups`.
    The portion of waste diverted from landfill (recycled/composted/reused).
    Recorded alongside waste_kg. If null, the app estimates diversion from the
    waste type using standard diversion rates.

  No RLS or policy changes — the columns inherit the existing pickup policies.

3. Notes
  - Diversion rates by waste type (used as fallback when diverted_kg is null):
      recyclables: 100%, organic: 100%, ewaste: 100%,
      construction: 80%, bulk: 60%, general: 0%.
  - CO2 savings factors (kg CO2e saved per kg diverted):
      recyclables: 2.5, organic: 0.5, ewaste: 15.0,
      construction: 0.8, bulk: 1.0, general: 0.0.
  - These constants live in the application code, not the database, so they
    can be tuned without a migration.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'smart_sort_pickups' AND column_name = 'waste_kg'
  ) THEN
    ALTER TABLE smart_sort_pickups ADD COLUMN waste_kg numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'smart_sort_pickups' AND column_name = 'diverted_kg'
  ) THEN
    ALTER TABLE smart_sort_pickups ADD COLUMN diverted_kg numeric(10,2);
  END IF;
END $$;
