export async function hashPhoneOtp(code: string, phoneE164: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:${phoneE164}:${code}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateOtpCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = new DataView(bytes.buffer).getUint32(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export function requireOtpPepper(): string | null {
  const pepper = Deno.env.get("PHONE_OTP_PEPPER")?.trim();
  return pepper || null;
}
