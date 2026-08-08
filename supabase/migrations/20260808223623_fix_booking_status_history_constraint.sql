-- The bookings table CHECK constraint was widened to include 'pending_review'
-- and 'approved', but booking_status_history was never updated to match.
-- When the record_booking_status_change() trigger fires on a new booking
-- with status = 'pending_review', the insert into booking_status_history
-- violates its stricter CHECK constraint.

-- Drop the old constraint and replace it with one matching the bookings table.
ALTER TABLE booking_status_history
  DROP CONSTRAINT IF EXISTS booking_status_history_status_check;

ALTER TABLE booking_status_history
  ADD CONSTRAINT booking_status_history_status_check
  CHECK (status IN ('pending', 'pending_review', 'approved', 'confirmed', 'in_progress', 'completed', 'cancelled'));
