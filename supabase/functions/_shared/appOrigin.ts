/** Canonical production origin. Keep in sync with src/lib/site.ts. */
export const PRODUCTION_HTTPS_ORIGIN = "https://alphateknexus.app";

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
}

export function isPublicHttpsOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && !isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Success/cancel URLs must be public HTTPS so iPhone/Safari does not bounce
 * through localhost after Monime checkout.
 */
export function resolveReturnOrigin(candidate?: string | null): string {
  const secret = (Deno.env.get("MONIME_RETURN_ORIGIN") || "").replace(/\/$/, "");
  if (secret && isPublicHttpsOrigin(secret)) return secret;
  const origin = (candidate || "").replace(/\/$/, "");
  if (origin && isPublicHttpsOrigin(origin)) return origin;
  return PRODUCTION_HTTPS_ORIGIN;
}
