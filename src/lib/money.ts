export function moneySLE(value: number): string {
  return `SLE ${Number(value || 0).toLocaleString('en-SL', { maximumFractionDigits: 2 })}`;
}

/** Replace leftover Kenyan shilling / old Leone labels with Sierra Leone leones. */
export function toSleCurrencyText(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^(KES|KSH|KShs?|Le|SLL)$/i.test(trimmed)) return 'SLE';
  return value
    .replace(/\bKShs?\b/gi, 'SLE')
    .replace(/\bKES\b/gi, 'SLE')
    .replace(/\bKSH\b/gi, 'SLE')
    .replace(/\bKenyan\s+Shillings?\b/gi, 'SLE')
    .replace(/\bLe\b(?=\s*[\d])/g, 'SLE');
}
