#!/usr/bin/env bash
set -euo pipefail

# Idempotent local helper to initialize/link a Supabase cloud project and run migrations
# Usage: ./scripts/supabase-init.sh <project-ref>

PROJECT_REF=${1:-}
if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found. Install: https://supabase.com/docs/guides/cli"
  exit 1
fi

if [ -z "$PROJECT_REF" ]; then
  echo "Please pass your Supabase project ref: ./scripts/supabase-init.sh your-project-ref"
  exit 1
fi

echo "Linking to Supabase project: $PROJECT_REF"
supabase link --project-ref "$PROJECT_REF"

echo "Ensure environment variables exist locally (see .env.example)"

echo "Running migrations (if any)"
if [ -d "db/migrations" ]; then
  supabase migration status || true
  supabase db push || true
else
  echo "No migrations found in db/migrations"
fi

echo "Done. For cloud deployment, set SUPABASE_SERVICE_ROLE_KEY in your CI secrets store."
