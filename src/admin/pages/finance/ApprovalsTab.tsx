import { FinanceApprovalsPanel } from '../../../components/FinanceApprovalsPanel';

export function ApprovalsTab() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Dual-control queue for invoices, withdrawals, wallet adjustments, and FX edits.
        Assistants draft and submit; officers approve invoices; managers approve withdrawals and FX.
      </p>
      <FinanceApprovalsPanel scope="all" allowCreate />
    </div>
  );
}
