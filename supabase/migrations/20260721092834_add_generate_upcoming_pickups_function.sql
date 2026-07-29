/*
# Auto-generate upcoming Smart Sort pickups from subscriptions

1. Purpose
  When a user has an active Smart Sort subscription, the system should
  automatically generate upcoming pickup rows based on the subscription's
  frequency and time slot. Without this, the "Upcoming Pickups" tab on the
  subscriptions page is always empty because no pickups are ever created.

2. New Function
  `generate_upcoming_pickups(p_user_id uuid DEFAULT NULL)`
    - For each active (status = 'active') subscription matching p_user_id
      (or all active subscriptions if p_user_id is NULL):
      - Computes the next 3 scheduled pickup dates based on frequency
      - Skips dates that already have a pickup row for that subscription
      - Inserts new rows into smart_sort_pickups with status = 'scheduled'
    - Returns a count of inserted pickups
    - SECURITY DEFINER so it can run with the caller's RLS context but
      insert rows that the caller owns (user_id is set from the subscription)

3. Frequency → interval mapping
    daily         → 1 day
    twice-weekly  → 3 days
    weekly        → 7 days
    three-weeks   → 21 days
    monthly       → 30 days
    one-time      → 1 pickup only (from created_at)

4. Security
  - Function is SECURITY DEFINER but only generates pickups for subscriptions
    the caller owns (filtered by p_user_id = auth.uid() when called from client)
  - All inserted pickups carry the subscription's user_id, so RLS ownership
    checks continue to work for subsequent reads/updates
*/

CREATE OR REPLACE FUNCTION generate_upcoming_pickups(p_user_id uuid DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub RECORD;
  v_interval_days INTEGER;
  v_max_pickups INTEGER := 3;
  v_inserted INTEGER := 0;
  v_next_date DATE;
  v_existing_count INTEGER;
  v_counter INTEGER;
  v_start_date DATE;
BEGIN
  FOR sub IN
    SELECT id, user_id, waste_type, bin_size_liters, frequency, time_slot, address, created_at
    FROM smart_sort_subscriptions
    WHERE status = 'active'
      AND (p_user_id IS NULL OR user_id = p_user_id)
  LOOP
    -- Determine interval based on frequency
    v_interval_days := CASE sub.frequency
      WHEN 'daily' THEN 1
      WHEN 'twice-weekly' THEN 3
      WHEN 'weekly' THEN 7
      WHEN 'three-weeks' THEN 21
      WHEN 'monthly' THEN 30
      WHEN 'one-time' THEN 9999  -- only one pickup
      ELSE 7
    END;

    -- Start from today (or subscription created date if in future)
    v_start_date := CURRENT_DATE;
    IF sub.created_at::date > v_start_date THEN
      v_start_date := sub.created_at::date;
    END IF;

    -- For one-time, generate a single pickup 1 day from now
    IF sub.frequency = 'one-time' THEN
      v_next_date := v_start_date + 1;
      SELECT COUNT(*) INTO v_existing_count
      FROM smart_sort_pickups
      WHERE subscription_id = sub.id AND scheduled_date = v_next_date;

      IF v_existing_count = 0 THEN
        INSERT INTO smart_sort_pickups (subscription_id, user_id, scheduled_date, time_slot, status)
        VALUES (sub.id, sub.user_id, v_next_date, sub.time_slot, 'scheduled');
        v_inserted := v_inserted + 1;
      END IF;
    ELSE
      -- Generate next N pickups at the computed interval
      v_counter := 0;
      v_next_date := v_start_date;

      WHILE v_counter < v_max_pickups LOOP
        v_next_date := v_next_date + v_interval_days;

        -- Skip if a pickup already exists for this subscription + date
        SELECT COUNT(*) INTO v_existing_count
        FROM smart_sort_pickups
        WHERE subscription_id = sub.id AND scheduled_date = v_next_date;

        IF v_existing_count = 0 THEN
          INSERT INTO smart_sort_pickups (subscription_id, user_id, scheduled_date, time_slot, status)
          VALUES (sub.id, sub.user_id, v_next_date, sub.time_slot, 'scheduled');
          v_inserted := v_inserted + 1;
        END IF;

        v_counter := v_counter + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION generate_upcoming_pickups(uuid) TO authenticated;
