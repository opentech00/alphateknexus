/*
  Remove duplicate employee portal activities and prevent re-creation.

  Root cause:
  - role_activities initially had UNIQUE(role_id, activity_key)
  - rows with role_id = NULL (service/global rows) bypass that uniqueness
  - repeated inserts created duplicates for the same activity key
*/

-- Keep one row per logical scope + activity key (latest update wins).
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY role_id, service_id, activity_key
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM role_activities
)
DELETE FROM role_activities r
USING ranked x
WHERE r.id = x.id
  AND x.rn > 1;

-- Replace legacy uniqueness with null-safe partial unique indexes.
ALTER TABLE role_activities
  DROP CONSTRAINT IF EXISTS role_activities_role_id_activity_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS role_activities_role_key_unique
  ON role_activities(role_id, activity_key)
  WHERE role_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS role_activities_service_key_unique
  ON role_activities(service_id, activity_key)
  WHERE role_id IS NULL AND service_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS role_activities_global_key_unique
  ON role_activities(activity_key)
  WHERE role_id IS NULL AND service_id IS NULL;
