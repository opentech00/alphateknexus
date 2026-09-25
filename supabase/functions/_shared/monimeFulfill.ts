import { classifySessionStatus, MONIME_API_BASE, monimeHeaders } from "./monime.ts";

function purposeDescription(monimePayment: any): string {
  const kind = monimePayment.kind;
  if (monimePayment.purpose === "wallet_topup") return "Wallet top-up via Monime";
  if (monimePayment.purpose === "invoice") return "Invoice payment via Monime";
  if (monimePayment.purpose === "booking") {
    if (kind === "deposit") return "Booking deposit via Monime";
    if (kind === "balance") return "Booking balance via Monime";
    if (kind === "field") return "On-site booking payment via Monime";
    return "Booking payment via Monime";
  }
  return "Subscription payment via Monime";
}

async function creditWallet(supabase: any, monimePayment: any, paymentId: string, recordedBy: string) {
  const { data: existingTxn } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("monime_payment_id", monimePayment.id)
    .maybeSingle();
  if (existingTxn) return;

  const { data: walletTx, error: walletErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id: monimePayment.user_id,
      type: "topup",
      amount_sle: monimePayment.amount_sle,
      method: "monime",
      reference: monimePayment.reference,
      description: `Top-up via Monime (${paymentId})`,
      status: "completed",
      recorded_by: recordedBy,
      monime_payment_id: monimePayment.id,
    })
    .select("id")
    .maybeSingle();

  if (walletErr) {
    console.error("Wallet credit insert FAILED:", walletErr.message, "for payment", monimePayment.id);
  } else if (walletTx && !monimePayment.related_id) {
    await supabase.from("monime_payments").update({ related_id: walletTx.id }).eq("id", monimePayment.id);
  }
}

/** Credits the ledger once per completed Monime payment. Booking and invoice credit is atomic in SQL. */
export async function fulfillMonimePayment(
  supabase: any,
  monimePayment: any,
  paymentId: string,
  recordedBy = "monime_webhook",
) {
  if (monimePayment.purpose === "wallet_topup") {
    await creditWallet(supabase, monimePayment, paymentId, recordedBy);
    return;
  }
  const { error } = await supabase.rpc("apply_monime_ledger", { p_monime_payment_id: monimePayment.id });
  if (error) console.error("apply_monime_ledger failed:", error.message, "for payment", monimePayment.id);
}

export async function issueReceiptIfNeeded(supabase: any, monimePayment: any, paymentId: string) {
  const { data: byPayment } = await supabase
    .from("payment_receipts")
    .select("id")
    .eq("monime_payment_id", monimePayment.id)
    .maybeSingle();
  if (byPayment) return;

  const { data: byReference } = await supabase
    .from("payment_receipts")
    .select("id")
    .eq("reference", monimePayment.reference)
    .limit(1)
    .maybeSingle();
  if (byReference) {
    await supabase
      .from("payment_receipts")
      .update({ monime_payment_id: monimePayment.id, payment_id: paymentId || null })
      .eq("id", byReference.id);
    return;
  }

  const { data: receiptNum } = await supabase.rpc("generate_receipt_number");
  if (!receiptNum) {
    console.error("Failed to generate receipt number");
    return;
  }

  const { data: receipt } = await supabase
    .from("payment_receipts")
    .insert({
      user_id: monimePayment.user_id,
      monime_payment_id: monimePayment.id,
      receipt_number: receiptNum,
      reference: monimePayment.reference,
      amount_sle: monimePayment.amount_sle,
      currency: monimePayment.currency || "SLE",
      purpose: monimePayment.purpose,
      description: purposeDescription(monimePayment),
      payment_method: "monime",
      payment_id: paymentId,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (!receipt) return;

  try {
    if (Deno.env.get("RESEND_API_KEY")) {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ receiptId: receipt.id }),
      });
    }
  } catch (e) {
    console.error("Receipt email send failed:", e instanceof Error ? e.message : e);
  }
}

export type CompleteMonimeOpts = {
  recordedBy: string;
  paymentId?: string;
  payload?: unknown;
  webhookEventId?: string | null;
  providerId?: string | null;
  channel?: string | null;
};

export async function completeMonimePayment(
  supabase: any,
  monimePayment: any,
  opts: CompleteMonimeOpts,
): Promise<{ already: boolean }> {
  const paymentId = opts.paymentId || monimePayment.payment_id || "";
  const extras: Record<string, unknown> = {};
  if (opts.webhookEventId) extras.webhook_event_id = opts.webhookEventId;
  if (opts.providerId) extras.provider_id = opts.providerId;
  if (opts.channel) extras.channel = opts.channel;

  let already = monimePayment.status === "completed";

  if (already) {
    if (Object.keys(extras).length) {
      await supabase.from("monime_payments").update(extras).eq("id", monimePayment.id);
    }
  } else {
    const { data: updated, error: updErr } = await supabase
      .from("monime_payments")
      .update({
        status: "completed",
        payment_id: paymentId || monimePayment.payment_id,
        paid_at: new Date().toISOString(),
        raw_payload: opts.payload ?? monimePayment.raw_payload,
        updated_at: new Date().toISOString(),
        ...extras,
      })
      .eq("id", monimePayment.id)
      .in("status", ["pending", "failed", "cancelled"])
      .select("id")
      .maybeSingle();
    if (updErr) console.error("Failed to mark monime_payment completed:", updErr.message);
    already = !updated;
  }

  const completedRow = { ...monimePayment, status: "completed" };
  await fulfillMonimePayment(supabase, completedRow, paymentId, opts.recordedBy);
  await issueReceiptIfNeeded(supabase, completedRow, paymentId);
  await resolveUnmatchedFor(supabase, completedRow);
  return { already };
}

/** Closes inbox rows for events that later matched this payment (e.g. webhook raced checkout insert). */
export async function resolveUnmatchedFor(supabase: any, monimePayment: any) {
  const filters: string[] = [];
  if (monimePayment.checkout_session_id) filters.push(`session_id.eq.${monimePayment.checkout_session_id}`);
  if (monimePayment.reference) filters.push(`reference.eq.${monimePayment.reference}`);
  if (!filters.length) return;
  await supabase
    .from("monime_webhook_unmatched")
    .update({
      status: "resolved",
      matched_payment_id: monimePayment.id,
      resolved_at: new Date().toISOString(),
      note: "Matched automatically",
    })
    .eq("status", "open")
    .or(filters.join(","));
}

/**
 * Reads the checkout session from Monime and applies the result locally.
 * Returns our status: completed | failed | cancelled | pending.
 */
export async function refreshMonimeSession(
  supabase: any,
  monimePayment: any,
  recordedBy: string,
): Promise<{ status: string; error?: string }> {
  if (monimePayment.status === "completed") {
    await completeMonimePayment(supabase, monimePayment, { recordedBy, paymentId: monimePayment.payment_id || "" });
    return { status: "completed" };
  }

  const monimeKey = Deno.env.get("MONIME_ACCESS_KEY");
  const spaceId = Deno.env.get("MONIME_SPACE_ID");
  if (!monimeKey || !spaceId) return { status: monimePayment.status, error: "Monime not configured" };
  if (!monimePayment.checkout_session_id) return { status: monimePayment.status };

  const res = await fetch(`${MONIME_API_BASE}/checkout-sessions/${monimePayment.checkout_session_id}`, {
    method: "GET",
    headers: monimeHeaders(monimeKey, spaceId),
  });
  if (!res.ok) {
    return { status: monimePayment.status, error: `Monime API error: ${res.status}` };
  }

  const session = await res.json();
  const result = session.result || session;
  const kind = classifySessionStatus(result.status || result.paymentStatus || "");
  const paymentId: string = result.paymentId || result.payment_id || result.id || "";

  if (kind === "completed") {
    await completeMonimePayment(supabase, monimePayment, { recordedBy, paymentId, payload: session });
    return { status: "completed" };
  }

  if ((kind === "failed" || kind === "cancelled") && monimePayment.status === "pending") {
    await supabase
      .from("monime_payments")
      .update({ status: kind, raw_payload: session, updated_at: new Date().toISOString() })
      .eq("id", monimePayment.id)
      .eq("status", "pending");
    return { status: kind };
  }

  return { status: kind === "pending" ? monimePayment.status : kind };
}
