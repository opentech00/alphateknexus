const PRIVACY_KEY = 'atn-finance-privacy';

export function getFinancePrivacy(): boolean {
  try {
    const raw = sessionStorage.getItem(PRIVACY_KEY);
    if (raw === null) return true;
    return raw !== '0';
  } catch {
    return true;
  }
}

export function setFinancePrivacy(on: boolean) {
  try {
    sessionStorage.setItem(PRIVACY_KEY, on ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

export function maskEmail(value: string | null | undefined): string {
  const email = (value || '').trim();
  if (!email) return '—';
  const [user, domain] = email.split('@');
  if (!domain) return '••••';
  const head = user.slice(0, 1) || '•';
  return `${head}•••@${domain}`;
}

export function maskReference(value: string | null | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '—';
  if (raw.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(raw.length - 4, 8))}${raw.slice(-4)}`;
}

export function redactCsvValue(privacy: boolean, kind: 'email' | 'reference' | 'plain', value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  if (!privacy) return text;
  if (kind === 'email') return maskEmail(text);
  if (kind === 'reference') return maskReference(text);
  return text;
}
