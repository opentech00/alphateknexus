#!/usr/bin/env node
/**
 * Enables the Auth JWT hook, sets production Monime return origin, optionally
 * pushes OPENAI_API_KEY, and deploys checkout functions.
 *
 * Usage: node scripts/apply-live-platform.mjs
 * Requires .env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF (or VITE_SUPABASE_URL).
 * Never prints secret values. The CLI reads SUPABASE_ACCESS_TOKEN from env.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_ORIGIN = 'https://alphateknexus.vercel.app';
const HOOK_URI = 'pg-functions://postgres/public/custom_access_token_hook';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF.trim();
  const url = process.env.VITE_SUPABASE_URL || '';
  const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match?.[1] || '';
}

function run(args) {
  const result = spawnSync(NPX, ['supabase', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`supabase ${args[0]} failed (${result.status ?? 'spawn'})`);
  }
}

function setSecrets(ref, pairs) {
  const dir = mkdtempSync(join(tmpdir(), 'atn-secrets-'));
  const file = join(dir, 'secrets.env');
  try {
    writeFileSync(
      file,
      Object.entries(pairs).map(([key, value]) => `${key}=${value}`).join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
    run(['secrets', 'set', '--env-file', file, '--project-ref', ref]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function enableAccessTokenHook(ref, token) {
  const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      hook_custom_access_token_enabled: true,
      hook_custom_access_token_uri: HOOK_URI,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth hook enable failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const check = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (check.ok) {
    const cfg = await check.json();
    console.log(
      `Custom access token hook enabled=${Boolean(cfg.hook_custom_access_token_enabled)} uri=${cfg.hook_custom_access_token_uri || HOOK_URI}`,
    );
    return;
  }
  console.log('Custom access token hook is enabled (app_role on JWT).');
}

async function main() {
  loadEnv();
  const ref = projectRef();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref) throw new Error('Missing SUPABASE_PROJECT_REF (or VITE_SUPABASE_URL).');
  if (!token) throw new Error('Missing SUPABASE_ACCESS_TOKEN.');

  console.log(`Project ${ref}: apply JWT hook, return origin, checkout deploy.`);

  run(['link', '--project-ref', ref]);
  run(['db', 'push', '--project-ref', ref, '--yes']);

  await enableAccessTokenHook(ref, token);

  const secrets = { MONIME_RETURN_ORIGIN: PRODUCTION_ORIGIN };
  if (process.env.OPENAI_API_KEY) secrets.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  setSecrets(ref, secrets);
  console.log(`MONIME_RETURN_ORIGIN set to ${PRODUCTION_ORIGIN}.`);
  if (process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY stored as an Edge Function secret (semantic help search).');
  } else {
    console.log('OPENAI_API_KEY not in env. Keyword search stays enabled; skip secret.');
  }

  run(['functions', 'deploy', 'create-monime-checkout', '--project-ref', ref]);
  run(['functions', 'deploy', 'create-field-collection', '--project-ref', ref]);
  if (process.env.OPENAI_API_KEY) {
    run(['functions', 'deploy', 'search-knowledge', '--project-ref', ref]);
    run(['functions', 'deploy', 'process-jobs', '--project-ref', ref]);
  }

  console.log('Live platform apply finished.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
