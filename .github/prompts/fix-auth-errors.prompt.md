---
description: "Diagnose and fix Supabase authentication failures, including signup Edge Function transport errors"
name: "Fix Auth Errors"
argument-hint: "Describe the auth failure and affected flow, for example: signup fails with 'Failed to send a request to the Edge Function'"
agent: "agent"
---
Fix the authentication problem described below in this Vite + React + TypeScript application backed by Supabase.

Reported failure:
${input:authError:Describe the authentication error, affected flow, and reproduction steps}

Use the repository's source of truth in [AGENTS.md](../../AGENTS.md), [AuthContext.tsx](../../src/contexts/AuthContext.tsx), [RegisterPage.tsx](../../src/pages/RegisterPage.tsx), and the relevant functions under [supabase/functions](../../supabase/functions).

Workflow:
1. Reproduce or isolate the failure before editing. Trace the complete client-to-Supabase path, including the UI, auth context, Supabase client configuration, Edge Function invocation, deployed function configuration, CORS, request/response handling, and relevant database or Auth settings.
2. Inspect all related authentication flows for the same root cause: sign up/account creation, sign in, email verification, password reset/change, 2FA, session management, and admin/employee authentication where applicable. Keep fixes focused on confirmed defects; do not rewrite unrelated application architecture.
3. For a signup failure showing "Failed to send a request to the Edge Function", distinguish transport/deployment failures from an HTTP error returned by the function. Check function existence and deployment, function imports/runtime compatibility, CORS preflight and headers, Supabase URL and anon-key wiring, required server-side environment variables, and whether the client is hiding the function's response body or status.
4. Implement the smallest root-cause fix. Never expose or commit `SUPABASE_SERVICE_ROLE_KEY` or any other secret. Preserve the existing public APIs and user-facing auth behavior unless the behavior is demonstrably incorrect.
5. Improve error handling only where needed so users receive a useful actionable message while logs retain safe diagnostic details. Do not display secrets, access tokens, or sensitive account data.
6. Validate the touched path with the narrowest available check, then run `npm run build`. If deployment or Supabase credentials are required, state the exact command/configuration the developer must run without requesting or storing secrets in files. Do not modify generated Android bundles unless the source build requires regeneration.

Acceptance criteria:
- The reported auth failure is fixed at its root cause, or the remaining external deployment/configuration blocker is clearly identified.
- Signup/account creation succeeds for valid input and returns useful errors for invalid input, duplicate email, missing configuration, and unavailable Edge Functions.
- Existing sign-in, verification, password, 2FA, and session flows are not regressed.
- `npm run build` passes, or any unrelated pre-existing failure is documented with its command and output.
- The final response includes changed files, root cause, validation performed, and any required Supabase deployment or dashboard steps.
