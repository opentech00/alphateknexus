import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Search, Loader2, X,
  Plus, TrendingUp, Filter, CheckCircle2, CreditCard,
  RefreshCw, Smartphone, Landmark, Receipt as ReceiptIcon,
  Clock, Download, Banknote,
  BarChart3, FileText, Shield, LayoutDashboard, AlertTriangle, Scale,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard } from '../components/ui';
import { PrivacyToggle, SensitiveValue } from '../../components/SensitiveValue';
import { maskEmail, maskReference, redactCsvValue } from '../../lib/sensitive';
import { useFinancePrivacy } from '../../contexts/FinancePrivacyContext';
import { OverviewTab } from './finance/OverviewTab';
import { InvoicesTab } from './finance/InvoicesTab';
import { AnalyticsTab } from './finance/AnalyticsTab';
import { FxRatesTab } from './finance/FxRatesTab';
import { PayoutsTab } from './finance/PayoutsTab';
import { PermissionsTab } from './finance/PermissionsTab';
import { ReportsTab } from './finance/ReportsTab';
import { ApprovalsTab } from './finance/ApprovalsTab';
import { CashPaymentsTab } from './finance/CashPaymentsTab';
import { MonimeUnmatchedInbox } from './finance/MonimeUnmatchedInbox';
import { FinanceReconTab } from './finance/FinanceReconTab';
import { FinanceOpsPlaybook } from './finance/FinanceOpsPlaybook';
import { downloadCsv } from './finance/financeCsv';
import { issueWalletCredit } from '../../lib/financeCredit';
import { ReceiptsTab } from './finance/ReceiptsTab';
import { BankDepositsTab } from './finance/BankDepositsTab';
import {
  downloadReceiptPdf, receiptHtml, shareReceipt, type OfficialReceipt,
} from './finance/receiptActions';
import { ReceiptRowActions, ViewReceiptModal } from './finance/ViewReceiptModal';
import { openPrintableHtml } from '../../lib/companyDocs';
import { toast } from '../../components/toast/toast';

type Tab = 'overview' | 'wallet' | 'mobile-money' | 'debit-card' | 'bank-receipt' | 'receipts' | 'analytics' | 'invoices' | 'fx-rates' | 'payouts' | 'approvals' | 'cash-payments' | 'permissions' | 'reports' | 'recon';

interface ProfileMap {
  [userId: string]: { full_name: string | null; email: string | null };
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FinancePage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const { privacy, setPrivacy } = useFinancePrivacy();

  const tabs: { id: Tab; label: string; icon: typeof Wallet }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'mobile-money', label: 'Mobile Money', icon: Smartphone },
    { id: 'debit-card', label: 'Debit Card', icon: CreditCard },
    { id: 'bank-receipt', label: 'Bank Deposits', icon: Landmark },
    { id: 'receipts', label: 'Receipts', icon: ReceiptIcon },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'fx-rates', label: 'FX Rates', icon: TrendingUp },
    { id: 'payouts', label: 'Payouts', icon: Banknote },
    { id: 'approvals', label: 'Approvals', icon: Shield },
    { id: 'cash-payments', label: 'Cash Payments', icon: Banknote },
    { id: 'permissions', label: 'Permissions', icon: Shield },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'recon', label: 'Recon', icon: Scale },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Finance Module"
        description="Manage all payments, wallets, and transactions in one place"
        icon={Wallet}
        actions={<PrivacyToggle on={privacy} onChange={setPrivacy} />}
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
        {tab === 'overview' && <OverviewTab onOpenTab={(next) => setTab(next)} onOpenLedgers={onNavigate ? () => onNavigate('finance-services') : undefined} />}
        {tab === 'wallet' && <WalletTab />}
        {tab === 'mobile-money' && <MobileMoneyTab />}
        {tab === 'debit-card' && <DebitCardTab />}
        {tab === 'bank-receipt' && <BankDepositsTab />}
        {tab === 'receipts' && <ReceiptsTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'invoices' && <InvoicesTab />}
        {tab === 'fx-rates' && <FxRatesTab />}
        {tab === 'payouts' && <PayoutsTab />}
        {tab === 'approvals' && <ApprovalsTab />}
        {tab === 'cash-payments' && <CashPaymentsTab />}
        {tab === 'permissions' && <PermissionsTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'recon' && <FinanceReconTab />}
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
  const { privacy, money } = useFinancePrivacy();
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
  }, []);

  const stats = useMemo(() => {
    const completed = transactions.filter(t => t.status === 'completed');
    const pending = transactions.filter(t => t.status === 'pending');
    const balance = completed.reduce((s, t) => s + Number(t.amount_sle), 0);
    const topUps = completed.filter(t => t.type === 'topup').reduce((s, t) => s + Number(t.amount_sle), 0);
    const payments = completed.filter(t => t.type === 'payment').reduce((s, t) => s + Math.abs(Number(t.amount_sle)), 0);
    const wallets = new Set(completed.map(t => t.user_id)).size;
    return { totalBalance: balance, totalTopUps: topUps, totalPayments: payments, activeWallets: wallets, pendingCount: pending.length };
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
    if ((addType === 'refund' || addType === 'adjustment') && addDescription.trim().length < 12) {
      setAddError('Refunds and adjustments need a written reason (at least 12 characters). This is the audited credit path — Monime has no refunds API.');
      return;
    }
    setAddSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddError('You must be signed in'); setAddSubmitting(false); return; }
    if (addType === 'refund' || addType === 'adjustment') {
      const result = await issueWalletCredit({
        userId: addUserId,
        amount: amt,
        kind: addType,
        reason: addDescription.trim(),
        idempotencyKey: addReference.trim() || null,
      });
      setAddSubmitting(false);
      if (!result.success) { setAddError(result.error); return; }
      setShowAddModal(false);
      setAddUserId(''); setAddAmount(''); setAddReference(''); setAddDescription(''); setUserSearch(''); setUserResults([]);
      loadTransactions();
      return;
    }
    const { data: canApprove } = await supabase.rpc('has_finance_permission', { perm: 'can_approve_withdrawals' });
    const { data: isSuper } = await supabase.rpc('is_super_admin');
    const sign = (addType === 'payment') ? -Math.abs(amt) : amt;
    if (!canApprove && !isSuper) {
      const { error: rpcErr } = await supabase.rpc('create_finance_approval', {
        p_kind: 'wallet_adjust',
        p_payload: {
          user_id: addUserId,
          type: addType,
          amount_sle: sign,
          method: addMethod,
          reference: addReference.trim() || null,
          description: addDescription.trim() || `${TYPE_META[addType]?.label || addType} by admin`,
        },
        p_related_id: null,
        p_note: addDescription.trim() || null,
        p_submit: true,
      });
      setAddSubmitting(false);
      if (rpcErr) { setAddError(rpcErr.message); return; }
      setShowAddModal(false);
      setAddUserId(''); setAddAmount(''); setAddReference(''); setAddDescription(''); setUserSearch(''); setUserResults([]);
      loadTransactions();
      return;
    }
    const { error: err } = await supabase.from('wallet_transactions').insert({
      user_id: addUserId, type: addType, amount_sle: sign, method: addMethod,
      reference: addReference.trim() || null,
      description: addDescription.trim() || `${TYPE_META[addType]?.label || addType} by admin`,
      status: 'pending', recorded_by: user.id,
    });
    setAddSubmitting(false);
    if (err) { setAddError(err.message); return; }
    setShowAddModal(false);
    setAddUserId(''); setAddAmount(''); setAddReference(''); setAddDescription(''); setUserSearch(''); setUserResults([]);
    loadTransactions();
  };

  const filtered = transactions.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = t.profiles?.full_name || '';
      const email = t.profiles?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || (t.reference || '').toLowerCase().includes(q);
    }
    return true;
  });

  const canApprove = (t: WalletTxn) =>
    t.status === 'pending' && !!currentUserId && t.recorded_by !== currentUserId;

  const handleReviewTxn = async (t: WalletTxn, next: 'completed' | 'failed') => {
    if (t.status !== 'pending') return;
    if (t.recorded_by === currentUserId) {
      setLoadError('Another admin must approve this wallet adjustment (dual control).');
      return;
    }
    setActionLoading(t.id);
    const { error } = await supabase.from('wallet_transactions').update({ status: next }).eq('id', t.id).eq('status', 'pending');
    if (error) setLoadError(error.message);
    setActionLoading(null);
    loadTransactions();
  };

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load wallet data: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL WALLET BALANCE" value={money(stats.totalBalance)} icon={Wallet} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="TOTAL TOP-UPS" value={money(stats.totalTopUps)} icon={ArrowDownCircle} color="text-blue-500" accent="bg-blue-50" />
        <StatCard label="TOTAL PAYMENTS" value={money(stats.totalPayments)} icon={ArrowUpCircle} color="text-teal-500" accent="bg-teal-50" />
        <StatCard label="PENDING APPROVAL" value={String(stats.pendingCount)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
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
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <button onClick={() => downloadCsv('wallet-transactions.csv', filtered.map(t => ({
          client: t.profiles?.full_name || '', email: redactCsvValue(privacy, 'email', t.profiles?.email || ''), type: t.type,
          amount_sle: redactCsvValue(privacy, 'amount', t.amount_sle), method: t.method, reference: redactCsvValue(privacy, 'reference', t.reference), status: t.status, date: t.created_at,
        })))}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap">
          <Download className="w-4 h-4" /> Export CSV
        </button>
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
            <Th align="center">Actions</Th>
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
                <p className="text-xs text-slate-400">
                  <SensitiveValue privacy={privacy} masked={maskEmail(t.profiles?.email)} full={t.profiles?.email || ''} />
                </p>
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 ${meta.bg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  </div>
                  <span className="font-medium text-slate-700">{meta.label}</span>
                  {(t.recorded_by === 'admin' || (t.recorded_by && t.recorded_by.length > 10)) && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">admin</span>
                  )}
                </div>
              </td>
              <td className={`px-5 py-3 text-right font-bold ${isCredit ? 'text-emerald-600' : 'text-slate-700'}`}>
                {isCredit ? '+' : ''}{money(Number(t.amount_sle))}
              </td>
              <td className="px-5 py-3 hidden sm:table-cell text-slate-500 capitalize">{(t.method || '-').replace(/_/g, ' ')}</td>
              <td className="px-5 py-3 hidden md:table-cell text-slate-500 font-mono text-xs">
                <SensitiveValue privacy={privacy} masked={maskReference(t.reference)} full={t.reference || '-'} mono />
              </td>
              <td className="px-5 py-3 hidden lg:table-cell text-slate-400 text-xs">{formatDate(t.created_at)}</td>
              <td className="px-5 py-3 text-center">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center justify-center gap-1.5">
                  {t.status === 'pending' && canApprove(t) && (
                    <>
                      <button onClick={() => handleReviewTxn(t, 'completed')} disabled={actionLoading === t.id} title="Approve"
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                        {actionLoading === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleReviewTxn(t, 'failed')} disabled={actionLoading === t.id} title="Reject"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {t.status === 'pending' && !canApprove(t) && (
                    <span className="text-[10px] text-amber-600 font-medium">Awaiting another admin</span>
                  )}
                  {t.status !== 'pending' && <span className="text-xs text-slate-300">—</span>}
                </div>
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
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              A second admin must approve this before it posts to the wallet.
            </p>
            <button type="submit" disabled={addSubmitting}
              className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {addSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {addSubmitting ? 'Saving…' : 'Submit for approval'}
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
  provider_id?: string | null; channel?: string | null; kind?: string | null;
  failure_code?: string | null; failure_reason?: string | null;
  profile?: { full_name: string | null; email: string | null };
}

const PURPOSE_LABELS: Record<string, string> = {
  wallet_topup: 'Wallet Top-Up', invoice: 'Invoice Payment', subscription: 'Subscription', booking: 'Booking Payment',
};

function MobileMoneyTab() {
  const { privacy, money } = useFinancePrivacy();
  const [payments, setPayments] = useState<MonimePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState('');

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
    const unmatched = payments.filter(p => p.status === 'pending' && Date.now() - new Date(p.created_at).getTime() > 15 * 60 * 1000).length;
    const failed = payments.filter(p => p.status === 'failed' || p.status === 'cancelled').length;
    return { total: payments.length, totalAmount, pending, unmatched, failed };
  }, [payments]);

  const filtered = payments.filter(p => {
    if (statusFilter === 'unmatched') {
      if (p.status !== 'pending' || Date.now() - new Date(p.created_at).getTime() <= 15 * 60 * 1000) return false;
    } else if (statusFilter !== 'all' && p.status !== statusFilter) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const name = p.profile?.full_name || '';
      const email = p.profile?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q);
    }
    return true;
  });

  const verifyWithMonime = async (p: MonimePayment) => {
    setVerifyingId(p.id);
    setVerifyMsg('');
    const { data, error } = await supabase.functions.invoke('verify-monime-payment', {
      body: { reference: p.reference },
    });
    if (error) {
      setVerifyMsg(error.message || 'Verify failed');
    } else {
      setVerifyMsg(`${p.reference}: ${data?.status || 'unknown'}`);
      await loadPayments();
    }
    setVerifyingId(null);
  };

  return (
    <>
      <FinanceOpsPlaybook variant="unmatched" />
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load Monime payments: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="TOTAL PAYMENTS" value={String(stats.total)} icon={Smartphone} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="COMPLETED AMOUNT" value={money(stats.totalAmount)} icon={CheckCircle2} color="text-blue-500" accent="bg-blue-50" />
        <StatCard label="PENDING" value={String(stats.pending)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
        <StatCard label="UNMATCHED >15M" value={String(stats.unmatched)} icon={AlertTriangle} color="text-orange-500" accent="bg-orange-50" />
        <StatCard label="FAILED / CANCELLED" value={String(stats.failed)} icon={X} color="text-red-500" accent="bg-red-50" />
      </div>

      <MonimeUnmatchedInbox onChanged={loadPayments} />

      {verifyMsg && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700">{verifyMsg}</div>
      )}

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
            <option value="unmatched">Unmatched pending (&gt;15 min)</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button onClick={() => downloadCsv('monime-payments.csv', filtered.map(p => ({
          client: p.profile?.full_name || '', email: p.profile?.email || '', reference: p.reference,
          purpose: p.purpose, amount_sle: p.amount_sle, status: p.status,
          failure_code: p.failure_code || '', failure_reason: p.failure_reason || '', date: p.created_at,
        })))}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap">
          <Download className="w-4 h-4" /> Export CSV
        </button>
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
            <Th className="hidden lg:table-cell">Failure</Th>
            <Th className="hidden md:table-cell">Date</Th>
            <Th align="right"> </Th>
          </>
        }
      >
        {filtered.map(p => {
          const stalePending = p.status === 'pending' && Date.now() - new Date(p.created_at).getTime() > 15 * 60 * 1000;
          const canVerify = p.status === 'pending' || p.status === 'failed' || p.status === 'cancelled';
          return (
          <tr key={p.id} className={`hover:bg-slate-50/50 transition-colors ${stalePending ? 'bg-amber-50/60' : ''}`}>
            <td className="px-5 py-3">
              <p className="font-medium text-slate-800">{p.profile?.full_name || 'Unknown'}</p>
              <p className="text-xs text-slate-400">
                <SensitiveValue privacy={privacy} masked={maskEmail(p.profile?.email)} full={p.profile?.email || ''} />
              </p>
            </td>
            <td className="px-5 py-3 font-mono text-xs text-slate-600">
              <SensitiveValue privacy={privacy} masked={maskReference(p.reference)} full={p.reference} mono />
              {(p.provider_id || p.channel) && (
                <p className="text-[10px] text-slate-400 mt-0.5">{[p.channel, p.provider_id].filter(Boolean).join(' · ')}</p>
              )}
              {(p.status === 'failed' || p.status === 'cancelled') && p.failure_reason && (
                <p className="lg:hidden text-[10px] text-red-600 mt-1 line-clamp-2">{p.failure_reason}</p>
              )}
            </td>
            <td className="px-5 py-3 text-slate-600 capitalize">
              {(p.purpose || '').replace(/_/g, ' ')}
              {p.kind && p.kind !== 'full' && <span className="ml-1 text-[10px] font-semibold uppercase text-slate-400">{p.kind}</span>}
            </td>
            <td className="px-5 py-3 text-right font-bold text-slate-800">{money(Number(p.amount_sle))}</td>
            <td className="px-5 py-3 text-center"><StatusBadge status={p.status} /></td>
            <td className="px-5 py-3 hidden lg:table-cell text-xs text-slate-500 max-w-[220px]">
              {(p.status === 'failed' || p.status === 'cancelled') ? (
                <>
                  {p.failure_code && (
                    <p className="font-semibold uppercase tracking-wide text-[10px] text-red-600 mb-0.5">
                      {p.failure_code.replace(/_/g, ' ')}
                    </p>
                  )}
                  <p className="line-clamp-2">{p.failure_reason || '—'}</p>
                </>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </td>
            <td className="px-5 py-3 hidden md:table-cell text-slate-400 text-xs">{formatDate(p.created_at)}</td>
            <td className="px-5 py-3 text-right">
              {canVerify && (
                <button
                  type="button"
                  onClick={() => void verifyWithMonime(p)}
                  disabled={verifyingId === p.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-white disabled:opacity-50"
                >
                  {verifyingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                  Verify with Monime
                </button>
              )}
            </td>
          </tr>
          );
        })}
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
  const { privacy, money } = useFinancePrivacy();
  const [payments, setPayments] = useState<CardPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [viewReceipt, setViewReceipt] = useState<OfficialReceipt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
        <StatCard label="TOTAL AMOUNT" value={money(stats.totalAmount)} icon={Banknote} color="text-blue-500" accent="bg-blue-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by client, receipt no, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <button onClick={() => downloadCsv('debit-card-payments.csv', filtered.map(p => ({
          receipt_number: p.receipt_number, client: p.profile?.full_name || '', email: p.profile?.email || '',
          purpose: p.purpose, amount_sle: p.amount_sle, reference: p.reference, date: p.paid_at,
        })))}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap">
          <Download className="w-4 h-4" /> Export CSV
        </button>
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
            <Th align="center">Actions</Th>
          </>
        }
      >
        {filtered.map(p => (
          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-5 py-3">
              <button type="button" onClick={() => setViewReceipt(p)} className="font-mono text-xs font-semibold text-slate-800 hover:text-emerald-700 hover:underline">
                {p.receipt_number}
              </button>
              <p className="font-mono text-[10px] text-slate-400">
                <SensitiveValue privacy={privacy} masked={maskReference(p.reference)} full={p.reference} mono />
              </p>
            </td>
            <td className="px-5 py-3">
              <p className="font-medium text-slate-800">{p.profile?.full_name || 'Unknown'}</p>
              <p className="text-xs text-slate-400">
                <SensitiveValue privacy={privacy} masked={maskEmail(p.profile?.email || p.recipient_email)} full={p.profile?.email || p.recipient_email || ''} />
              </p>
            </td>
            <td className="px-5 py-3 hidden sm:table-cell">
              <span className="text-xs font-medium text-slate-600">{PURPOSE_LABELS[p.purpose] || p.purpose}</span>
            </td>
            <td className="px-5 py-3 text-right font-bold text-slate-800">{money(Number(p.amount_sle))}</td>
            <td className="px-5 py-3 hidden md:table-cell text-slate-400 text-xs">{formatDate(p.paid_at)}</td>
            <td className="px-5 py-3">
              <ReceiptRowActions
                receipt={p}
                busy={busy}
                onView={() => setViewReceipt(p)}
                onDownload={() => { setBusy(`pdf-${p.id}`); void downloadReceiptPdf(p).finally(() => setBusy(null)); }}
                onPrint={() => openPrintableHtml(receiptHtml(p), `receipt-${p.receipt_number}.html`)}
                onShare={() => { setBusy(`share-${p.id}`); void shareReceipt(p).finally(() => setBusy(null)); }}
                onEmail={async () => {
                  setBusy(p.id);
                  const { error } = await supabase.functions.invoke('send-payment-receipt', { body: { receiptId: p.id } });
                  if (error) toast.error(error.message);
                  else toast.success(`Sent ${p.receipt_number}`);
                  setBusy(null);
                }}
              />
            </td>
          </tr>
        ))}
      </DataTable>
      {viewReceipt && (
        <ViewReceiptModal
          receipt={viewReceipt}
          onClose={() => setViewReceipt(null)}
          emailing={busy === viewReceipt.id}
          onEmail={() => {
            setBusy(viewReceipt.id);
            void supabase.functions.invoke('send-payment-receipt', { body: { receiptId: viewReceipt.id } })
              .then(({ error }) => { if (error) toast.error(error.message); else toast.success(`Sent ${viewReceipt.receipt_number}`); })
              .finally(() => setBusy(null));
          }}
        />
      )}
    </>
  );
}

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
