import { BookOpen } from 'lucide-react';

export function FinanceOpsPlaybook({ variant }: { variant: 'unmatched' | 'payouts' }) {
  if (variant === 'payouts') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-900">Payout callbacks</h3>
        </div>
        <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
          <li><span className="font-semibold text-slate-800">Who:</span> Finance staff with payout permission. A second admin must send after approval (dual control).</li>
          <li><span className="font-semibold text-slate-800">How often:</span> Check Sent and Failed rows every morning against the daily recon. Refresh status before sending again.</li>
          <li><span className="font-semibold text-slate-800">Failed with a Monime id:</span> Refresh status. If Monime paid the customer, mark delivered. If Monime failed, mark failed — the wallet debit stays until recon says otherwise.</li>
          <li><span className="font-semibold text-slate-800">No Monime refunds API:</span> Return money to a client with an audited wallet credit (Finance → Wallet → refund/adjustment), not a Monime reversal.</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-900">Unmatched webhooks and Pay again</h3>
      </div>
      <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
        <li><span className="font-semibold text-slate-800">Who:</span> Finance (ledger permission). Match completed events the same business day; dismiss only with a written reason.</li>
        <li><span className="font-semibold text-slate-800">How often:</span> Open inbox at start of day. Daily recon flags leftover open events. The job queue retries known pending references automatically.</li>
        <li><span className="font-semibold text-slate-800">Match:</span> Enter the local reference, then Match and verify. That calls verify (webhook still owns paid). Do not mark paid from the browser.</li>
        <li><span className="font-semibold text-slate-800">Pay again:</span> Starts a new checkout and a new <code className="text-[11px]">monime_payments</code> row. The failed/cancelled row stays failed. The ledger credits only when a row is completed, once (ledger_applied_at). A retry never doubles a completed payment.</li>
      </ul>
    </div>
  );
}
