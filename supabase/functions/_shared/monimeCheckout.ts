import { MONIME_API_BASE, monimeHeaders, sha256Hex } from "./monime.ts";
import { refreshMonimeSession } from "./monimeFulfill.ts";

export class CheckoutError extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export type PaymentKind = "full" | "deposit" | "balance" | "field";

export const MIN_ONLINE_SLE = 1;
export const WALLET_MIN_SLE = 5;

export function maxOnlineSle(): number {
  const raw = Number(Deno.env.get("MONIME_MAX_SLE") || "10000");
  return Number.isFinite(raw) && raw > 0 ? raw : 10000;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mirrors SQL booking_total_sle and src/lib/bookingPay.ts. */
export function bookingTotalSle(details: Record<string, unknown> | null | undefined): number | null {
  const d = details || {};
  return toNumber(d.quoted_total_sle) ?? toNumber(d.total_sle) ?? toNumber(d.price_sle) ?? toNumber(d.amount_sle);
}

export type BookingAmountPlan = {
  amountSle: number;
  kind: PaymentKind;
  totalSle: number;
  paidSle: number;
  dueSle: number;
  depositSle: number | null;
};

export function planBookingAmount(
  booking: { details: Record<string, unknown> | null; amount_paid_sle: number | null; payment_status: string | null },
  mode: "full" | "deposit" = "full",
  field = false,
): BookingAmountPlan {
  const total = bookingTotalSle(booking.details);
  if (!total) throw new CheckoutError("This booking does not have a price yet.");
  const paid = round2(Number(booking.amount_paid_sle || 0));
  const due = round2(Math.max(0, total - paid));
  if (["paid", "verified"].includes(booking.payment_status || "") || due <= 0) {
    throw new CheckoutError("This booking is already paid.");
  }
  const deposit = toNumber((booking.details || {}).deposit_sle);
  const depositAllowed = !field && mode === "deposit" && deposit !== null && paid === 0 && deposit < total;
  const amount = depositAllowed ? round2(deposit as number) : due;
  const kind: PaymentKind = field ? "field" : depositAllowed ? "deposit" : paid > 0 ? "balance" : "full";
  return { amountSle: amount, kind, totalSle: total, paidSle: paid, dueSle: due, depositSle: deposit };
}

export function assertOnlineAmount(amountSle: number, purpose: string) {
  const max = maxOnlineSle();
  const min = purpose === "wallet_topup" ? WALLET_MIN_SLE : MIN_ONLINE_SLE;
  if (!Number.isFinite(amountSle) || amountSle < min) {
    throw new CheckoutError(
      purpose === "wallet_topup" ? `Minimum top-up is SLE ${min.toFixed(2)}` : `Minimum online payment is SLE ${min.toFixed(2)}`,
    );
  }
  if (amountSle > max) {
    throw new CheckoutError(
      purpose === "wallet_topup"
        ? `Maximum top-up is SLE ${max.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
        : `SLE ${amountSle.toLocaleString("en-US")} is above the online limit of SLE ${max.toLocaleString("en-US")}. Pay by wallet or bank transfer, or contact finance.`,
    );
  }
}

type SessionOpts = {
  ownerId: string;
  purpose: "wallet_topup" | "invoice" | "booking";
  relatedId: string | null;
  amountSle: number;
  kind: PaymentKind;
  initiatedBy?: string | null;
  appOrigin: string;
  returnPage: "payment-return" | "field-paid";
  referenceBase?: string | null;
  customerPhone?: string | null;
  label?: string;
};

export type SessionResult = {
  checkoutUrl: string;
  sessionId: string;
  reference: string;
  amountSle: number;
  kind: PaymentKind;
  reused: boolean;
};

const PAYMENT_OPTIONS = {
  card: { disable: false },
  // Official MoMo enum is m17 (Orange) and m18 (AfriMoney). Passing m13 (QMoney)
  // makes CreateCheckoutSession return 400. disable:false shows every MoMo Monime enables.
  momo: { disable: false },
  bank: { disable: false },
};

const PURPOSE_CODE: Record<string, string> = { wallet_topup: "WAL", invoice: "INV", booking: "BK" };

function monimeErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    const fromList = Array.isArray(parsed?.messages)
      ? parsed.messages.map((m: unknown) => (typeof m === "string" ? m : (m as { message?: string })?.message)).filter(Boolean).join("; ")
      : "";
    const nested = parsed?.error?.message || parsed?.error?.code || parsed?.message;
    const detail = fromList || (typeof nested === "string" ? nested : "");
    if (detail) return `Monime API error: ${status}. ${detail}`;
  } catch {
    /* raw body */
  }
  const trimmed = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return trimmed ? `Monime API error: ${status}. ${trimmed}` : `Monime API error: ${status}`;
}

function sameTuple(query: any, opts: SessionOpts) {
  let q = query
    .eq("user_id", opts.ownerId)
    .eq("purpose", opts.purpose)
    .eq("amount_sle", opts.amountSle)
    .eq("kind", opts.kind);
  q = opts.relatedId ? q.eq("related_id", opts.relatedId) : q.is("related_id", null);
  return q;
}

/**
 * Reuses a live pending session for the same payment, otherwise opens a new attempt.
 * Each attempt has its own Idempotency-Key and reference, so an expired or cancelled
 * session never blocks paying again.
 */
export async function createCheckoutSession(supabase: any, opts: SessionOpts): Promise<SessionResult> {
  const amountSle = round2(opts.amountSle);
  const tuple = { ...opts, amountSle };

  const { data: pendingRows } = await sameTuple(
    supabase
      .from("monime_payments")
      .select("*")
      .eq("status", "pending")
      .not("checkout_url", "is", null)
      .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1),
    tuple,
  );
  const pending = pendingRows?.[0];
  if (pending) {
    const refreshed = await refreshMonimeSession(supabase, pending, "monime_verify");
    if (refreshed.status === "completed") {
      throw new CheckoutError("Already paid", 400, { reference: pending.reference });
    }
    if (refreshed.status === "pending") {
      return {
        checkoutUrl: pending.checkout_url,
        sessionId: pending.checkout_session_id,
        reference: pending.reference,
        amountSle,
        kind: opts.kind,
        reused: true,
      };
    }
  }

  const monimeKey = Deno.env.get("MONIME_ACCESS_KEY");
  const spaceId = Deno.env.get("MONIME_SPACE_ID");
  if (!monimeKey || !spaceId) {
    throw new CheckoutError("Monime not configured. Set MONIME_ACCESS_KEY and MONIME_SPACE_ID secrets.", 500);
  }

  const { count } = await sameTuple(
    supabase.from("monime_payments").select("id", { count: "exact", head: true }),
    tuple,
  );
  const attempt = count || 0;
  const amountCents = Math.round(amountSle * 100);
  const idempotencyKey = await sha256Hex(
    `${opts.ownerId}|${opts.purpose}|${opts.relatedId || ""}|${amountCents}|${opts.kind}|${attempt}`,
  );
  const suffix = idempotencyKey.slice(0, 8).toUpperCase();
  const base = (opts.referenceBase || `ATN-${PURPOSE_CODE[opts.purpose] || "PAY"}`).slice(0, 40);
  const reference = `${base}-${suffix}`;
  const returnOrigin = (Deno.env.get("MONIME_RETURN_ORIGIN") || opts.appOrigin).replace(/\/$/, "");
  const returnBase = `${returnOrigin}/?page=${opts.returnPage}&ref=${encodeURIComponent(reference)}`;
  const successUrl = `${returnBase}&status=success`.slice(0, 255);
  const cancelUrl = `${returnBase}&status=cancel`.slice(0, 255);
  const label = (opts.label || `${opts.purpose.replace("_", " ")} payment`).slice(0, 100);

  const monimeRes = await fetch(`${MONIME_API_BASE}/checkout-sessions`, {
    method: "POST",
    headers: monimeHeaders(monimeKey, spaceId, { "Idempotency-Key": idempotencyKey }),
    body: JSON.stringify({
      name: "Alphatek Nexus Payment",
      description: reference.slice(0, 1000),
      lineItems: [{
        name: reference.slice(0, 100),
        price: { currency: "SLE", value: amountCents },
        type: "custom",
        quantity: 1,
        reference: reference.slice(0, 100),
        description: label,
      }],
      successUrl,
      cancelUrl,
      reference: reference.slice(0, 255),
      paymentOptions: PAYMENT_OPTIONS,
      metadata: {
        user_id: opts.ownerId,
        purpose: opts.purpose,
        related_id: (opts.relatedId || "").slice(0, 100),
        kind: opts.kind,
        ...(opts.initiatedBy ? { initiated_by: opts.initiatedBy } : {}),
        ...(opts.customerPhone ? { customer_phone: opts.customerPhone.slice(0, 100) } : {}),
      },
    }),
  });

  if (!monimeRes.ok) {
    const details = await monimeRes.text();
    throw new CheckoutError(monimeErrorMessage(monimeRes.status, details), monimeRes.status >= 500 ? 502 : 400, { details });
  }

  const session = await monimeRes.json();
  const result = session.result || session;
  const checkoutUrl = result.redirectUrl || result.checkoutUrl || result.url;
  const sessionId = result.id || result.sessionId || result.checkoutSessionId;
  if (!checkoutUrl || !sessionId) {
    throw new CheckoutError("Invalid Monime response", 502, { details: JSON.stringify(session) });
  }

  const { error: insertErr } = await supabase.from("monime_payments").insert({
    user_id: opts.ownerId,
    checkout_session_id: sessionId,
    reference,
    amount_sle: amountSle,
    status: "pending",
    purpose: opts.purpose,
    related_id: opts.relatedId,
    checkout_url: checkoutUrl,
    kind: opts.kind,
    initiated_by: opts.initiatedBy || null,
    attempt,
  });

  if (insertErr) {
    const { data: existing } = await supabase
      .from("monime_payments")
      .select("checkout_url, checkout_session_id, reference, status")
      .eq("checkout_session_id", sessionId)
      .maybeSingle();
    if (existing?.status === "completed") {
      throw new CheckoutError("Already paid", 400, { reference: existing.reference });
    }
    if (existing?.checkout_url) {
      return {
        checkoutUrl: existing.checkout_url,
        sessionId: existing.checkout_session_id,
        reference: existing.reference,
        amountSle,
        kind: opts.kind,
        reused: true,
      };
    }
    console.error("Failed to insert monime_payment:", insertErr.message);
    throw new CheckoutError("Failed to create payment record", 500);
  }

  return { checkoutUrl, sessionId, reference, amountSle, kind: opts.kind, reused: false };
}
