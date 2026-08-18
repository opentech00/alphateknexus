# Supabase + GitHub Actions: Secrets and CI setup

This guide shows which GitHub Actions secrets to create for a Supabase cloud project and provides a minimal workflow that runs DB migrations and builds the app.

Required repository secrets (add via Settings → Secrets → Actions):

- `VITE_SUPABASE_URL` — Your Supabase project URL (e.g. https://xyz.supabase.co). Safe to use in builds but keep in secrets for consistency.
- `VITE_SUPABASE_ANON_KEY` — Public anon key for client builds. This key is intended to be public-facing but storing it in secrets avoids accidental leakage in logs.
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (highly privileged). NEVER expose to client-side code. Use only for server-side jobs and migrations that require elevated privileges.
- `SUPABASE_ACCESS_TOKEN` — Personal or machine token used by the `supabase` CLI in CI to authenticate (used with `supabase login --token`). Do not commit this token.
- `SUPABASE_PROJECT_REF` — The project ref/id (short string shown in Supabase dashboard). Used when linking or running `supabase` CLI commands.

Notes on secrets:

- Treat `SUPABASE_SERVICE_ROLE_KEY` like a password; store it only as a GitHub Actions secret and restrict repository access.
- `VITE_` prefixed env vars are embedded at build-time for Vite; ensure you do not accidentally expose `SUPABASE_SERVICE_ROLE_KEY` to a frontend build.

How to add a secret in GitHub UI:

1. Open your repository on github.com.
2. Go to `Settings` → `Secrets and variables` → `Actions` → `New repository secret`.
3. Add the name (e.g. `SUPABASE_ACCESS_TOKEN`) and paste the secret value.

Example GitHub Actions workflow (minimal):

Create a file `.github/workflows/ci.yml` with this content (example):

```yaml
name: CI

on:
  push:
    branches: [ main ]

jobs:
  migrate-and-build:
    runs-on: ubuntu-latest
    env:
      VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
      VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Supabase CLI
        run: npm install -g supabase

      - name: Authenticate supabase CLI
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        run: supabase login --token "$SUPABASE_ACCESS_TOKEN"

      - name: Link project
        run: supabase link --project-ref "${{ secrets.SUPABASE_PROJECT_REF }}"

      - name: Run migrations (db push)
        env:
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          # Use db push to apply migrations in db/migrations
          supabase db push --project-ref "${{ secrets.SUPABASE_PROJECT_REF }}"

      - name: Build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: npm run build
```

Security best-practices:

- Never echo secrets to logs. GitHub masks secrets, but avoid printing them.
- Use the least-privilege token possible for CI. Prefer a machine account scoped only to required actions.
- Rotate `SUPABASE_SERVICE_ROLE_KEY` periodically and when access changes.
- Restrict who can modify repository secrets in GitHub Organization settings.

If you want, I can:

- Add the `.github/workflows/ci.yml` file to this repo (requires your confirmation).
- Create a short `README` snippet in `docs/` that documents how developers should populate their local `.env` from Secrets.
