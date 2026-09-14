export const FINANCE_APPROVAL_KINDS = ['invoice', 'withdrawal', 'wallet_adjust', 'fx_rate', 'ledger_settle'] as const;
export type FinanceApprovalKind = (typeof FINANCE_APPROVAL_KINDS)[number];
export type FinanceApprovalStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface FinanceApprovalRow {
  id: string;
  kind: FinanceApprovalKind;
  status: FinanceApprovalStatus;
  requested_by: string;
  approved_by: string | null;
  related_id: string | null;
  payload: Record<string, unknown>;
  note: string | null;
  decision_note: string | null;
  created_at: string;
  submitted_at: string | null;
  decided_at: string | null;
}

export const KIND_LABELS: Record<FinanceApprovalKind, string> = {
  invoice: 'Invoice',
  withdrawal: 'Withdrawal',
  wallet_adjust: 'Wallet adjustment',
  fx_rate: 'FX rate',
  ledger_settle: 'Ledger payment',
};

export const APPROVAL_STATUS_META: Record<FinanceApprovalStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
  submitted: { label: 'Submitted', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700' },
};

export function summarizeApprovalPayload(kind: FinanceApprovalKind, payload: Record<string, unknown> | null): string {
  const p = payload || {};
  if (kind === 'invoice') {
    const total = Number(p.total || 0);
    const currency = String(p.currency || 'SLE');
    return `${currency} ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (kind === 'withdrawal' || kind === 'wallet_adjust') {
    const amount = Number(p.amount_sle || 0);
    return `SLE ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (kind === 'ledger_settle') {
    const amount = Number(p.amount || 0);
    const method = String(p.method || 'payment');
    return `SLE ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${method}`;
  }
  if (kind === 'fx_rate') {
    const code = String(p.currency_code || '—');
    const rate = Number(p.rate_to_sle || 0);
    return `${code} @ ${rate.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  }
  return '—';
}
