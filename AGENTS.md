# AGENTS

This repo is a Vite + React + TypeScript application with Supabase-backed auth/data and optional Capacitor Android packaging. Use the project docs and automation paths in this repo as the source of truth before making changes.

## Primary references

- [README.md](README.md)
- [.github/workflows/ci.yml](.github/workflows/ci.yml)
- [docs/supabase-github-actions.md](docs/supabase-github-actions.md)
- [setup-supabase.agent.md](setup-supabase.agent.md)

## Local development and verification

- Install dependencies with `npm install`.
- Build the app with `npm run build`.
- The frontend expects `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to be defined at build time.
- Keep Node aligned with the CI version used by GitHub Actions: Node 18.

## CI expectations and common failure points

The GitHub Actions workflow runs these steps in order:

1. `npm ci`
2. install Supabase CLI
3. `supabase login --token "$SUPABASE_ACCESS_TOKEN"`
4. `supabase link --project-ref "${{ secrets.SUPABASE_PROJECT_REF }}"`
5. `supabase db push --project-ref "${{ secrets.SUPABASE_PROJECT_REF }}"`
6. `npm run build`

When CI fails, check for these issues first:

- missing or stale GitHub Actions secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`
- Node version mismatch or package lock drift after changing dependencies
- newer build errors caused by TypeScript or Vite configuration changes
- Supabase authentication or project-link failures before migrations run
- environment variables being referenced in code without being present in the build environment

## Repo-specific conventions

- Use `npm ci` in automation; do not switch to `npm install` in CI unless intentionally changing the workflow.
- Keep build-time env vars names consistent with Vite conventions (`VITE_*`).
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to client code or frontend bundles.
- Treat the Supabase workflow docs as the authoritative setup for CI and repository secrets.
- Prefer minimal, targeted edits. Do not rework the app architecture just to satisfy CI unless the failing build clearly shows a project-level issue.

## When fixing CI problems

- Trace the failing job step by step instead of guessing.
- Reproduce locally with the same commands used by CI where possible.
- Validate with the smallest relevant command before broad cleanup.
- Only adjust workflow files, environment setup, or project config when the failure is clearly caused by those layers.

## Good default commands

```bash
npm ci
npm run build
```

If a Supabase-related CI step is failing, verify the secret names and the project ref in GitHub before changing app code.
