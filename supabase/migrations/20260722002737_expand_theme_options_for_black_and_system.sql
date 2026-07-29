/*
# Expand theme options to support Light, Dark, Black, and System

## Changes
- Alters the `theme` column CHECK constraint on `user_preferences` to allow four values:
  - `light`  — bright white background (default, unchanged)
  - `dark`   — soft dark grey (slate-900 base)
  - `black`  — true OLED black background
  - `system` — follow the OS `prefers-color-scheme` media query
- The default remains `light`.

## Security
- No new tables or policies.
- RLS on `user_preferences` is unchanged (owner-scoped CRUD via auth.uid()).

## Important Notes
1. The old constraint allowed only `light` and `dark`. We drop the old constraint and add a new one with all four values.
2. Idempotent: uses `DO $$ ... IF NOT EXISTS ... END $$` to avoid duplicate constraint errors on re-run.
*/

DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'user_preferences_theme_check'
  ) THEN
    ALTER TABLE user_preferences DROP CONSTRAINT user_preferences_theme_check;
  END IF;

  -- Add the new constraint with all four theme values
  ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_theme_check
    CHECK (theme IN ('light', 'dark', 'black', 'system'));
END $$;