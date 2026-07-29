import { useEffect, useState, useCallback } from 'react';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Search, Loader2, X,
  Plus, TrendingUp, Users, DollarSign, Filter, CheckCircle2,
  CreditCard, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard } from '../components/ui';

interface Transaction {
  id: string;
  user_id: string;
  type: string;
  amount_sle: number;
  balance_after: number | null;
  description: string | null;
  method: string | null;
  reference: string | null;
  status: string;
  recorded_by: string;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: typeof ArrowDownCircle }> = {
  topup:      { label: 'Top-Up',    color: 'text-emerald-600', bg: 'bg-emerald-50', icon: ArrowDownCircle },
  payment:    { label: 'Payment',   color: 'text-blue-600',   bg: 'bg-blue-50',   icon: ArrowUpCircle },
  refund:     { label: 'Refund',    color: 'text-teal-600',   bg: 'bg-teal-50',   icon: ArrowDownCircle },
  adjustment: { label: 'Adjustment', color: 'text-amber-600',  bg: 'bg-amber-50',  icon: TrendingUp },
};

const METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
  { id: 'africell_money', label: 'Africell Money' },
  { id: 'orange_money', label: 'Orange Money' },
  { id: 'qmoney', label: 'QMoney' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'admin', label: 'Admin Adjustment' },
];

function fmtMoney(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}SLE ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function WalletManagementPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [stats, setStats] = useState({ totalBalance: 0, totalTopUps: 0, totalPayments: 0, activeWallets: 0 });

  // Add modal state
  const [addUserId, setAddUserId] = useState('');
  const [addType, setAddType] = useState('topup');
  const [addAmount, setAddAmount] = useState('');
  const [addMethod, setAddMethod] = useState('cash');
  const [addReference, setAddReference] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [monimePayments, setMonimePayments] = useState<MonimePayment[]>([]);
  const [monimeLoading, setMonimeLoading] = useState(false);

interface MonimePayment {
  id: string;
  reference: string;
  amount_sle: number;
  status: string;
  purpose: string;
  checkout_session_id: string | null;
  payment_id: string | null;
  paid_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('wallet_transactions')
      .select('*, profiles!wallet_transactions_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(200);
    setTransactions((data as Transaction[]) || []);
    setLoading(false);
  }, []);

  const loadMonimePayments = useCallback(async () => {
    setMonimeLoading(true);
    const { data } = await supabase
      .from('monime_payments')
      .select('*, profiles!monime_payments_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(100);
    setMonimePayments((data as MonimePayment[]) || []);
    setMonimeLoading(false);
  }, []);

  useEffect(() => { loadTransactions(); loadMonimePayments(); }, [loadTransactions, loadMonimePayments]);

  useEffect(() => {
    const completed = transactions.filter(t => t.status === 'completed');
    const balance = completed.reduce((s, t) => s + Number(t.amount_sle), 0);
    const topUps = completed.filter(t => t.type === 'topup').reduce((s, t) => s + Number(t.amount_sle), 0);
    const payments = completed.filter(t => t.type === 'payment').reduce((s, t) => s + Math.abs(Number(t.amount_sle)), 0);
    const wallets = new Set(completed.map(t => t.user_id)).size;
    setStats({ totalBalance: balance, totalTopUps: topUps, totalPayments: payments, activeWallets: wallets });
  }, [transactions]);

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    if (q.length < 2) { setUserResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    setUserResults(data || []);
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    const amt = parseFloat(addAmount);
    if (!addUserId) { setAddError('Select a user'); return; }
    if (!amt || amt <= 0) { setAddError('Enter a valid amount'); return; }
    setAddSubmitting(true);
    const sign = (addType === 'payment') ? -Math.abs(amt) : amt;
    const { error: err } = await supabase.from('wallet_transactions').insert({
      user_id: addUserId,
      type: addType,
      amount_sle: sign,
      method: addMethod,
      reference: addReference.trim() || null,
      description: addDescription.trim() || `${TYPE_META[addType]?.label || addType} by admin`,
      status: 'completed',
      recorded_by: 'admin',
    });
    setAddSubmitting(false);
    if (err) { setAddError(err.message); return; }
    setShowAddModal(false);
    setAddUserId(''); setAddAmount(''); setAddReference(''); setAddDescription(''); setUserSearch(''); setUserResults([]);
    loadTransactions();
  };

  const filtered = transactions.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = t.profiles?.full_name || '';
      const email = t.profiles?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || (t.reference || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title="Wallet & Payments"
        description="Manage client wallet balances and transactions"
        icon={Wallet}
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" /> Add Transaction
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL WALLET BALANCE" value={fmtMoney(stats.totalBalance)} icon={Wallet} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="TOTAL TOP-UPS" value={fmtMoney(stats.totalTopUps)} icon={ArrowDownCircle} color="text-blue-500" accent="bg-blue-50" />
        <StatCard label="TOTAL PAYMENTS" value={fmtMoney(stats.totalPayments)} icon={ArrowUpCircle} color="text-teal-500" accent="bg-teal-50" />
        <StatCard label="ACTIVE WALLETS" value={String(stats.activeWallets)} icon={Users} color="text-amber-500" accent="bg-amber-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client name, email, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="all">All Types</option>
            <option value="topup">Top-Ups</option>
            <option value="payment">Payments</option>
            <option value="refund">Refunds</option>
            <option value="adjustment">Adjustments</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Wallet className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Client</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Type</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Amount</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden sm:table-cell">Method</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden md:table-cell">Reference</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden lg:table-cell">Date</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(t => {
                  const meta = TYPE_META[t.type] ?? TYPE_META.adjustment;
                  const Icon = meta.icon;
                  const isCredit = Number(t.amount_sle) > 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{t.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{t.profiles?.email || ''}</p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 ${meta.bg} rounded-lg flex items-center justify-center`}>
                            <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                          </div>
                          <span className="font-medium text-slate-700">{meta.label}</span>
                          {t.recorded_by === 'admin' && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">admin</span>}
                        </div>
                      </td>
                      <td className={`px-5 py-3 text-right font-bold ${isCredit ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {isCredit ? '+' : ''}{fmtMoney(Number(t.amount_sle))}
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell text-slate-500 capitalize">
                        {(t.method || '-').replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell text-slate-500 font-mono text-xs">
                        {t.reference || '-'}
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell text-slate-400 text-xs">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                          t.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                          'bg-red-50 text-red-600'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Monime Payments Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-slate-800 text-sm">Monime Online Payments</h3>
            <span className="text-xs text-slate-400">({monimePayments.length})</span>
          </div>
          <button onClick={loadMonimePayments} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
            <RefreshCw className={`w-4 h-4 ${monimeLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {monimeLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          </div>
        ) : monimePayments.length === 0 ? (
          <div className="text-center py-10 px-5">
            <CreditCard className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No Monime payments yet</p>
            <p className="text-xs text-slate-400 mt-1">Online payments made via Monime will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Client</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Reference</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Purpose</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Amount</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monimePayments.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{p.profiles?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">{p.profiles?.email || ''}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.reference}</td>
                    <td className="px-5 py-3 text-slate-600 capitalize">{p.purpose.replace('_', ' ')}</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800">SLE {p.amount_sle.toLocaleString()}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        p.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                        p.status === 'failed' ? 'bg-red-50 text-red-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-400 text-xs">{formatDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Add Transaction</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleAddTransaction} className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
              {addError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{addError}</div>}
              {/* User search */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Client</label>
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => searchUsers(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                {userResults.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {userResults.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setAddUserId(u.id); setUserSearch(`${u.full_name || u.email || ''}`); setUserResults([]); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <p className="text-sm font-medium text-slate-800">{u.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </button>
                    ))}
                  </div>
                )}
                {addUserId && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" /> User selected
                  </div>
                )}
              </div>
              {/* Type */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Transaction Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(TYPE_META).map(([id, meta]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAddType(id)}
                      className={`px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                        addType === id ? `${meta.bg} border-current` : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Amount */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Amount (SLE)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={addAmount}
                  onChange={e => setAddAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              {/* Method */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Payment Method</label>
                <select
                  value={addMethod}
                  onChange={e => setAddMethod(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              {/* Reference */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Reference (optional)</label>
                <input
                  type="text"
                  value={addReference}
                  onChange={e => setAddReference(e.target.value)}
                  placeholder="Receipt or transaction number"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Description (optional)</label>
                <input
                  type="text"
                  value={addDescription}
                  onChange={e => setAddDescription(e.target.value)}
                  placeholder="Note for this transaction"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </form>
            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex-shrink-0">
              <button
                onClick={handleAddTransaction}
                disabled={addSubmitting}
                className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                {addSubmitting ? 'Saving…' : 'Confirm Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


