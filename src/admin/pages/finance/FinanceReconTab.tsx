import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Scale, Download } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { downloadCsv } from './financeCsv';
import { useFinancePrivacy } from '../../../contexts/FinancePrivacyContext';

interface ReconDay {
  day: string;
  monime_settled_sle: number;
  monime_settled_count: number;
  monime_attempted_sle: number;
  monime_failed_count: number;
  monime_cancelled_count: number;
  monime_pending_count: number;
  wallet_monime_sle: number;
  invoice_monime_sle: number;
  booking_monime_sle: number;
  wallet_credits_sle: number;
  wallet_debits_sle: number;
  unmatched_open_count: number;
  unmatched_created_count: number;
  payouts_completed_sle: number;
  payouts_failed_count: number;
  ledger_gap_sle: number;
  generated_at: string;
}

function fmtSle(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}SLE ${Math.abs(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dayLabel(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FinanceReconTab() {
  const { money } = useFinancePrivacy();
  const [rows, setRows] = useState<ReconDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('finance_recon_days')
      .select('*')
      .order('day', { ascending: false })
      .limit(45);
    if (err) setError(err.message);
    else { setError(''); setRows((data || []) as ReconDay[]); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runYesterday = async () => {
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('run_finance_recon');
    if (err) setError(err.message);
    await load();
    setBusy(false);
  };

  const exportCsv = () => {
    downloadCsv('finance-recon.csv', rows.map((r) => ({
      day: r.day,
      monime_settled: r.monime_settled_sle,
      wallet_monime: r.wallet_monime_sle,
      invoices: r.invoice_monime_sle,
      bookings: r.booking_monime_sle,
      gap: r.ledger_gap_sle,
      failed: r.monime_failed_count + r.monime_cancelled_count,
      unmatched_open: r.unmatched_open_count,
      payouts_failed: r.payouts_failed_count,
    })));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
            <Scale className="w-4 h-4 text-emerald-600" /> Daily recon
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Monime settled vs local rails for UTC days. Gap should stay near zero. Cron runs at 00:25 UTC.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void runYesterday()} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Run yesterday
          </button>
          <button type="button" onClick={exportCsv} disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-8 text-center">
          No snapshots yet. Run yesterday to build the first row.
        </p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-3 font-semibold">Day</th>
                <th className="text-right px-3 py-3 font-semibold">Settled</th>
                <th className="text-right px-3 py-3 font-semibold">Wallet</th>
                <th className="text-right px-3 py-3 font-semibold">Invoices</th>
                <th className="text-right px-3 py-3 font-semibold">Bookings</th>
                <th className="text-right px-3 py-3 font-semibold">Gap</th>
                <th className="text-right px-3 py-3 font-semibold">Failed</th>
                <th className="text-right px-3 py-3 font-semibold">Open unmatched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                const gap = Number(r.ledger_gap_sle) || 0;
                return (
                  <tr key={r.day} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{dayLabel(r.day)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{money(r.monime_settled_sle)}
                      <span className="block text-[10px] text-slate-400 font-normal">{r.monime_settled_count} tx</span>
                    </td>
                    <td className="px-3 py-3 text-right">{money(r.wallet_monime_sle)}</td>
                    <td className="px-3 py-3 text-right">{money(r.invoice_monime_sle)}</td>
                    <td className="px-3 py-3 text-right">{money(r.booking_monime_sle)}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${Math.abs(gap) < 0.01 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {money(gap)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">{r.monime_failed_count + r.monime_cancelled_count}</td>
                    <td className="px-3 py-3 text-right text-slate-600">{r.unmatched_open_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
