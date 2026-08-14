import { useEffect, useState, useCallback } from 'react';
import { Target, TrendingUp, TrendingDown, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface BudgetData {
  budget: number;
  spent: number;
  daysElapsed: number;
  daysInMonth: number;
  dailyAvg: number;
  projected: number;
  lastMonthSpent: number;
}

export function BudgetCard() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const prefRes = await supabase
      .from('user_preferences')
      .select('monthly_budget')
      .eq('user_id', user.id)
      .maybeSingle();

    const budget = Number(prefRes.data?.monthly_budget) || 0;
    if (budget <= 0) { setLoading(false); return; }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = endOfMonth.getDate();
    const daysElapsed = Math.max(now.getDate(), 1);

    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [currentRes, lastRes] = await Promise.all([
      supabase
        .from('wallet_transactions')
        .select('amount_sle')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .eq('type', 'payment')
        .gte('created_at', startOfMonth.toISOString()),
      supabase
        .from('wallet_transactions')
        .select('amount_sle')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .eq('type', 'payment')
        .gte('created_at', startOfLastMonth.toISOString())
        .lt('created_at', startOfMonth.toISOString()),
    ]);

    const spent = (currentRes.data || []).reduce((s, t) => s + Math.abs(Number(t.amount_sle)), 0);
    const lastMonthSpent = (lastRes.data || []).reduce((s, t) => s + Math.abs(Number(t.amount_sle)), 0);

    const dailyAvg = daysElapsed > 0 ? spent / daysElapsed : 0;
    const projected = dailyAvg * daysInMonth;

    setData({ budget, spent, daysElapsed, daysInMonth, dailyAvg, projected, lastMonthSpent });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const pct = Math.min((data.spent / data.budget) * 100, 100);
  const projPct = Math.min((data.projected / data.budget) * 100, 100);
  const isOverBudget = data.spent > data.budget;
  const willExceed = data.projected > data.budget && !isOverBudget;
  const monthChange = data.lastMonthSpent > 0
    ? ((data.spent - data.lastMonthSpent) / data.lastMonthSpent) * 100
    : 0;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-slate-700">Monthly Budget</h3>
        {isOverBudget && (
          <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold ml-auto">Over Budget</span>
        )}
        {willExceed && (
          <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold ml-auto">On Track to Exceed</span>
        )}
      </div>

      <div className="flex items-center gap-6">
        {/* Progress Ring */}
        <div className="relative flex-shrink-0">
          <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
            <circle cx="64" cy="64" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <circle
              cx="64" cy="64" r={radius} fill="none"
              stroke={isOverBudget ? '#ef4444' : willExceed ? '#f59e0b' : '#10b981'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
            {!isOverBudget && projPct > pct && (
              <circle
                cx="64" cy="64" r={radius} fill="none"
                stroke={willExceed ? '#fbbf24' : '#6ee7b7'}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (projPct / 100) * circumference}
                opacity="0.4"
                className="transition-all duration-1000 ease-out"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-slate-900">{Math.round(pct)}%</span>
            <span className="text-[10px] text-slate-400 font-medium">used</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs text-slate-400 font-medium">Spent this month</p>
            <p className={`text-lg font-bold ${isOverBudget ? 'text-red-600' : 'text-slate-900'}`}>SLE {fmtMoney(data.spent)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Budget</p>
            <p className="text-sm font-semibold text-slate-700">SLE {fmtMoney(data.budget)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Remaining</p>
            <p className={`text-sm font-semibold ${data.budget - data.spent < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              SLE {fmtMoney(Math.max(data.budget - data.spent, 0))}
            </p>
          </div>
        </div>
      </div>

      {/* Insights Row */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-400 font-medium mb-0.5">Daily Avg</p>
          <p className="text-xs font-bold text-slate-800">SLE {fmtMoney(data.dailyAvg)}</p>
        </div>
        <div className={`rounded-xl p-3 text-center ${willExceed || isOverBudget ? 'bg-amber-50' : 'bg-emerald-50'}`}>
          <p className="text-[10px] text-slate-400 font-medium mb-0.5">Projected</p>
          <p className={`text-xs font-bold ${willExceed || isOverBudget ? 'text-amber-700' : 'text-emerald-700'}`}>SLE {fmtMoney(data.projected)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-400 font-medium mb-0.5">vs Last Month</p>
          <div className="flex items-center justify-center gap-1">
            {monthChange > 0 ? (
              <TrendingUp className="w-3 h-3 text-red-500" />
            ) : monthChange < 0 ? (
              <TrendingDown className="w-3 h-3 text-emerald-500" />
            ) : null}
            <p className={`text-xs font-bold ${monthChange > 0 ? 'text-red-600' : monthChange < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
              {monthChange === 0 ? '--' : `${monthChange > 0 ? '+' : ''}${monthChange.toFixed(0)}%`}
            </p>
          </div>
        </div>
      </div>

      {(willExceed || isOverBudget) && (
        <div className={`mt-3 flex items-center gap-2 p-3 rounded-xl text-xs ${
          isOverBudget ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
        }`}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {isOverBudget
            ? `You've exceeded your monthly budget by SLE ${fmtMoney(data.spent - data.budget)}.`
            : `At your current pace, you'll spend about SLE ${fmtMoney(data.projected)} this month.`
          }
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span>Day {data.daysElapsed} of {data.daysInMonth}</span>
          <span>{Math.round((data.daysElapsed / data.daysInMonth) * 100)}% of month elapsed</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-300 rounded-full transition-all duration-500"
            style={{ width: `${(data.daysElapsed / data.daysInMonth) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
