export const DEFAULT_COUNTRY_DIGITS = '232';

export const PHONE_COUNTRIES: { digits: string; dial: string; label: string; localLen?: number }[] = [
  { digits: '232', dial: '+232', label: 'Sierra Leone', localLen: 8 },
  { digits: '233', dial: '+233', label: 'Ghana', localLen: 9 },
  { digits: '234', dial: '+234', label: 'Nigeria', localLen: 10 },
  { digits: '225', dial: '+225', label: 'Côte d’Ivoire' },
  { digits: '221', dial: '+221', label: 'Senegal' },
  { digits: '44', dial: '+44', label: 'United Kingdom' },
  { digits: '1', dial: '+1', label: 'United States / Canada' },
];

export type NormalizedPhone = {
  e164: string;
  display: string;
  digits: string;
  countryDigits: string;
  local: string;
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function splitPhoneInput(raw: string, fallbackCountry = DEFAULT_COUNTRY_DIGITS): { countryDigits: string; local: string } {
  let digits = onlyDigits(raw.trim());
  if (raw.trim().startsWith('00')) {
    digits = onlyDigits(raw.trim().slice(2));
  }

  const known = [...PHONE_COUNTRIES].sort((a, b) => b.digits.length - a.digits.length);
  if (raw.trim().startsWith('+') || raw.trim().startsWith('00')) {
    const match = known.find((c) => digits.startsWith(c.digits));
    if (match) {
      return { countryDigits: match.digits, local: digits.slice(match.digits.length).replace(/^0+/, '') };
    }
    if (digits.length >= 8 && digits.length <= 15) {
      return { countryDigits: digits.slice(0, Math.min(3, digits.length - 8)), local: digits.slice(Math.min(3, digits.length - 8)) };
    }
  }

  if (digits.startsWith('232') && digits.length === 11) {
    return { countryDigits: '232', local: digits.slice(3) };
  }
  if (digits.startsWith('0') && digits.length === 9) {
    return { countryDigits: fallbackCountry, local: digits.slice(1) };
  }
  if (digits.length === 8) {
    return { countryDigits: fallbackCountry, local: digits };
  }

  const match = known.find((c) => digits.startsWith(c.digits) && digits.length > c.digits.length);
  if (match) {
    return { countryDigits: match.digits, local: digits.slice(match.digits.length).replace(/^0+/, '') };
  }

  return { countryDigits: fallbackCountry, local: digits.replace(/^0+/, '') };
}

export function normalizePhone(raw: string, countryDigits = DEFAULT_COUNTRY_DIGITS): { ok: true; value: NormalizedPhone } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Phone number is required.' };

  const parsed = splitPhoneInput(trimmed, countryDigits);
  const country = onlyDigits(parsed.countryDigits || countryDigits);
  const local = onlyDigits(parsed.local).replace(/^0+/, '');

  if (!country || country.length < 1 || country.length > 3) {
    return { ok: false, error: 'Enter a valid country code.' };
  }
  if (!local) {
    return { ok: false, error: 'Enter a valid phone number.' };
  }

  const spec = PHONE_COUNTRIES.find((c) => c.digits === country);
  if (spec?.localLen && local.length !== spec.localLen) {
    return { ok: false, error: `Enter a valid ${spec.label} number (${spec.localLen} digits).` };
  }

  const combined = country + local;
  if (combined.length < 8 || combined.length > 15) {
    return { ok: false, error: 'Enter a valid phone number (8–15 digits).' };
  }
  if (!/^[1-9][0-9]{7,14}$/.test(combined)) {
    return { ok: false, error: 'Enter a valid phone number.' };
  }

  const e164 = `+${combined}`;
  return {
    ok: true,
    value: {
      e164,
      display: e164,
      digits: combined,
      countryDigits: country,
      local,
    },
  };
}

export function validateSignupPhone(raw: string, countryDigits = DEFAULT_COUNTRY_DIGITS): string {
  const result = normalizePhone(raw, countryDigits);
  return result.ok ? '' : result.error;
}

export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const digits = onlyDigits(e164);
  if (digits.length < 6) return e164;
  const last = digits.slice(-4);
  const country = digits.startsWith('232') ? '+232' : `+${digits.slice(0, Math.max(1, digits.length - 8))}`;
  return `${country} •• ••• ${last}`;
}

export function toWhatsAppRecipient(e164: string): string {
  return onlyDigits(e164);
}

export function toMonimePhone(e164: string): string | null {
  const digits = onlyDigits(e164);
  if (digits.length === 11 && digits.startsWith('232')) return digits;
  return null;
}
