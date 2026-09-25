export const MONIME_API_VERSION = "caph.2025-08-23";
export const MONIME_API_BASE = "https://api.monime.io/v1";

export function monimeHeaders(accessKey: string, spaceId: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${accessKey}`,
    "Monime-Space-Id": spaceId,
    "Monime-Version": MONIME_API_VERSION,
    "Content-Type": "application/json",
    ...extra,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function timingEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizeSignature(signature: string): string {
  return signature.trim().replace(/^sha256=/i, "").replace(/["'\s]/g, "");
}

/** HMAC-SHA256 over the raw webhook body. Accepts hex or `sha256=<hex>`, plus base64. */
export async function verifyMonimeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const bytes = new Uint8Array(sig);
    const hex = bytesToHex(bytes);
    const b64 = bytesToB64(bytes);
    const provided = normalizeSignature(signature);
    const providedLower = provided.toLowerCase();
    return timingEqual(hex, providedLower) || timingEqual(hex.toUpperCase(), provided) || timingEqual(b64, provided);
  } catch {
    return false;
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export function canonEventName(raw: unknown): string {
  return String(raw ?? "").toLowerCase().replace(/[-.]/g, "_");
}

export function extractCaphEvent(event: any): {
  eventId: string;
  eventName: string;
  data: any;
  sessionId: string;
  reference: string;
  relatedId: string;
  paymentId: string;
  status: string;
  providerId: string | null;
  channel: string | null;
} {
  const nested = event?.event && typeof event.event === "object" ? event.event : event;
  const eventId = String(nested?.id || event?.id || "").trim();
  const eventName = canonEventName(nested?.name || event?.name || event?.type || event?.eventType || nested?.type);
  const data = event?.data || nested?.data || event?.object || nested?.object || event;
  const sessionId = String(
    data?.checkoutSessionId || data?.checkout_session_id || data?.sessionId || data?.id || "",
  ).trim();
  const metadata = data?.metadata || {};
  const reference = String(data?.reference || metadata?.reference || "").trim();
  const relatedId = String(metadata?.related_id || data?.related_id || "").trim();
  const paymentData = data?.paymentData || data?.payment_data || {};
  const channelData = paymentData?.channelData || paymentData?.channel_data || {};
  const paymentId = String(data?.paymentId || data?.payment_id || paymentData?.id || data?.id || "").trim();
  const status = String(data?.status || data?.paymentStatus || "").toLowerCase();
  const providerId = channelData?.providerId || channelData?.provider_id || null;
  const channel = paymentData?.channel || data?.channel || null;
  return {
    eventId, eventName, data, sessionId, reference, relatedId, paymentId, status, providerId, channel,
  };
}

export type PaymentFailureCode =
  | "insufficient_funds"
  | "declined"
  | "expired"
  | "cancelled"
  | "timeout"
  | "unknown";

function blobOf(payload: unknown): string {
  try {
    return JSON.stringify(payload || {}).toLowerCase();
  } catch {
    return "";
  }
}

function pickFailureText(payload: any): string {
  const data = payload?.data || payload?.result || payload?.event?.data || payload;
  const payment = data?.paymentData || data?.payment_data || data;
  const candidates = [
    data?.failureReason, data?.failure_reason, data?.failureMessage, data?.failure_message,
    data?.declineReason, data?.decline_reason, data?.errorMessage, data?.error_message,
    payment?.failureReason, payment?.failure_reason, payment?.declineCode, payment?.decline_code,
    payload?.messages?.[0],
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/** Maps a Monime session/webhook payload into a stored failure code and a client-safe reason. */
export function classifyPaymentFailure(
  status: string,
  payload?: unknown,
): { code: PaymentFailureCode; reason: string } {
  const st = String(status || "").toLowerCase();
  if (st === "cancelled" || st === "canceled") {
    return { code: "cancelled", reason: "You cancelled checkout before payment was completed. Nothing was charged." };
  }
  const text = pickFailureText(payload);
  const blob = `${blobOf(payload)} ${text} ${st}`;
  if (
    blob.includes("insufficient") || blob.includes("not enough") || blob.includes("no funds") ||
    blob.includes("nsf") || blob.includes("low balance") || blob.includes("insufficient_funds") ||
    /\b51\b/.test(blob)
  ) {
    return {
      code: "insufficient_funds",
      reason: text && !/insufficient/i.test(text)
        ? text
        : "There was not enough money in the mobile wallet or card to complete this payment.",
    };
  }
  if (blob.includes("expir")) {
    return { code: "expired", reason: "The checkout session expired before payment was completed." };
  }
  if (blob.includes("declin") || blob.includes("refus") || blob.includes("reject")) {
    return { code: "declined", reason: text || "The payment was declined by the bank or mobile money provider." };
  }
  if (st === "failed") {
    return { code: "unknown", reason: text || "The payment was not completed. You can try again or use another method." };
  }
  return { code: "unknown", reason: text || "The payment was not completed." };
}

export function classifyCheckoutEvent(eventName: string, status: string): "completed" | "failed" | "cancelled" | "ignored" {
  const name = canonEventName(eventName);
  const st = String(status || "").toLowerCase();
  if (name.includes("processed") || name.endsWith("_pending") || name === "pending") {
    return "ignored";
  }
  if (
    name === "checkout_session_completed" ||
    name === "payment_completed" ||
    name === "payment_succeeded" ||
    st === "completed" ||
    st === "succeeded" ||
    st === "paid"
  ) {
    return "completed";
  }
  if (name === "checkout_session_expired" || name === "payment_failed" || st === "expired" || st === "failed") {
    return "failed";
  }
  if (
    name === "checkout_session_cancelled" ||
    name === "checkout_session_canceled" ||
    name === "payment_cancelled" ||
    name === "payment_canceled" ||
    st === "cancelled" ||
    st === "canceled"
  ) {
    return "cancelled";
  }
  return "ignored";
}

export function classifySessionStatus(sessionStatus: string): "completed" | "failed" | "cancelled" | "pending" {
  const st = String(sessionStatus || "").toLowerCase();
  if (st === "completed" || st === "paid" || st === "succeeded") return "completed";
  if (st === "expired" || st === "failed") return "failed";
  if (st === "cancelled" || st === "canceled") return "cancelled";
  return "pending";
}

/** Amount in minor units from a checkout / payment event, when Monime includes it. */
export function extractAmountMinor(data: any): number | null {
  const candidates = [
    data?.amount?.value,
    data?.paymentData?.amount?.value,
    data?.lineItems?.data?.[0]?.price?.value,
    data?.lineItems?.[0]?.price?.value,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}
