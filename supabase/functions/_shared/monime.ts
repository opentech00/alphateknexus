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
  return { eventId, eventName, data, sessionId, reference, relatedId, paymentId, status, providerId, channel };
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
