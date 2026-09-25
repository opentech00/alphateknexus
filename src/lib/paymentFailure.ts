export type PaymentFailureCode =
  | 'insufficient_funds'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'timeout'
  | 'unknown';

export interface PaymentFailureCopy {
  code: PaymentFailureCode;
  title: string;
  body: string;
  hint: string;
  tone: 'red' | 'amber';
}

const COPY: Record<PaymentFailureCode, Omit<PaymentFailureCopy, 'code' | 'body'>> = {
  insufficient_funds: {
    title: 'Insufficient funds',
    hint: 'Add money to Orange Money, AfriMoney, or your card, then retry. Nothing was credited.',
    tone: 'red',
  },
  declined: {
    title: 'Payment declined',
    hint: 'Try another mobile money account or card, or pay with wallet or cash.',
    tone: 'red',
  },
  expired: {
    title: 'Checkout expired',
    hint: 'Start a new checkout. The previous session can no longer be used.',
    tone: 'amber',
  },
  cancelled: {
    title: 'Payment cancelled',
    hint: 'Nothing was charged. You can start a new checkout whenever you are ready.',
    tone: 'amber',
  },
  timeout: {
    title: 'Still waiting on the bank',
    hint: 'If you already paid, tap Check again. If the PIN failed or you stopped, retry a new payment.',
    tone: 'amber',
  },
  unknown: {
    title: 'Payment not completed',
    hint: 'You can retry now or cancel and choose another method. Nothing was credited until the bank confirms.',
    tone: 'red',
  },
};

const DEFAULT_BODY: Record<PaymentFailureCode, string> = {
  insufficient_funds: 'There was not enough money in the mobile wallet or card to complete this payment.',
  declined: 'The payment was declined by the bank or mobile money provider.',
  expired: 'The checkout session expired before payment was completed.',
  cancelled: 'You cancelled checkout before payment was completed. Nothing was charged.',
  timeout: 'We could not confirm the payment in time. It may still complete — check again, or start a new payment.',
  unknown: 'The payment was not completed. You can try again or use another method.',
};

export function describePaymentFailure(
  code?: string | null,
  reason?: string | null,
  status?: string | null,
): PaymentFailureCopy {
  const resolved = resolveFailureCode(code, status, reason);
  const meta = COPY[resolved];
  const body = (reason && reason.trim()) || DEFAULT_BODY[resolved];
  return { code: resolved, title: meta.title, body, hint: meta.hint, tone: meta.tone };
}

function sniffReason(reason?: string | null): PaymentFailureCode | null {
  const t = String(reason || '').toLowerCase();
  if (!t) return null;
  if (t.includes('insufficient') || t.includes('not enough') || t.includes('no funds')) return 'insufficient_funds';
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('expir')) return 'expired';
  if (t.includes('declin') || t.includes('refus') || t.includes('reject')) return 'declined';
  return null;
}

export function resolveFailureCode(
  code?: string | null,
  status?: string | null,
  reason?: string | null,
): PaymentFailureCode {
  const c = String(code || '').toLowerCase();
  if (c === 'insufficient_funds' || c === 'declined' || c === 'expired' || c === 'cancelled' || c === 'timeout' || c === 'unknown') {
    return c;
  }
  const st = String(status || '').toLowerCase();
  if (st === 'cancelled' || st === 'canceled') return 'cancelled';
  if (st === 'expired') return 'expired';
  if (st === 'pending') return 'timeout';
  return sniffReason(reason) || 'unknown';
}

export function copyForPollResult(result: {
  status?: string | null;
  reason?: string | null;
  failure_code?: string | null;
  failure_reason?: string | null;
}): PaymentFailureCopy {
  if (result.status === 'pending') {
    return describePaymentFailure('timeout', result.failure_reason || result.reason, 'pending');
  }
  return describePaymentFailure(
    result.failure_code,
    result.failure_reason || result.reason,
    result.status,
  );
}
