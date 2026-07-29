import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Search, Loader2, X,
  Plus, TrendingUp, Users, Filter, CheckCircle2, CreditCard,
  RefreshCw, Smartphone, Landmark, Receipt as ReceiptIcon,
  Mail, Clock, Download, Send, Building2, Banknote,
  BarChart3, FileText, Shield,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard } from '../components/ui';
import { InvoicesTab } from './finance/InvoicesTab';
import { AnalyticsTab } from './finance/AnalyticsTab';
import { FxRatesTab } from './finance/FxRatesTab';
import { PayoutsTab } from './finance/PayoutsTab';
import { PermissionsTab } from './finance/PermissionsTab';
import { ReportsTab } from './finance/ReportsTab';
import { CashPaymentsTab } from './finance/CashPaymentsTab';

type Tab = 'wallet' | 'mobile-money' | 'debit-card' | 'bank-receipt' | 'analytics' | 'invoices' | 'fx-rates' | 'payouts' | 'cash-payments' | 'permissions' | 'reports';

interface ProfileMap {
  [userId: string]: { full_name: string | null; email: string | null };
}

function fmtMoney(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}SLE ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FinancePage() {
  const [tab, setTab] = useState<Tab>('wallet');

  const tabs: { id: Tab; label: string; icon: typeof Wallet }[] = [
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'mobile-money', label: 'Mobile Money', icon: Smartphone },
    { id: 'debit-card', label: 'Debit Card', icon: CreditCard },
    { id: 'bank-receipt', label: 'Bank Receipt', icon: Landmark },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'fx-rates', label: 'FX Rates', icon: TrendingUp },
    { id: 'payouts', label: 'Payouts', icon: Banknote },
    { id: 'cash-payments', label: 'Cash Payments', icon: Banknote },
    { id: 'permissions', label: 'Permissions', icon: Shield },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Finance Module"
        description="Manage all payments, wallets, and transactions in one place"
        icon={Wallet}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              tab === id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="animate-[fadeInUp_0.25s_ease]">
        {tab === 'wallet' && <WalletTab />}
        {tab === 'mobile-money' && <MobileMoneyTab />}
        {tab === 'debit-card' && <DebitCardTab />}
        {tab === 'bank-receipt' && <BankReceiptTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'invoices' && <InvoicesTab />}
        {tab === 'fx-rates' && <FxRatesTab />}
        {tab === 'payouts' && <PayoutsTab />}
        {tab === 'cash-payments' && <CashPaymentsTab />}
        {tab === 'permissions' && <PermissionsTab />}
        {tab === 'reports' && <ReportsTab />}
      </div>
    </div>
  );
}

/* ── Shared profile lookup ── */
async function loadProfiles(userIds: string[]): Promise<ProfileMap> {
  if (userIds.length === 0) return {};
  const unique = [...new Set(userIds)];
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', unique);
  const map: ProfileMap = {};
  (data || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email }; });
  return map;
}

/* ════════════════════════════════════════
   WALLET TAB
   ════════════════════════════════════════ */

interface WalletTxn {
  id: string; user_id: string; type: string; amount_sle: number;
  balance_after: number | null; description: string | null;
  method: string | null; reference: string | null; status: string;
  recorded_by: string; created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: typeof ArrowDownCircle }> = {
  topup:      { label: 'Top-Up',     color: 'text-emerald-600', bg: 'bg-emerald-50', icon: ArrowDownCircle },
  payment:    { label: 'Payment',    color: 'text-blue-600',   bg: 'bg-blue-50',   icon: ArrowUpCircle },
  refund:     { label: 'Refund',     color: 'text-teal-600',   bg: 'bg-teal-50',   icon: ArrowDownCircle },
  adjustment: { label: 'Adjustment', color: 'text-amber-600',  bg: 'bg-amber-50',  icon: TrendingUp },
};

const METHODS = [
  { id: 'cash', label: 'Cash' }, { id: 'bank_transfer', label: 'Bank Transfer' },
  { id: 'africell_money', label: 'Africell Money' }, { id: 'orange_money', label: 'Orange Money' },
  { id: 'qmoney', label: 'QMoney' }, { id: 'wallet', label: 'Wallet' },
  { id: 'admin', label: 'Admin Adjustment' },
];

function WalletTab() {
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);

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

  const [loadError, setLoadError] = useState('');
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { setLoadError(error.message); setTransactions([]); setLoading(false); return; }
    const rows = (data || []) as any[];
    const profileMap = await loadProfiles(rows.map(r => r.user_id).filter(Boolean));
    const enriched: WalletTxn[] = rows.map(r => ({
      ...r,
      profiles: profileMap[r.user_id] || { full_name: null, email: null },
    }));
    setTransactions(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const stats = useMemo(() => {
    const completed = transactions.filter(t => t.status === 'completed');
    const balance = completed.reduce((s, t) => s + Number(t.amount_sle), 0);
    const topUps = completed.filter(t => t.type === 'topup').reduce((s, t) => s + Number(t.amount_sle), 0);
    const payments = completed.filter(t => t.type === 'payment').reduce((s, t) => s + Math.abs(Number(t.amount_sle)), 0);
    const wallets = new Set(completed.map(t => t.user_id)).size;
    return { totalBalance: balance, totalTopUps: topUps, totalPayments: payments, activeWallets: wallets };
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
      user_id: addUserId, type: addType, amount_sle: sign, method: addMethod,
      reference: addReference.trim() || null,
      description: addDescription.trim() || `${TYPE_META[addType]?.label || addType} by admin`,
      status: 'completed', recorded_by: 'admin',
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
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load wallet data: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL WALLET BALANCE" value={fmtMoney(stats.totalBalance)} icon={Wallet} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="TOTAL TOP-UPS" value={fmtMoney(stats.totalTopUps)} icon={ArrowDownCircle} color="text-blue-500" accent="bg-blue-50" />
        <StatCard label="TOTAL PAYMENTS" value={fmtMoney(stats.totalPayments)} icon={ArrowUpCircle} color="text-teal-500" accent="bg-teal-50" />
        <StatCard label="ACTIVE WALLETS" value={String(stats.activeWallets)} icon={Users} color="text-amber-500" accent="bg-amber-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by client name, email, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="all">All Types</option>
            <option value="topup">Top-Ups</option>
            <option value="payment">Payments</option>
            <option value="refund">Refunds</option>
            <option value="adjustment">Adjustments</option>
          </select>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors text-sm whitespace-nowrap">
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </div>

      <DataTable
        loading={loading}
        empty={filtered.length === 0}
        emptyIcon={Wallet}
        emptyText="No transactions found"
        headers={
          <>
            <Th>Client</Th><Th>Type</Th><Th align="right">Amount</Th>
            <Th className="hidden sm:table-cell">Method</Th>
            <Th className="hidden md:table-cell">Reference</Th>
            <Th className="hidden lg:table-cell">Date</Th><Th align="center">Status</Th>
          </>
        }
      >
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
              <td className="px-5 py-3 hidden sm:table-cell text-slate-500 capitalize">{(t.method || '-').replace(/_/g, ' ')}</td>
              <td className="px-5 py-3 hidden md:table-cell text-slate-500 font-mono text-xs">{t.reference || '-'}</td>
              <td className="px-5 py-3 hidden lg:table-cell text-slate-400 text-xs">{formatDate(t.created_at)}</td>
              <td className="px-5 py-3 text-center">
                <StatusBadge status={t.status} />
              </td>
            </tr>
          );
        })}
      </DataTable>

      {showAddModal && (
        <Modal title="Add Transaction" icon={Plus} onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAddTransaction} className="space-y-4">
            {addError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{addError}</div>}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Client</label>
              <input type="text" value={userSearch} onChange={e => searchUsers(e.target.value)} placeholder="Search by name or email…"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              {userResults.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {userResults.map(u => (
                    <button key={u.id} type="button"
                      onClick={() => { setAddUserId(u.id); setUserSearch(`${u.full_name || u.email || ''}`); setUserResults([]); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                      <p className="text-sm font-medium text-slate-800">{u.full_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </button>
                  ))}
                </div>
              )}
              {addUserId && <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="w-4 h-4" /> User selected</div>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Transaction Type</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(TYPE_META).map(([id, meta]) => (
                  <button key={id} type="button" onClick={() => setAddType(id)}
                    className={`px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all ${addType === id ? `${meta.bg} border-current` : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>
            <LabeledInput label="Amount (SLE)" type="number" step="0.01" min="0.01" value={addAmount} onChange={setAddAmount} placeholder="0.00" />
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Payment Method</label>
              <select value={addMethod} onChange={e => setAddMethod(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none">
                {METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <LabeledInput label="Reference (optional)" value={addReference} onChange={setAddReference} placeholder="Receipt or transaction number" />
            <LabeledInput label="Description (optional)" value={addDescription} onChange={setAddDescription} placeholder="Note for this transaction" />
            <button type="submit" disabled={addSubmitting}
              className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {addSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {addSubmitting ? 'Saving…' : 'Confirm Transaction'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ════════════════════════════════════════
   MOBILE MONEY TAB (Monime)
   ════════════════════════════════════════ */

interface MonimePayment {
  id: string; user_id: string; reference: string; amount_sle: number;
  status: string; purpose: string; checkout_session_id: string | null;
  payment_id: string | null; paid_at: string | null; created_at: string;
  profile?: { full_name: string | null; email: string | null };
}

const PURPOSE_LABELS: Record<string, string> = {
  wallet_topup: 'Wallet Top-Up', invoice: 'Invoice Payment', subscription: 'Subscription',
};

function MobileMoneyTab() {
  const [payments, setPayments] = useState<MonimePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('monime_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { setLoadError(error.message); setPayments([]); setLoading(false); return; }
    const rows = (data || []) as any[];
    const profileMap = await loadProfiles(rows.map(r => r.user_id).filter(Boolean));
    const enriched: MonimePayment[] = rows.map(r => ({
      ...r, profile: profileMap[r.user_id] || { full_name: null, email: null },
    }));
    setPayments(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const stats = useMemo(() => {
    const completed = payments.filter(p => p.status === 'completed');
    const totalAmount = completed.reduce((s, p) => s + Number(p.amount_sle), 0);
    const pending = payments.filter(p => p.status === 'pending').length;
    const failed = payments.filter(p => p.status === 'failed' || p.status === 'cancelled').length;
    return { total: payments.length, totalAmount, pending, failed };
  }, [payments]);

  const filtered = payments.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = p.profile?.full_name || '';
      const email = p.profile?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load Monime payments: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL PAYMENTS" value={String(stats.total)} icon={Smartphone} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="COMPLETED AMOUNT" value={fmtMoney(stats.totalAmount)} icon={CheckCircle2} color="text-blue-500" accent="bg-blue-50" />
        <StatCard label="PENDING" value={String(stats.pending)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
        <StatCard label="FAILED / CANCELLED" value={String(stats.failed)} icon={X} color="text-red-500" accent="bg-red-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by client, email, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button onClick={loadPayments}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <DataTable loading={loading} empty={filtered.length === 0} emptyIcon={Smartphone} emptyText="No Monime payments yet"
        headers={
          <>
            <Th>Client</Th><Th>Reference</Th><Th>Purpose</Th>
            <Th align="right">Amount</Th><Th align="center">Status</Th>
            <Th className="hidden md:table-cell">Date</Th>
          </>
        }
      >
        {filtered.map(p => (
          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-5 py-3">
              <p className="font-medium text-slate-800">{p.profile?.full_name || 'Unknown'}</p>
              <p className="text-xs text-slate-400">{p.profile?.email || ''}</p>
            </td>
            <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.reference}</td>
            <td className="px-5 py-3 text-slate-600 capitalize">{(p.purpose || '').replace(/_/g, ' ')}</td>
            <td className="px-5 py-3 text-right font-bold text-slate-800">SLE {Number(p.amount_sle).toLocaleString()}</td>
            <td className="px-5 py-3 text-center"><StatusBadge status={p.status} /></td>
            <td className="px-5 py-3 hidden md:table-cell text-slate-400 text-xs">{formatDate(p.created_at)}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

/* ════════════════════════════════════════
   DEBIT CARD TAB
   ════════════════════════════════════════ */

interface CardPayment {
  id: string; user_id: string; receipt_number: string; reference: string;
  amount_sle: number; currency: string; purpose: string; description: string | null;
  payment_method: string; payment_id: string | null; paid_at: string;
  email_sent: boolean; recipient_email: string | null; created_at: string;
  profile?: { full_name: string | null; email: string | null };
}

function DebitCardTab() {
  const [payments, setPayments] = useState<CardPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('payment_receipts')
      .select('*')
      .eq('payment_method', 'card')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { setLoadError(error.message); setPayments([]); setLoading(false); return; }
    const rows = (data || []) as any[];
    const profileMap = await loadProfiles(rows.map(r => r.user_id).filter(Boolean));
    const enriched: CardPayment[] = rows.map(r => ({
      ...r, profile: profileMap[r.user_id] || { full_name: null, email: null },
    }));
    setPayments(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const stats = useMemo(() => {
    const totalAmount = payments.reduce((s, p) => s + Number(p.amount_sle), 0);
    return { total: payments.length, totalAmount };
  }, [payments]);

  const filtered = payments.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = p.profile?.full_name || '';
    const email = p.profile?.email || '';
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || p.receipt_number.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q);
  });

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load debit card payments: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="CARD PAYMENTS" value={String(stats.total)} icon={CreditCard} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="TOTAL AMOUNT" value={fmtMoney(stats.totalAmount)} icon={Banknote} color="text-blue-500" accent="bg-blue-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by client, receipt no, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <button onClick={loadPayments}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <DataTable loading={loading} empty={filtered.length === 0} emptyIcon={CreditCard} emptyText="No debit card payments found"
        headers={
          <>
            <Th>Receipt No.</Th><Th>Client</Th>
            <Th className="hidden sm:table-cell">Type</Th>
            <Th align="right">Amount</Th>
            <Th className="hidden md:table-cell">Date</Th>
          </>
        }
      >
        {filtered.map(p => (
          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-5 py-3">
              <p className="font-mono text-xs font-semibold text-slate-800">{p.receipt_number}</p>
              <p className="font-mono text-[10px] text-slate-400">{p.reference}</p>
            </td>
            <td className="px-5 py-3">
              <p className="font-medium text-slate-800">{p.profile?.full_name || 'Unknown'}</p>
              <p className="text-xs text-slate-400">{p.profile?.email || p.recipient_email || ''}</p>
            </td>
            <td className="px-5 py-3 hidden sm:table-cell">
              <span className="text-xs font-medium text-slate-600">{PURPOSE_LABELS[p.purpose] || p.purpose}</span>
            </td>
            <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoney(Number(p.amount_sle))}</td>
            <td className="px-5 py-3 hidden md:table-cell text-slate-400 text-xs">{formatDate(p.paid_at)}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

/* ════════════════════════════════════════
   BANK RECEIPT TAB (all receipts + manual bank/cheque)
   ════════════════════════════════════════ */

interface Receipt {
  id: string; user_id: string; receipt_number: string; reference: string;
  amount_sle: number; currency: string; purpose: string; description: string | null;
  payment_method: string; payment_id: string | null; paid_at: string;
  email_sent: boolean; email_sent_at: string | null; recipient_email: string | null;
  created_at: string;
  profile?: { full_name: string | null; email: string | null };
}

function BankReceiptTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [emailFilter, setEmailFilter] = useState('all');
  const [resendingId, setResendingId] = useState<string | null>(null);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('payment_receipts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { setLoadError(error.message); setReceipts([]); setLoading(false); return; }
    const rows = (data || []) as any[];
    const profileMap = await loadProfiles(rows.map(r => r.user_id).filter(Boolean));
    const enriched: Receipt[] = rows.map(r => ({
      ...r, profile: profileMap[r.user_id] || { full_name: null, email: null },
    }));
    setReceipts(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  const stats = useMemo(() => ({
    total: receipts.length,
    totalAmount: receipts.reduce((s, r) => s + Number(r.amount_sle), 0),
    emailsSent: receipts.filter(r => r.email_sent).length,
    pending: receipts.filter(r => !r.email_sent).length,
  }), [receipts]);

  const handleResendEmail = async (receiptId: string) => {
    setResendingId(receiptId);
    try {
      const { error } = await supabase.functions.invoke('send-payment-receipt', { body: { receiptId } });
      if (!error) {
        setReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, email_sent: true, email_sent_at: new Date().toISOString() } : r));
      }
    } catch { /* ignore */ }
    setResendingId(null);
  };

  const handleDownload = (r: Receipt) => {
    const html = buildPrintableReceipt(r);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `receipt-${r.receipt_number}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filtered = receipts.filter(r => {
    if (purposeFilter !== 'all' && r.purpose !== purposeFilter) return false;
    if (emailFilter === 'sent' && !r.email_sent) return false;
    if (emailFilter === 'pending' && r.email_sent) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = r.profile?.full_name || '';
      const email = r.profile?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || r.receipt_number.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load receipts: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL RECEIPTS" value={String(stats.total)} icon={ReceiptIcon} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="TOTAL AMOUNT" value={fmtMoney(stats.totalAmount)} icon={Banknote} color="text-blue-500" accent="bg-blue-50" />
        <StatCard label="EMAILS SENT" value={String(stats.emailsSent)} icon={Mail} color="text-teal-500" accent="bg-teal-50" />
        <StatCard label="EMAILS PENDING" value={String(stats.pending)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by client, receipt no, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <select value={purposeFilter} onChange={e => setPurposeFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
          <option value="all">All Types</option>
          <option value="wallet_topup">Wallet Top-Up</option>
          <option value="invoice">Invoice Payment</option>
          <option value="subscription">Subscription</option>
        </select>
        <select value={emailFilter} onChange={e => setEmailFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
          <option value="all">All Emails</option>
          <option value="sent">Email Sent</option>
          <option value="pending">Email Pending</option>
        </select>
        <button onClick={loadReceipts}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <DataTable loading={loading} empty={filtered.length === 0} emptyIcon={ReceiptIcon} emptyText="No receipts found"
        headers={
          <>
            <Th>Receipt No.</Th><Th>Client</Th>
            <Th className="hidden sm:table-cell">Type</Th>
            <Th align="right">Amount</Th><Th align="center">Email</Th>
            <Th className="hidden md:table-cell">Date</Th><Th align="center">Actions</Th>
          </>
        }
      >
        {filtered.map(r => (
          <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-5 py-3">
              <p className="font-mono text-xs font-semibold text-slate-800">{r.receipt_number}</p>
              <p className="font-mono text-[10px] text-slate-400">{r.reference}</p>
            </td>
            <td className="px-5 py-3">
              <p className="font-medium text-slate-800">{r.profile?.full_name || 'Unknown'}</p>
              <p className="text-xs text-slate-400">{r.profile?.email || r.recipient_email || ''}</p>
            </td>
            <td className="px-5 py-3 hidden sm:table-cell">
              <span className="text-xs font-medium text-slate-600">{PURPOSE_LABELS[r.purpose] || r.purpose}</span>
            </td>
            <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoney(Number(r.amount_sle))}</td>
            <td className="px-5 py-3 text-center">
              {r.email_sent ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Sent</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium"><Clock className="w-3.5 h-3.5" /> Pending</span>
              )}
            </td>
            <td className="px-5 py-3 hidden md:table-cell text-slate-400 text-xs">{formatDate(r.paid_at)}</td>
            <td className="px-5 py-3">
              <div className="flex items-center justify-center gap-1.5">
                <button onClick={() => handleDownload(r)} title="Download receipt"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={() => handleResendEmail(r.id)} disabled={resendingId === r.id} title="Resend email"
                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                  {resendingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

/* ════════════════════════════════════════
   SHARED COMPONENTS
   ════════════════════════════════════════ */

function Th({ children, align = 'left', className = '' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <th className={`px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider ${
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
    } ${className}`}>
      {children}
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'completed' ? 'bg-emerald-50 text-emerald-700'
    : status === 'pending' ? 'bg-amber-50 text-amber-700'
    : status === 'failed' || status === 'cancelled' ? 'bg-red-50 text-red-600'
    : 'bg-slate-100 text-slate-500';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}

function DataTable({
  loading, empty, emptyIcon: EmptyIcon, emptyText, headers, children,
}: {
  loading: boolean; empty: boolean; emptyIcon: typeof Wallet; emptyText: string;
  headers: React.ReactNode; children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="text-center py-16">
          <EmptyIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">{emptyText}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 bg-slate-50/50">{headers}</tr></thead>
          <tbody className="divide-y divide-slate-50">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function Modal({ title, icon: Icon, onClose, children }: { title: string; icon: typeof Plus; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function LabeledInput({ label, type = 'text', step, min, value, onChange, placeholder }: {
  label: string; type?: string; step?: string; min?: string;
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800 mb-1.5">{label}</label>
      <input type={type} step={step} min={min} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
    </div>
  );
}

function buildPrintableReceipt(r: Receipt): string {
  const purposeLabel = PURPOSE_LABELS[r.purpose] || r.purpose;
  const dateStr = new Date(r.paid_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${r.receipt_number}</title>
<style>body{font-family:sans-serif;background:#f1f5f9;margin:0;padding:40px}.r{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}.h{background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px 40px;text-align:center;color:#fff}.h h1{margin:0;font-size:22px}.h p{margin:6px 0 0;color:#94a3b8;font-size:13px}.c{text-align:center;padding:32px 40px 0}.c .ck{display:inline-block;width:56px;height:56px;background:#dcfce7;border-radius:50%;line-height:56px;font-size:28px}.c h2{margin:16px 0 4px;color:#0f172a;font-size:20px}.c p{margin:0;color:#64748b;font-size:14px}.a{text-align:center;padding:24px 40px}.a .l{color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px}.a .v{color:#059669;font-size:32px;font-weight:800;margin-top:8px}.d{padding:0 40px 24px}.d table{width:100%;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;border-collapse:collapse}.d td{padding:14px 20px;border-bottom:1px solid #e2e8f0;font-size:13px}.d td:last-child{text-align:right;font-weight:600;color:#0f172a}.d td:first-child{color:#64748b}.f{padding:0 40px 32px;text-align:center}.f p{color:#94a3b8;font-size:12px;line-height:1.6;margin:0}</style></head><body>
<div class="r"><div class="h"><h1>AlphaTek Nexus</h1><p>Payment Receipt</p></div>
<div class="c"><div class="ck">✓</div><h2>Payment Successful</h2><p>Your payment has been confirmed and processed.</p></div>
<div class="a"><div class="l">Amount Paid</div><div class="v">${r.currency} ${r.amount_sle.toLocaleString()}</div></div>
<div class="d"><table>
<tr><td>Receipt No.</td><td style="font-family:monospace">${r.receipt_number}</td></tr>
<tr><td>Reference</td><td style="font-family:monospace">${r.reference}</td></tr>
<tr><td>Type</td><td>${purposeLabel}</td></tr>
<tr><td>Description</td><td>${r.description || purposeLabel}</td></tr>
<tr><td>Payment Method</td><td style="text-transform:capitalize">${r.payment_method}</td></tr>
<tr><td>Transaction ID</td><td style="font-family:monospace">${r.payment_id || 'N/A'}</td></tr>
<tr><td>Date &amp; Time</td><td>${dateStr}</td></tr>
</table></div>
<div class="f"><p>This is an automated receipt for your payment on AlphaTek Nexus.<br/>Please keep this for your records.</p></div></div>
</body></html>`;
}
