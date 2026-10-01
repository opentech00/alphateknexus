import type { PaymentPurpose } from './monime';
import { describePaymentFailure } from './paymentFailure';
import { supabase } from './supabase';

export interface FailedPaymentAttempt {
  relatedId: string;
  purpose: PaymentPurpose;
  code: string | null;
  reason: string | null;
  status: string;
  reference: string;
  amountSle: number;
  createdAt: string;
}

export function failureCopy(attempt: FailedPaymentAttempt) {
  return describePaymentFailure(attempt.code, attempt.reason, attempt.status);
}

/** Latest failed/cancelled Monime row per related_id for this user and purpose. */
export async function loadLatestFailedMonime(
  userId: string,
  purpose: PaymentPurpose,
): Promise<Map<string, FailedPaymentAttempt>> {
  const { data, error } = await supabase
    .from('monime_payments')
    .select('related_id, purpose, failure_code, failure_reason, status, reference, amount_sle, created_at')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .in('status', ['failed', 'cancelled'])
    .not('related_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(80);
  const map = new Map<string, FailedPaymentAttempt>();
  if (error || !data) return map;
  for (const row of data) {
    const relatedId = String(row.related_id || '');
    if (!relatedId || map.has(relatedId)) continue;
    map.set(relatedId, {
      relatedId,
      purpose,
      code: row.failure_code,
      reason: row.failure_reason,
      status: row.status,
      reference: row.reference,
      amountSle: Number(row.amount_sle),
      createdAt: row.created_at,
    });
  }
  return map;
}
