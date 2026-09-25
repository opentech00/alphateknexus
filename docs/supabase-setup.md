# Supabase Local Setup (Quickstart)

This document explains how to set up Supabase for local development and link to the cloud project.

Prerequisites

- Node.js 24.x and `npm` installed
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

If you need automation guidance, keep `SUPABASE_ACCESS_TOKEN` in your local `.env` (never commit it) and use `supabase login --token "$SUPABASE_ACCESS_TOKEN"`.


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
- Production is Vercel. Set `VITE_*` build variables there as described in `docs/vercel-production.md`.
- Use `SUPABASE_SERVICE_ROLE_KEY` only on your machine or in Supabase itself. Do not add it to Vercel or client code.

Monime.io (primary client payment: bookings, invoices, wallet top-up)

Set these as **Supabase Edge Function secrets** (Dashboard → Edge Functions → Secrets), never as Vite/`VITE_*` variables and never on Vercel:

- `MONIME_ACCESS_KEY` — API bearer token
- `MONIME_SPACE_ID` — `Monime-Space-Id` header
- `MONIME_WEBHOOK_SECRET` — HMAC secret for inbound webhooks (required; the webhook fails closed if missing)

Pin requests to API version `caph.2025-08-23` (`Monime-Version` header). Checkout sessions enable Orange Money (`m17`), AfriMoney (`m18`), QMoney (`m13`), cards, and Sierra Leone banks in the hosted UI.

In the Monime dashboard, register:

```
https://<your-project-ref>.supabase.co/functions/v1/monime-webhook
```

Subscribe that URL to:

- `checkout_session.completed`
- `checkout_session.expired`
- `checkout_session.cancelled`

Webhooks are the source of truth. `verify-monime-payment` is a backup when the client returns from checkout before the webhook arrives. The browser must never write `payment_status: paid`.

How amounts and crediting work:

- **Amounts are set by the server.** For bookings and invoices, `create-monime-checkout` charges the balance due from the ledger (booking `details` total minus `bookings.amount_paid_sle`; invoice total minus amount paid). The client amount is only used for wallet top-ups (SLE 5 minimum). Optional secret `MONIME_MAX_SLE` caps a single online payment (default 10,000).
- **Crediting is atomic.** `apply_monime_ledger(monime_payment_id)` credits a booking or invoice exactly once, supports partial payments, and sets booking `payment_status` to `deposit_paid` or `paid`.
- **Paying again.** Each attempt gets its own Monime idempotency key and reference, so a cancelled or expired session never blocks a new one. A live pending session for the same payment is reused.
- **Quote deposits.** Staff can set a deposit when pricing a quote (`set_quote_deposit`). The client chooses deposit or full in checkout; the balance is paid later by Monime, wallet, cash, or field collection.
- **Field collection.** `create-field-collection` lets the assigned crew show a Monime QR for the booking balance. The payment is credited to the client's booking by the same webhook.
- **Unmatched webhooks.** Signed events that match no local payment are stored in `monime_webhook_unmatched` and shown in Finance → Mobile Money. Completed ones also notify admins.

After changing checkout, verify, webhook, or fulfillment:

```bash
supabase db push --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy create-monime-checkout
supabase functions deploy verify-monime-payment
supabase functions deploy monime-webhook
supabase functions deploy create-field-collection
supabase functions deploy process-monime-payout
```

WhatsApp Cloud API (optional, not used at signup)

Client sign-up collects a unique E.164 phone and verifies **email** (Resend). WhatsApp OTP is not sent on create-account.

Phone change on the account page can still use WhatsApp if these Edge Function secrets are set (never `VITE_*`, never Vercel):

- `WHATSAPP_TOKEN` — Meta Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID` — sending phone number ID from the Meta developer app
- `WHATSAPP_TEMPLATE_NAME` — approved Authentication template name
- `WHATSAPP_TEMPLATE_LANG` — template language code (for example `en`)
- `PHONE_OTP_PEPPER` — long random string used to hash OTP codes at rest
- Optional: `WHATSAPP_TEMPLATE_BUTTON=0` if the template has a body parameter only (no copy-code / URL button)

Approve a template similar to: “Your {{1}} AlphaTek Nexus code. It expires in 10 minutes. Do not share it.”

Signup is not blocked if Meta is unconfigured. **Require WhatsApp phone verification** in Portal Settings defaults off.

After changing these functions:

```bash
supabase db push --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy create-account
supabase functions deploy send-whatsapp-otp
supabase functions deploy verify-whatsapp-otp
supabase functions deploy change-phone-otp
```

Optional: Running Supabase locally

Supabase provides a local emulator for some workflows; consult Supabase docs if you prefer a fully local stack.

If you'd like, I can also add a shortened `CONTRIBUTING` section to `README.md` that points to this file. Reply "yes" to add it.
