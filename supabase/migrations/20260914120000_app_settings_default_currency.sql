-- Platform default display currency (clients may still pick their own).

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_display_currency text NOT NULL DEFAULT 'SLE';

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_default_display_currency_check;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_default_display_currency_check
  CHECK (default_display_currency IN ('SLE', 'USD', 'EUR'));
