export const DEFAULT_COUNTRY_DIGITS = "232";

const COUNTRY_LOCAL_LEN: Record<string, number> = {
  "232": 8,
  "233": 9,
  "234": 10,
};

export type NormalizedPhone = {
  e164: string;
  display: string;
  digits: string;
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizePhone(
  raw: string,
  countryDigits = DEFAULT_COUNTRY_DIGITS,
): { ok: true; value: NormalizedPhone } | { ok: false; error: string } {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { ok: false, error: "Phone number is required." };

  let digits = onlyDigits(trimmed);
  if (trimmed.startsWith("00")) digits = onlyDigits(trimmed.slice(2));

  let country = onlyDigits(countryDigits) || DEFAULT_COUNTRY_DIGITS;
  let local = digits;

  if (trimmed.startsWith("+") || trimmed.startsWith("00")) {
    if (digits.startsWith("232") && digits.length === 11) {
      country = "232";
      local = digits.slice(3);
    } else if (digits.length >= 8 && digits.length <= 15) {
      const known = Object.keys(COUNTRY_LOCAL_LEN).sort((a, b) => b.length - a.length);
      const match = known.find((c) => digits.startsWith(c));
      if (match) {
        country = match;
        local = digits.slice(match.length);
      } else {
        country = digits.slice(0, Math.min(3, digits.length - 8));
        local = digits.slice(country.length);
      }
    }
  } else if (digits.startsWith("232") && digits.length === 11) {
    country = "232";
    local = digits.slice(3);
  } else if (digits.startsWith("0") && digits.length === 9) {
    local = digits.slice(1);
  } else if (digits.length === 8) {
    country = country || DEFAULT_COUNTRY_DIGITS;
    local = digits;
  } else {
    const match = Object.keys(COUNTRY_LOCAL_LEN).find((c) => digits.startsWith(c) && digits.length > c.length);
    if (match) {
      country = match;
      local = digits.slice(match.length);
    }
  }

  local = onlyDigits(local).replace(/^0+/, "");
  if (!country || country.length < 1 || country.length > 3) {
    return { ok: false, error: "Enter a valid country code." };
  }
  if (!local) return { ok: false, error: "Enter a valid phone number." };

  const expected = COUNTRY_LOCAL_LEN[country];
  if (expected && local.length !== expected) {
    return { ok: false, error: `Enter a valid phone number (${expected} digits after +${country}).` };
  }

  const combined = country + local;
  if (combined.length < 8 || combined.length > 15 || !/^[1-9][0-9]{7,14}$/.test(combined)) {
    return { ok: false, error: "Enter a valid phone number (8–15 digits)." };
  }

  const e164 = `+${combined}`;
  return { ok: true, value: { e164, display: e164, digits: combined } };
}

export function toWhatsAppRecipient(e164: string): string {
  return onlyDigits(e164);
}
