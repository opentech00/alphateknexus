export const DISPLAY_CURRENCIES = ['SLE', 'USD', 'EUR'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export const CURRENCY_META: Record<DisplayCurrency, { label: string; symbol: string; name: string }> = {
  SLE: { label: 'SLE', symbol: 'SLE', name: 'Leone' },
  USD: { label: 'USD', symbol: '$', name: 'US Dollar' },
  EUR: { label: 'EUR', symbol: '€', name: 'Euro' },
};

const FALLBACK_RATE_TO_SLE: Record<DisplayCurrency, number> = {
  SLE: 1,
  USD: 24.5,
  EUR: 26.3,
};

const EURO_COUNTRIES = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
  'AD', 'MC', 'SM', 'VA', 'ME', 'XK',
]);

const COUNTRY_ALIASES: Record<string, string> = {
  'SIERRA LEONE': 'SL',
  'UNITED STATES': 'US',
  'UNITED STATES OF AMERICA': 'US',
  'USA': 'US',
  'AMERICA': 'US',
  'UNITED KINGDOM': 'GB',
  'GREAT BRITAIN': 'GB',
  'UK': 'GB',
  'GERMANY': 'DE',
  'FRANCE': 'FR',
  'SPAIN': 'ES',
  'ITALY': 'IT',
  'NETHERLANDS': 'NL',
  'BELGIUM': 'BE',
  'PORTUGAL': 'PT',
  'IRELAND': 'IE',
  'AUSTRIA': 'AT',
  'GREECE': 'GR',
  'FINLAND': 'FI',
};

export function isDisplayCurrency(value: string | null | undefined): value is DisplayCurrency {
  return !!value && (DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

export function normalizeCountryCode(country?: string | null): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return COUNTRY_ALIASES[trimmed.toUpperCase()] || null;
}

export function currencyFromCountry(country?: string | null): DisplayCurrency | null {
  const code = normalizeCountryCode(country);
  if (!code) return null;
  if (code === 'SL') return 'SLE';
  if (EURO_COUNTRIES.has(code)) return 'EUR';
  return 'USD';
}

export function detectDisplayCurrency(input?: {
  country?: string | null;
  phone?: string | null;
  locale?: string | null;
  timeZone?: string | null;
}): DisplayCurrency {
  const fromCountry = currencyFromCountry(input?.country);
  if (fromCountry) return fromCountry;

  const phone = (input?.phone || '').replace(/\s/g, '');
  if (phone.startsWith('+232') || phone.startsWith('232')) return 'SLE';
  if (phone.startsWith('+1')) return 'USD';
  if (/^\+3[0-9]/.test(phone) || phone.startsWith('+49') || phone.startsWith('+33')) return 'EUR';

  const tz = input?.timeZone || '';
  if (tz === 'Africa/Freetown') return 'SLE';
  if (tz.startsWith('Europe/') && tz !== 'Europe/London') return 'EUR';
  if (tz.startsWith('America/') || tz.startsWith('Pacific/')) return 'USD';

  const locale = (input?.locale || '').toLowerCase();
  if (locale.includes('-sl') || locale.endsWith('_sl')) return 'SLE';
  if (locale.startsWith('en-us') || locale.startsWith('en-ca')) return 'USD';
  if (/^(de|fr|es|it|nl|pt|fi|el|sk|sl|et|lv|lt|mt)-/.test(locale)) return 'EUR';

  return 'SLE';
}

export function sleToDisplay(amountSle: number, currency: DisplayCurrency, rateToSle?: number): number {
  const rate = rateToSle && rateToSle > 0 ? rateToSle : FALLBACK_RATE_TO_SLE[currency];
  if (currency === 'SLE') return amountSle;
  return amountSle / rate;
}

export function formatFromSle(
  amountSle: number,
  currency: DisplayCurrency,
  rateToSle?: number,
  opts?: { compact?: boolean },
): string {
  const value = sleToDisplay(amountSle, currency, rateToSle);
  const digits = currency === 'SLE' && Math.abs(value) >= 1000 && opts?.compact ? 0 : 2;
  const formatted = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = value < 0 ? '-' : '';
  if (currency === 'SLE') return `${sign}SLE ${formatted}`;
  return `${sign}${CURRENCY_META[currency].symbol}${formatted}`;
}

export function rewriteSlePriceHint(
  hint: string,
  currency: DisplayCurrency,
  rateToSle?: number,
): string {
  const match = hint.match(/([\d,]+(?:\.\d+)?)/);
  if (!match) return hint;
  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return hint;
  const converted = formatFromSle(amount, currency, rateToSle, { compact: amount >= 1000 });
  return hint.replace(match[0], converted.replace(/^(SLE |\$|€)/, '')).replace(/SLE|Le\b|Leone/i, CURRENCY_META[currency].label);
}
