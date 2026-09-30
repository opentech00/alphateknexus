-- Grants required for Dashboard/Management API to invoke custom_access_token_hook.
-- Enable the hook itself in Authentication → Hooks (or scripts/apply-live-platform.mjs).

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
  GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
  GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Auth admin read profiles for JWT hook" ON public.profiles;
  CREATE POLICY "Auth admin read profiles for JWT hook"
    ON public.profiles
    FOR SELECT
    TO supabase_auth_admin
    USING (true);
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
