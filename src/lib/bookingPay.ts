export function bookingPayAmount(booking: {
  details?: Record<string, unknown> | null;
}, fallback = 25): number {
  const details = booking.details || {};
  const candidates = [details.total_sle, details.price_sle, details.amount_sle];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

export function bookingNeedsPayment(booking: {
  status: string;
  payment_status?: string | null;
  deleted_at?: string | null;
}): boolean {
  if (booking.deleted_at) return false;
  if (['cancelled', 'completed'].includes(booking.status)) return false;
  const pay = booking.payment_status || 'pending';
  return !['paid', 'verified', 'refunded'].includes(pay);
}
