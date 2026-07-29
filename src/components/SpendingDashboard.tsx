import { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, Wallet, Calendar, Package, Loader2, BarChart3,
  PieChart as PieIcon, ArrowUpRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SpendingData {
  totalSpent: number;
  totalBookings: number;
  completedBookings: number;
  byService: { name: string; amount: number; count: number }[];
  byMonth: { month: string; amount: number; count: number }[];
  recentPayments: { id: string; amount: number; purpose: string; method: string; created_at: string }[];
}

export function SpendingDashboard() {
  const [data, setData] = useState<SpendingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, status, service_id, scheduled_date, services(name)')
        .order('created_at', { ascending: false });

      const { data: payments } = await supabase
        .from('payments')
        .select('id, amount_sle, purpose, payment_method, status, created_at')
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

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

      setData({
        totalSpent,
        totalBookings: validBookings.length,
        completedBookings: completed.length,
        byService,
        byMonth,
        recentPayments: (payments || []).slice(0, 5).map((p: any) => ({
          id: p.id, amount: Number(p.amount_sle) || 0, purpose: p.purpose || 'Payment',
          method: p.payment_method || 'N/A', created_at: p.created_at,
        })),
      });
      setLoading(false);
    })();
  }, []);

  const maxMonthly = useMemo(() => Math.max(...(data?.byMonth.map((m) => m.amount) || [1]), 1), [data]);
  const maxService = useMemo(() => Math.max(...(data?.byService.map((s) => s.amount) || [1]), 1), [data]);

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

  const serviceColors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-teal-500', 'bg-slate-400'];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Wallet className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Spent</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">SLE {data.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
                    <span className={`w-2.5 h-2.5 rounded-full ${serviceColors[i % serviceColors.length]}`} />
                    <span className="text-sm font-medium text-slate-700">{s.name}</span>
                    <span className="text-xs text-slate-400">({s.count})</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">SLE {s.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${serviceColors[i % serviceColors.length]} rounded-full transition-all duration-500`} style={{ width: `${(s.amount / maxService) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  SLE {p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
