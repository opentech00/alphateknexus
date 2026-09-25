type BookingDetails = Record<string, unknown> | null | undefined;

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Mirrors SQL booking_total_sle. */
export function bookingTotalSle(details: BookingDetails): number | null {
  const d = details || {};
  return positive(d.quoted_total_sle) ?? positive(d.total_sle) ?? positive(d.price_sle) ?? positive(d.amount_sle);
}

export function bookingPayAmount(booking: {
  details?: Record<string, unknown> | null;
}, fallback = 25): number {
  return bookingTotalSle(booking.details) ?? fallback;
}

/** Remaining balance the server will charge (total minus payments already recorded). */
export function bookingDueAmount(booking: {
  details?: Record<string, unknown> | null;
  amount_paid_sle?: number | string | null;
  payment_status?: string | null;
}, fallback = 25): number {
  if (['paid', 'verified'].includes(booking.payment_status || '')) return 0;
  const total = bookingPayAmount(booking, fallback);
  const paid = Number(booking.amount_paid_sle || 0);
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

/** Deposit offered on a quote, only before any payment has been made. */
export function bookingDepositAmount(booking: {
  details?: Record<string, unknown> | null;
  amount_paid_sle?: number | string | null;
}): number | null {
  if (Number(booking.amount_paid_sle || 0) > 0) return null;
  const deposit = positive((booking.details || {}).deposit_sle);
  const total = bookingTotalSle(booking.details);
  if (!deposit || !total || deposit >= total) return null;
  return deposit;
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
