# Resend Email Setup

The verification Edge Function sends mail through Resend at `https://api.resend.com/emails`.

1. Create an API key in the [Resend dashboard](https://resend.com/api-keys).
1. Verify the sending domain in Resend. The current sender is `noreply@alphateknexus.com`.
1. Store the key as a Supabase Edge Function secret. Run this locally and paste the key directly into the terminal:

```bash
supabase secrets set RESEND_API_KEY=re_pqZH2H82_37je3fP3y3iqYacNt3CMCAqb
```

1. Redeploy the verification function:

```bash
supabase functions deploy send-verification-code
```

Never put `RESEND_API_KEY` in frontend code, `VITE_*` variables, committed files, or the Android bundle.
