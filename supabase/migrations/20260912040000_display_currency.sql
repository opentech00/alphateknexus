ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS display_currency text;

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_display_currency_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_display_currency_check
  CHECK (display_currency IS NULL OR display_currency IN ('SLE', 'USD', 'EUR'));
