# AGENTS

This repo is a Vite + React + TypeScript application with Supabase-backed auth/data and optional Capacitor Android packaging. Production is hosted on Vercel. Use the project docs in this repo as the source of truth before making changes.

## Primary references

- [README.md](README.md)
- [docs/vercel-production.md](docs/vercel-production.md)
- [docs/supabase-setup.md](docs/supabase-setup.md)
- [setup-supabase.agent.md](setup-supabase.agent.md)

## Local development and verification

- Install dependencies with `npm install`.
- Build the app with `npm run build`.
- The frontend expects `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time. Maps also need `VITE_MAPBOX_ACCESS_TOKEN`.
- Keep Node aligned with Vercel: Node 24.

## Production (Vercel)

Vercel runs `npm run build` and serves `dist/`. Set these in the Vercel project environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_ACCESS_TOKEN`

Do not put `SUPABASE_SERVICE_ROLE_KEY` in Vercel or any frontend bundle.

Pretty URLs (`/admin`, `/employee`, `/field`) are configured in `vercel.json`.

## Database and edge functions

Apply migrations and deploy functions with the Supabase CLI, not Vercel:

```bash
supabase db push --project-ref "$SUPABASE_PROJECT_REF"
```

## Repo-specific conventions

- Keep build-time env var names consistent with Vite (`VITE_*`).
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to client code.
- Prefer minimal, targeted edits.

## Good default commands

```bash
npm ci
npm run build
```
