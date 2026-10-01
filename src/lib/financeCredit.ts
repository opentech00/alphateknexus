import { supabase } from './supabase';

export async function issueWalletCredit(input: {
  userId: string;
  amount: number;
  kind: 'refund' | 'adjustment';
  reason: string;
  relatedType?: 'booking' | 'invoice' | 'monime' | 'dispute' | 'none' | null;
  relatedId?: string | null;
  idempotencyKey?: string | null;
}): Promise<{ success: true; credit_id: string } | { success: false; error: string }> {
  const { data, error } = await supabase.rpc('issue_wallet_credit', {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_kind: input.kind,
    p_reason: input.reason,
    p_related_type: input.relatedType || null,
    p_related_id: input.relatedId || null,
    p_idempotency_key: input.idempotencyKey || null,
  });
  if (error) return { success: false, error: error.message };
  const row = data as { success?: boolean; error?: string; credit_id?: string } | null;
  if (!row?.success) return { success: false, error: row?.error || 'Could not issue credit.' };
  return { success: true, credit_id: row.credit_id || '' };
}
