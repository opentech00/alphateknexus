# Vercel production

This app is a Vite MPA. **Vercel** builds and hosts production. Database migrations and edge functions stay on Supabase and are applied with the CLI, not from Vercel.

## Project settings

Vercel should use:

- Framework: Vite (auto-detected)
- Build command: `npm run build`
- Output directory: `dist`
- Node.js: 18.x

Pretty URLs are defined in `vercel.json`: `/admin`, `/employee`, and `/field` serve the matching HTML entry points.

## Environment variables

Set these in the Vercel project (**Settings → Environment Variables**), for Production (and Preview if you use it):

| Name | Purpose |
|------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox public token (`pk.`) for maps |

`VITE_*` values are baked into the client bundle at build time. After changing them, trigger a new deploy.

**Do not** add `SUPABASE_SERVICE_ROLE_KEY` (or any other server secret) to Vercel. This frontend must never ship the service role key.

Mapbox geocoding/directions use the `MAPBOX_ACCESS_TOKEN` **Supabase Edge Function secret**, not a Vercel variable.

## Database migrations

Apply schema changes locally (or from any trusted machine), not from Vercel:

```bash
supabase login
supabase link --project-ref your_project_ref
supabase db push --project-ref your_project_ref
```

Edge functions are deployed the same way, for example:

```bash
supabase functions deploy address-search --project-ref your_project_ref
```

## Local verification

```bash
npm ci
npm run build
```
