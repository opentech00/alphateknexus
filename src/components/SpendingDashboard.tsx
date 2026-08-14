import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  TrendingUp, Wallet, Calendar, Package, Loader2, BarChart3,
  PieChart as PieIcon, ArrowUpRight, Download, Filter, Receipt,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BudgetCard } from './BudgetCard';

interface SpendingData {
  totalSpent: number;
  totalBookings: number;
  completedBookings: number;
  byService: { name: string; amount: number; count: number }[];
  byMonth: { month: string; amount: number; count: number }[];
  byCategory: { label: string; amount: number; count: number; color: string }[];
  recentPayments: { id: string; amount: number; purpose: string; method: string; created_at: string }[];
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  wallet_topup: { label: 'Wallet Top-Ups', color: 'bg-emerald-500' },
  wallet_payment: { label: 'Wallet Payments', color: 'bg-blue-500' },
  wallet_refund: { label: 'Refunds', color: 'bg-teal-500' },
  wallet_adjustment: { label: 'Adjustments', color: 'bg-amber-500' },
  invoice: { label: 'Invoice Payments', color: 'bg-indigo-500' },
  subscription: { label: 'Subscriptions', color: 'bg-rose-500' },
  other: { label: 'Other', color: 'bg-slate-400' },
};

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SpendingDashboard() {
  const [data, setData] = useState<SpendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, status, service_id, scheduled_date, services(name)')
      .order('created_at', { ascending: false });

    let paymentsQuery = supabase
      .from('payments')
      .select('id, amount_sle, purpose, payment_method, status, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (dateFrom) paymentsQuery = paymentsQuery.gte('created_at', new Date(dateFrom).toISOString());
    if (dateTo) paymentsQuery = paymentsQuery.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());

    const { data: payments } = await paymentsQuery;

    let walletQuery = supabase
      .from('wallet_transactions')
      .select('id, amount_sle, type, status, method, description, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (dateFrom) walletQuery = walletQuery.gte('created_at', new Date(dateFrom).toISOString());
    if (dateTo) walletQuery = walletQuery.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());

    const { data: walletTxns } = await walletQuery;

    const validBookings = (bookings || []).filter((b: any) => b.services);
    const completed = validBookings.filter((b: any) => b.status === 'completed');

    const byServiceMap: Record<string, { amount: number; count: number }> = {};
    (payments || []).forEach((p: any) => {
      const booking = validBookings.find((b: any) => b.id === p.reference_id);
      const svcName = ((booking?.services as any)?.name || (booking?.services as any)?.[0]?.name) || 'Other';
      if (!byServiceMap[svcName]) byServiceMap[svcName] = { amount: 0, count: 0 };
      byServiceMap[svcName].amount += Number(p.amount_sle) || 0;
      byServiceMap[svcName].count += 1;
    });

    const byService = Object.entries(byServiceMap)
      .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount);

    const now = new Date();
    const byMonthMap: Record<string, { amount: number; count: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      byMonthMap[key] = { amount: 0, count: 0 };
    }
    (payments || []).forEach((p: any) => {
      const d = new Date(p.created_at);
      const key = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      if (byMonthMap[key]) {
        byMonthMap[key].amount += Number(p.amount_sle) || 0;
        byMonthMap[key].count += 1;
      }
    });
    const byMonth = Object.entries(byMonthMap).map(([month, v]) => ({ month, amount: v.amount, count: v.count }));

    const totalSpent = (payments || []).reduce((s: number, p: any) => s + (Number(p.amount_sle) || 0), 0);

    const byCategoryMap: Record<string, { amount: number; count: number }> = {};
    (payments || []).forEach((p: any) => {
      const key = p.purpose || 'other';
      if (!byCategoryMap[key]) byCategoryMap[key] = { amount: 0, count: 0 };
      byCategoryMap[key].amount += Number(p.amount_sle) || 0;
      byCategoryMap[key].count += 1;
    });
    (walletTxns || []).forEach((t: any) => {
      const key = t.type === 'topup' ? 'wallet_topup' : t.type === 'payment' ? 'wallet_payment' : t.type === 'refund' ? 'wallet_refund' : t.type === 'adjustment' ? 'wallet_adjustment' : 'other';
      if (!byCategoryMap[key]) byCategoryMap[key] = { amount: 0, count: 0 };
      byCategoryMap[key].amount += Math.abs(Number(t.amount_sle)) || 0;
      byCategoryMap[key].count += 1;
    });
    const byCategory = Object.entries(byCategoryMap)
      .map(([key, v]) => ({
        label: CATEGORY_META[key]?.label || key,
        color: CATEGORY_META[key]?.color || 'bg-slate-400',
        amount: v.amount,
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    setData({
      totalSpent,
      totalBookings: validBookings.length,
      completedBookings: completed.length,
      byService,
      byMonth,
      byCategory,
      recentPayments: (payments || []).slice(0, 5).map((p: any) => ({
        id: p.id, amount: Number(p.amount_sle) || 0, purpose: p.purpose || 'Payment',
        method: p.payment_method || 'N/A', created_at: p.created_at,
      })),
    });
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const maxMonthly = useMemo(() => Math.max(...(data?.byMonth.map((m) => m.amount) || [1]), 1), [data]);
  const maxService = useMemo(() => Math.max(...(data?.byService.map((s) => s.amount) || [1]), 1), [data]);
  const maxCategory = useMemo(() => Math.max(...(data?.byCategory.map((c) => c.amount) || [1]), 1), [data]);

  const exportCSV = () => {
    if (!data) return;
    const headers = ['Category', 'Amount (SLE)', 'Count'];
    const rows = data.byCategory.map(c => [c.label, c.amount.toFixed(2), String(c.count)]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spending-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!data || data.totalSpent === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
          <BarChart3 className="w-7 h-7 text-slate-300" />
        </div>
        <p className="font-semibold text-slate-700">No spending data yet</p>
        <p className="text-sm text-slate-400 mt-1">Your payment history and spending insights will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors ${showFilters || dateFrom || dateTo ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <Filter className="w-3.5 h-3.5" />
            Date Range
          </button>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-slate-500 hover:text-red-500 font-medium px-2 py-2"
            >
              Clear
            </button>
          )}
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 text-xs text-slate-500 font-medium hover:text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {showFilters && (
        <div className="bg-slate-50/50 rounded-xl p-4 flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      )}

      {/* Budget Goals */}
      <BudgetCard />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Wallet className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Spent</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">SLE {fmtMoney(data.totalSpent)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Bookings</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{data.totalBookings}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Completed</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{data.completedBookings}</p>
        </div>
      </div>

      {/* Monthly Spending Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Monthly Spending</h3>
        </div>
        <div className="flex items-end justify-between gap-2 h-40">
          {data.byMonth.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full bg-gradient-to-t from-emerald-500 to-teal-400 rounded-t-lg transition-all duration-500 hover:from-emerald-600 hover:to-teal-500 relative group"
                  style={{ height: `${(m.amount / maxMonthly) * 100}%`, minHeight: m.amount > 0 ? '8px' : '2px' }}
                >
                  {m.amount > 0 && (
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      SLE {m.amount.toFixed(0)}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">{m.month}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Spending by Category */}
      {data.byCategory.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Spending by Category</h3>
          </div>
          <div className="space-y-3">
            {data.byCategory.map((c) => (
              <div key={c.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${c.color}`} />
                    <span className="text-sm font-medium text-slate-700">{c.label}</span>
                    <span className="text-xs text-slate-400">({c.count})</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">SLE {fmtMoney(c.amount)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${c.color} rounded-full transition-all duration-500`} style={{ width: `${(c.amount / maxCategory) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spending by Service */}
      {data.byService.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Spending by Service</h3>
          </div>
          <div className="space-y-3">
            {data.byService.map((s, i) => (
              <div key={s.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-teal-500', 'bg-slate-400'][i % 5]}`} />
                    <span className="text-sm font-medium text-slate-700">{s.name}</span>
                    <span className="text-xs text-slate-400">({s.count})</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">SLE {fmtMoney(s.amount)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-teal-500', 'bg-slate-400'][i % 5]} rounded-full transition-all duration-500`} style={{ width: `${(s.amount / maxService) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Payments */}
      {data.recentPayments.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Recent Payments</h3>
          <div className="space-y-2.5">
            {data.recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-700 capitalize">{p.purpose.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {p.method}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                  SLE {fmtMoney(p.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
