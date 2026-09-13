export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function validateName(value: string, label = 'Full name'): string {
  const v = value.trim();
  if (!v) return `${label} is required.`;
  if (v.length < 2) return `${label} must be at least 2 characters.`;
  if (!/[A-Za-z]/.test(v)) return `Enter a valid ${label.toLowerCase()}.`;
  return '';
}

export function validatePhone(value: string, required = true): string {
  const v = value.trim();
  if (!v) return required ? 'Phone number is required.' : '';
  const digits = v.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return 'Enter a valid phone number (8–15 digits).';
  return '';
}

export function validateEmail(value: string, required = false): string {
  const v = value.trim();
  if (!v) return required ? 'Email is required.' : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
  return '';
}

export function validateDate(value: string, label = 'Date', required = true, minToday = true): string {
  if (!value) return required ? `${label} is required.` : '';
  if (minToday && value < todayISO()) return `${label} cannot be in the past.`;
  return '';
}

export function validateAddress(value: string, required = true): string {
  const v = value.trim();
  if (!v) return required ? 'Address is required.' : '';
  if (v.length < 5) return 'Enter a fuller street address or landmark.';
  return '';
}

export function validateRequired(value: string, label: string): string {
  return value.trim() ? '' : `${label} is required.`;
}

export function collectErrors(rules: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, message] of Object.entries(rules)) {
    if (message) errors[key] = message;
  }
  return errors;
}

export function firstErrorKey(errors: Record<string, string>): string | null {
  return Object.keys(errors).find((key) => errors[key]) || null;
}

export function scrollToField(name: string) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(`[data-field="${name}"]`);
  if (!(el instanceof HTMLElement)) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const input = el.querySelector('input, select, textarea, button');
  if (input instanceof HTMLElement) input.focus();
}

export function applyFieldErrors(errors: Record<string, string>): boolean {
  const key = firstErrorKey(errors);
  if (key) scrollToField(key);
  return Object.keys(errors).length === 0;
}
