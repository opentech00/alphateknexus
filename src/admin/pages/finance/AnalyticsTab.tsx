import { useEffect, useState, useMemo } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Loader2, Calendar,
  ArrowDownCircle, ArrowUpCircle, Smartphone, CreditCard, Wallet,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface RevenueDay {
  date: string;
  wallet_topups: number;
  wallet_payments: number;
  monime_amount: number;
  receipt_amount: number;
  total_inflow: number;
  total_outflow: number;
}

interface MethodBreakdown {
  method: string;
  count: number;
  amount: number;
}

function fmtMoney(n: number) {
  return `SLE ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

type Range = '7d' | '30d' | '90d';

export function AnalyticsTab() {
  const [data, setData] = useState<RevenueDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [range, setRange] = useState<Range>('30d');
  const [methodBreakdown, setMethodBreakdown] = useState<MethodBreakdown[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError('');
      const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
      const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

      const { data: revData, error } = await supabase
        .from('revenue_daily')
        .select('*')
        .gte('date', startDate)
        .order('date', { ascending: true });

      if (error) { setLoadError(error.message); setLoading(false); return; }
      setData((revData || []) as RevenueDay[]);

      // Method breakdown from wallet_transactions
      const { data: walletMethods } = await supabase
        .from('wallet_transactions')
        .select('method, amount_sle')
        .eq('status', 'completed')
        .gte('created_at', startDate);

      const methodMap: Record<string, MethodBreakdown> = {};
      (walletMethods || []).forEach((r: any) => {
        const m = r.method || 'unknown';
        if (!methodMap[m]) methodMap[m] = { method: m, count: 0, amount: 0 };
        methodMap[m].count++;
        methodMap[m].amount += Math.abs(Number(r.amount_sle));
      });
      setMethodBreakdown(Object.values(methodMap).sort((a, b) => b.amount - a.amount));

      setLoading(false);
    })();
  }, [range]);

  const stats = useMemo(() => {
    const totalInflow = data.reduce((s, d) => s + Number(d.total_inflow), 0);
    const totalOutflow = data.reduce((s, d) => s + Number(d.total_outflow), 0);
    const netFlow = totalInflow - totalOutflow;
    const avgDaily = data.length > 0 ? totalInflow / data.length : 0;
    const topDay = data.reduce((max, d) => Number(d.total_inflow) > Number(max.total_inflow) ? d : max, data[0] || { date: '', total_inflow: 0 } as RevenueDay);
    return { totalInflow, totalOutflow, netFlow, avgDaily, topDay };
  }, [data]);

  const maxInflow = Math.max(...data.map(d => Number(d.total_inflow)), 1);

  const rangeOptions: { id: Range; label: string }[] = [
    { id: '7d', label: '7 Days' }, { id: '30d', label: '30 Days' }, { id: '90d', label: '90 Days' },
  ];

  const METHOD_LABELS: Record<string, string> = {
    cash: 'Cash', bank_transfer: 'Bank Transfer', africell_money: 'Africell Money',
    orange_money: 'Orange Money', qmoney: 'QMoney', wallet: 'Wallet', admin: 'Admin Adjustment',
    card: 'Debit Card', unknown: 'Other',
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        Failed to load analytics: {loadError}
      </div>
    );
  }

  return (
    <>
      {/* Range selector */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit">
        {rangeOptions.map(opt => (
          <button key={opt.id} onClick={() => setRange(opt.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              range === opt.id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBox label="TOTAL INFLOW" value={fmtMoney(stats.totalInflow)} icon={ArrowDownCircle} color="text-emerald-500" accent="bg-emerald-50" />
        <StatBox label="TOTAL OUTFLOW" value={fmtMoney(stats.totalOutflow)} icon={ArrowUpCircle} color="text-red-500" accent="bg-red-50" />
        <StatBox label="NET FLOW" value={fmtMoney(stats.netFlow)} icon={TrendingUp} color={stats.netFlow >= 0 ? 'text-emerald-500' : 'text-red-500'} accent="bg-emerald-50" />
        <StatBox label="AVG DAILY" value={fmtMoney(stats.avgDaily)} icon={BarChart3} color="text-blue-500" accent="bg-blue-50" />
      </div>

      {/* Revenue chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900">Revenue Trend</h3>
          </div>
          {stats.topDay.date && (
            <div className="text-xs text-slate-400">
              Peak: <span className="font-semibold text-slate-600">{formatDate(stats.topDay.date)}</span> ({fmtMoney(stats.topDay.total_inflow)})
            </div>
          )}
        </div>

        {data.length === 0 || data.every(d => Number(d.total_inflow) === 0) ? (
          <div className="text-center py-12">
            <BarChart3 className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No revenue data for this period</p>
          </div>
        ) : (
          <div className="flex items-end gap-1 h-48 overflow-x-auto pb-2">
            {data.map((day, i) => {
              const height = (Number(day.total_inflow) / maxInflow) * 100;
              const hasData = Number(day.total_inflow) > 0;
              return (
                <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1 group" style={{ minWidth: data.length > 30 ? '12px' : '24px' }}>
                  <div className="relative w-full flex items-end" style={{ height: '180px' }}>
                    <div
                      className="w-full rounded-t-md transition-all duration-300 group-hover:bg-emerald-500"
                      style={{
                        height: `${hasData ? Math.max(height, 2) : 0}%`,
                        background: hasData ? 'linear-gradient(to top, #10b981, #34d399)' : 'transparent',
                      }}
                    />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap pointer-events-none z-10">
                      {fmtMoney(day.total_inflow)}
                    </div>
                  </div>
                  {data.length <= 30 && (
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDate(day.date)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-column: Source breakdown + Method breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-900 mb-4">Revenue by Source</h3>
          <SourceBar icon={Wallet} label="Wallet Top-Ups" amount={data.reduce((s, d) => s + Number(d.wallet_topups), 0)} total={stats.totalInflow} color="bg-emerald-500" />
          <SourceBar icon={Smartphone} label="Mobile Money (Monime)" amount={data.reduce((s, d) => s + Number(d.monime_amount), 0)} total={stats.totalInflow} color="bg-blue-500" />
          <SourceBar icon={CreditCard} label="Card / Bank Receipts" amount={data.reduce((s, d) => s + Number(d.receipt_amount), 0)} total={stats.totalInflow} color="bg-teal-500" />
        </div>

        {/* Method breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-900 mb-4">Payment Methods</h3>
          {methodBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No payment data</p>
          ) : (
            <div className="space-y-3">
              {methodBreakdown.map(m => {
                const maxAmount = Math.max(...methodBreakdown.map(x => x.amount));
                const pct = (m.amount / maxAmount) * 100;
                return (
                  <div key={m.method}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600 font-medium">{METHOD_LABELS[m.method] || m.method}</span>
                      <span className="text-slate-400">{m.count} txns · {fmtMoney(m.amount)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SourceBar({ icon: Icon, label, amount, total, color }: {
  icon: typeof Wallet; label: string; amount: number; total: number; color: string;
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-center text-sm mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          <span className="text-slate-600 font-medium">{label}</span>
        </div>
        <span className="text-slate-400">{fmtMoney(amount)} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color, accent }: {
  label: string; value: string; icon: typeof Wallet; color: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mt-1.5">{label}</p>
    </div>
  );
}
