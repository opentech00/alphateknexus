import { useEffect, useState, useCallback } from 'react';
import {
  Gift, Search, Loader2, RefreshCw, Users, CheckCircle2,
  Clock, DollarSign,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard } from '../components/ui';

interface Referral {
  id: string;
  referrer_id: string;
  referral_code: string;
  referred_email: string | null;
  referred_id: string | null;
  status: string;
  reward_amount: number;
  completed_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number) {
  return `SLE ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-50' },
  completed: { label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  rewarded: { label: 'Rewarded', color: 'text-teal-700', bg: 'bg-teal-50' },
  expired: { label: 'Expired', color: 'text-slate-600', bg: 'bg-slate-100' },
};

export function ReferralsManagementPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, totalRewards: 0 });

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('referrals')
      .select('*, profiles!referrals_referrer_id_fkey(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(200);
    setReferrals((data as Referral[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadReferrals(); }, [loadReferrals]);

  useEffect(() => {
    setStats({
      total: referrals.length,
      completed: referrals.filter(r => r.status === 'completed' || r.status === 'rewarded').length,
      pending: referrals.filter(r => r.status === 'pending').length,
      totalRewards: referrals
        .filter(r => r.status === 'completed' || r.status === 'rewarded')
        .reduce((s, r) => s + Number(r.reward_amount), 0),
    });
  }, [referrals]);

  const filtered = referrals.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = r.profiles?.full_name || '';
      const email = r.profiles?.email || '';
      return name.toLowerCase().includes(q) ||
             email.toLowerCase().includes(q) ||
             (r.referral_code || '').toLowerCase().includes(q) ||
             (r.referred_email || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Referral Program"
        description="Track client referrals and reward payouts"
        icon={Gift}
        actions={
          <button
            onClick={loadReferrals}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL REFERRALS" value={String(stats.total)} icon={Gift} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="COMPLETED" value={String(stats.completed)} icon={CheckCircle2} color="text-teal-500" accent="bg-teal-50" />
        <StatCard label="PENDING" value={String(stats.pending)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
        <StatCard label="TOTAL REWARDS" value={fmtMoney(stats.totalRewards)} icon={DollarSign} color="text-blue-500" accent="bg-blue-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by referrer, code, or referred email…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="rewarded">Rewarded</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Gift className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No referrals found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Referrer</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden sm:table-cell">Code</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden md:table-cell">Referred</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden lg:table-cell">Reward</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(r => {
                  const meta = STATUS_META[r.status] || { label: r.status, color: 'text-slate-600', bg: 'bg-slate-100' };
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{r.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{r.profiles?.email || ''}</p>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        <span className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded">{r.referral_code || '-'}</span>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell text-slate-600 text-xs">{r.referred_email || '-'}</td>
                      <td className="px-5 py-3 hidden lg:table-cell text-right font-semibold text-slate-700">{fmtMoney(Number(r.reward_amount))}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell text-slate-400 text-xs">{formatDate(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
