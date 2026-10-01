# Finance ops playbook

Monime has no refunds API. Credits go to the client wallet through `issue_wallet_credit` (Finance → Wallet, refund or adjustment). Every credit stores who issued it, why, and an optional idempotency key.

## Unmatched webhooks (`monime_webhook_unmatched`)

- **Who:** Finance staff with ledger permission.
- **Cadence:** Open Finance → Mobile Money at the start of the day. Daily recon lists leftover open events. The job queue retries known pending references.
- **Match:** Enter the local `monime_payments.reference`, then Match & verify. Verify / webhook still own `paid`. The browser never writes paid.
- **Dismiss:** Only with a written reason (test event, duplicate, already credited).

## Payout callbacks

- **Who:** Finance with payout permission. A second admin sends after approval.
- **Cadence:** Review Sent and Failed each morning against recon.
- **Failed with a Monime payout id:** Refresh status. If Monime paid the customer, mark delivered. If Monime failed, mark failed.
- **Do not** retry a send that already has a payout id.

## Pay again

Pay again / Retry payment creates a **new** checkout session and a **new** `monime_payments` row (new idempotency key). The previous failed or cancelled row stays failed. `apply_monime_ledger` credits a completed row once (`ledger_applied_at`). A retry cannot double a completed payment.

## Daily recon

`run_finance_recon` (00:25 UTC, also Finance → Recon) compares Monime settled vs wallet / invoice / booking Monime credits for that UTC day. A non-zero gap means an unmatched completed webhook or a delayed ledger apply.
