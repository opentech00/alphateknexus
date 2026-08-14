-- Composite index for the most common bookings query:
-- WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
-- This eliminates a full table scan + sort for every page load.
CREATE INDEX IF NOT EXISTS idx_bookings_user_deleted_created
  ON bookings (user_id, deleted_at, created_at DESC);

-- Index for filtering by status (used by "Active" tab filter)
CREATE INDEX IF NOT EXISTS idx_bookings_user_status
  ON bookings (user_id, status)
  WHERE deleted_at IS NULL;
