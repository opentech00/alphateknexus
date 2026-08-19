# Supabase Local Setup (Quickstart)

This document explains how to set up Supabase for local development and link to the Supabase cloud project used by CI.

Prerequisites

- Node.js 18+ and `npm` installed
- Supabase CLI: https://supabase.com/docs/guides/cli

Steps

1. Copy environment variables

```bash
cp .env.example .env
# Then open .env and replace placeholder values with real ones from the Supabase project
```

2. Populate `.env` (developer guidance)

- `VITE_SUPABASE_URL` — the project URL from Supabase dashboard (e.g. https://xyz.supabase.co)
- `VITE_SUPABASE_ANON_KEY` — the anon/public key for client-side builds
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-only, do NOT add to frontend code)

3. Link the repo to your Supabase cloud project and run migrations

Replace `your-project-ref` with the project ref shown in the Supabase dashboard.

```bash
# login to supabase CLI (it will open a browser flow or you can use a token)
supabase login

## CLI personal access token and validation

This project uses the `supabase` CLI for migrations and automation. For non-interactive CI and local automation you need a personal CLI token (not the service role key).

Steps to create and validate a CLI token:

1. In the Supabase dashboard, go to your account settings and create a new Personal Access Token.
2. Tokens for the CLI start with `sbp_` — do NOT use `sb_secret_` or the anon key for CLI auth.
3. Copy the token and set it to `SUPABASE_ACCESS_TOKEN` in your local `.env` (do NOT commit the `.env` file).

Use the included validation script to check your token locally without printing it:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\validate-supabase-token.ps1
```

The script will return a non-zero exit code if the token is missing, malformed, or rejected by the CLI.

If you need CI guidance, add the token to your repository secrets as `SUPABASE_ACCESS_TOKEN` and the GitHub workflow will use it for `supabase login --token "$SUPABASE_ACCESS_TOKEN"`.


# link this workspace to the cloud project
./scripts/supabase-init.sh your-project-ref

# The repository includes a default project ref. To use it, omit the arg or set SUPABASE_PROJECT_REF in your shell.
# Example: ./scripts/supabase-init.sh

# or manually:
supabase link --project-ref your-project-ref
supabase db push --project-ref your-project-ref
```

4. Run the app locally

```bash
npm ci
npm run dev
```

Notes & best practices

- Never commit real secrets. Keep `.env` in `.gitignore` (this repo already uses `.env.example`).
- For CI, add secrets in GitHub repository Settings → Secrets → Actions as described in `docs/supabase-github-actions.md`.
- Use `SUPABASE_SERVICE_ROLE_KEY` only in server/CI contexts. Do not reference it from client code.

Optional: Running Supabase locally

Supabase provides a local emulator for some workflows; consult Supabase docs if you prefer a fully local stack.

If you'd like, I can also add a shortened `CONTRIBUTING` section to `README.md` that points to this file. Reply "yes" to add it.
