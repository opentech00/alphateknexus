import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Banknote, CheckCircle2, Clock, Download, FileText,
  LayoutDashboard, Loader2, RefreshCw, Search, Smartphone, Wallet,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { StatCard } from '../../components/ui';
import { downloadCsv, sanitizeSearch, startOfTodayIso } from './financeCsv';

export type FinanceJumpTab =
  | 'wallet'
  | 'mobile-money'
  | 'payouts'
  | 'cash-payments'
  | 'invoices'
  | 'bank-receipt';

interface ProfileMap {
  [userId: string]: { full_name: string | null; email: string | null };
}

interface UnmatchedItem {
  id: string;
  rail: string;
  tab: FinanceJumpTab;
  client: string;
  email: string;
  reference: string;
  amount: number;
  status: string;
  date: string;
}

interface SearchHit {
  id: string;
  rail: string;
  client: string;
  email: string;
  reference: string;
  method: string;
  amount: number;
  status: string;
  date: string;
}

function fmtMoney(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}SLE ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function loadProfiles(userIds: string[]): Promise<ProfileMap> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', unique);
  const map: ProfileMap = {};
  (data || []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
    map[p.id] = { full_name: p.full_name, email: p.email };
  });
  return map;
}

function nameOf(map: ProfileMap, userId: string) {
  return map[userId]?.full_name || 'Unknown';
}

function emailOf(map: ProfileMap, userId: string) {
  return map[userId]?.email || '';
}

export function OverviewTab({ onOpenTab }: { onOpenTab: (tab: FinanceJumpTab) => void }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletPending, setWalletPending] = useState(0);
  const [monimeToday, setMonimeToday] = useState(0);
  const [cashCollected, setCashCollected] = useState(0);
  const [cashConfirmedToday, setCashConfirmedToday] = useState(0);
  const [payoutsQueued, setPayoutsQueued] = useState(0);
  const [payoutsPaidToday, setPayoutsPaidToday] = useState(0);
  const [invoiceOutstanding, setInvoiceOutstanding] = useState(0);
  const [unmatched, setUnmatched] = useState<UnmatchedItem[]>([]);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const today = startOfTodayIso();
    try {
      const [
        walletRes,
        walletPendingRes,
        monimeRes,
        cashRes,
        payoutRes,
        invoiceRes,
      ] = await Promise.all([
        supabase.from('wallet_transactions').select('amount_sle, status, recorded_by, user_id, reference, created_at, type, description').limit(2000),
        supabase.from('wallet_transactions').select('id, user_id, amount_sle, reference, status, created_at, recorded_by').eq('status', 'pending').limit(200),
        supabase.from('monime_payments').select('id, user_id, amount_sle, status, reference, created_at, paid_at').limit(500),
        supabase.from('payments').select('id, user_id, amount_sle, status, reference, created_at, confirmed_at, method').eq('method', 'cash').limit(500),
        supabase.from('withdrawal_requests').select('id, user_id, amount_sle, status, payout_status, reference, created_at, completed_at').limit(500),
        supabase.from('invoices').select('id, user_id, invoice_number, status, total, amount_paid, due_date, created_at').limit(500),
      ]);

      const errors = [walletRes, walletPendingRes, monimeRes, cashRes, payoutRes, invoiceRes]
        .map((r) => r.error?.message)
        .filter(Boolean);
      if (errors.length) {
        setLoadError(errors[0] as string);
        setLoading(false);
        return;
      }

      const walletRows = (walletRes.data || []) as any[];
      const pendingRows = (walletPendingRes.data || []) as any[];
      const monimeRows = (monimeRes.data || []) as any[];
      const cashRows = (cashRes.data || []) as any[];
      const payoutRows = (payoutRes.data || []) as any[];
      const invoiceRows = (invoiceRes.data || []) as any[];

      const completedWallet = walletRows.filter((r) => r.status === 'completed');
      setWalletBalance(completedWallet.reduce((s, r) => s + Number(r.amount_sle), 0));
      setWalletPending(pendingRows.reduce((s, r) => s + Number(r.amount_sle), 0));
      setMonimeToday(
        monimeRows
          .filter((r) => r.status === 'completed' && (r.paid_at || r.created_at) >= today)
          .reduce((s, r) => s + Number(r.amount_sle), 0),
      );
      const collectedCash = cashRows.filter((r) => r.status === 'collected');
      setCashCollected(collectedCash.reduce((s, r) => s + Number(r.amount_sle), 0));
      setCashConfirmedToday(
        cashRows
          .filter((r) => r.status === 'confirmed' && (r.confirmed_at || r.created_at) >= today)
          .reduce((s, r) => s + Number(r.amount_sle), 0),
      );
      const queuedPayouts = payoutRows.filter((r) => r.status === 'pending' || r.status === 'approved');
      setPayoutsQueued(queuedPayouts.reduce((s, r) => s + Number(r.amount_sle), 0));
      setPayoutsPaidToday(
        payoutRows
          .filter((r) => r.status === 'completed' && (r.completed_at || r.created_at) >= today)
          .reduce((s, r) => s + Number(r.amount_sle), 0),
      );
      setInvoiceOutstanding(
        invoiceRows
          .filter((r) => r.status === 'sent' || r.status === 'overdue')
          .reduce((s, r) => s + (Number(r.total) - Number(r.amount_paid)), 0),
      );

      const items: UnmatchedItem[] = [];
      pendingRows.forEach((r) => items.push({
        id: r.id, rail: 'Wallet', tab: 'wallet', client: r.user_id, email: '',
        reference: r.reference || r.id.slice(0, 8), amount: Number(r.amount_sle),
        status: 'pending approval', date: r.created_at,
      }));
      collectedCash.forEach((r) => items.push({
        id: r.id, rail: 'Cash', tab: 'cash-payments', client: r.user_id, email: '',
        reference: r.reference, amount: Number(r.amount_sle),
        status: 'collected, unconfirmed', date: r.created_at,
      }));
      cashRows.filter((r) => r.status === 'pending').forEach((r) => items.push({
        id: r.id, rail: 'Cash', tab: 'cash-payments', client: r.user_id, email: '',
        reference: r.reference, amount: Number(r.amount_sle),
        status: 'awaiting collection', date: r.created_at,
      }));
      payoutRows.filter((r) => r.status === 'approved' || r.payout_status === 'failed').forEach((r) => items.push({
        id: r.id, rail: 'Payout', tab: 'payouts', client: r.user_id, email: '',
        reference: r.reference || r.id.slice(0, 8), amount: Number(r.amount_sle),
        status: r.payout_status === 'failed' ? 'payout failed' : 'approved, not sent', date: r.created_at,
      }));
      invoiceRows.filter((r) => r.status === 'overdue').forEach((r) => items.push({
        id: r.id, rail: 'Invoice', tab: 'invoices', client: r.user_id, email: '',
        reference: r.invoice_number, amount: Number(r.total) - Number(r.amount_paid),
        status: 'overdue', date: r.due_date,
      }));
      monimeRows.filter((r) => r.status === 'pending').slice(0, 20).forEach((r) => items.push({
        id: r.id, rail: 'Monime', tab: 'mobile-money', client: r.user_id, email: '',
        reference: r.reference, amount: Number(r.amount_sle),
        status: 'pending', date: r.created_at,
      }));

      const profileMap = await loadProfiles(items.map((i) => i.client));
      setUnmatched(items.map((i) => ({
        ...i,
        client: nameOf(profileMap, i.client),
        email: emailOf(profileMap, i.client),
      })));
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load cash position');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = sanitizeSearch(search);
    if (q.length < 2) { setHits([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const like = `%${q}%`;
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .or(`full_name.ilike.${like},email.ilike.${like}`)
          .limit(40);
        const matchedIds = (profiles || []).map((p: { id: string }) => p.id);
        const profileMap: ProfileMap = {};
        (profiles || []).forEach((p: any) => { profileMap[p.id] = { full_name: p.full_name, email: p.email }; });

        const mergeById = (a: any[] = [], b: any[] = []) => {
          const map = new Map<string, any>();
          [...a, ...b].forEach((row) => { if (row?.id) map.set(row.id, row); });
          return [...map.values()];
        };
        const rows = (res: { data?: unknown }) => (Array.isArray(res.data) ? res.data : []) as any[];
        const byRef = (table: string, columns: string, refCol = 'reference') =>
          supabase.from(table).select(columns).ilike(refCol, like).limit(30);
        const byUser = (table: string, columns: string) => matchedIds.length
          ? supabase.from(table).select(columns).in('user_id', matchedIds).limit(30)
          : Promise.resolve({ data: [] as any[] });

        const [
          walletRef, walletUser, monimeRef, monimeUser, cashRef, cashUser,
          payoutRef, payoutUser, invRef, invUser, recRef, recNum, recUser,
        ] = await Promise.all([
          byRef('wallet_transactions', 'id, user_id, amount_sle, method, reference, status, created_at'),
          byUser('wallet_transactions', 'id, user_id, amount_sle, method, reference, status, created_at'),
          byRef('monime_payments', 'id, user_id, amount_sle, reference, status, created_at, purpose'),
          byUser('monime_payments', 'id, user_id, amount_sle, reference, status, created_at, purpose'),
          byRef('payments', 'id, user_id, amount_sle, method, reference, status, created_at'),
          byUser('payments', 'id, user_id, amount_sle, method, reference, status, created_at'),
          byRef('withdrawal_requests', 'id, user_id, amount_sle, payout_method, reference, status, created_at'),
          byUser('withdrawal_requests', 'id, user_id, amount_sle, payout_method, reference, status, created_at'),
          byRef('invoices', 'id, user_id, invoice_number, total, status, created_at', 'invoice_number'),
          byUser('invoices', 'id, user_id, invoice_number, total, status, created_at'),
          byRef('payment_receipts', 'id, user_id, receipt_number, reference, amount_sle, payment_method, created_at'),
          byRef('payment_receipts', 'id, user_id, receipt_number, reference, amount_sle, payment_method, created_at', 'receipt_number'),
          byUser('payment_receipts', 'id, user_id, receipt_number, reference, amount_sle, payment_method, created_at'),
        ]);

        const wallet = { data: mergeById(rows(walletRef), rows(walletUser)) };
        const monime = { data: mergeById(rows(monimeRef), rows(monimeUser)) };
        const cash = { data: mergeById(rows(cashRef), rows(cashUser)) };
        const payouts = { data: mergeById(rows(payoutRef), rows(payoutUser)) };
        const invoices = { data: mergeById(rows(invRef), rows(invUser)) };
        const receipts = { data: mergeById(mergeById(rows(recRef), rows(recNum)), rows(recUser)) };

        const extraIds = [
          ...(wallet.data || []), ...(monime.data || []), ...(cash.data || []),
          ...(payouts.data || []), ...(invoices.data || []), ...(receipts.data || []),
        ].map((r: any) => r.user_id);
        const extraMap = await loadProfiles(extraIds.filter((id) => !profileMap[id]));
        Object.assign(profileMap, extraMap);

        if (cancelled) return;
        const next: SearchHit[] = [];
        (wallet.data || []).forEach((r: any) => next.push({
          id: r.id, rail: 'Wallet', client: nameOf(profileMap, r.user_id), email: emailOf(profileMap, r.user_id),
          reference: r.reference || '', method: r.method || 'wallet', amount: Number(r.amount_sle),
          status: r.status, date: r.created_at,
        }));
        (monime.data || []).forEach((r: any) => next.push({
          id: r.id, rail: 'Monime', client: nameOf(profileMap, r.user_id), email: emailOf(profileMap, r.user_id),
          reference: r.reference, method: 'mobile_money', amount: Number(r.amount_sle),
          status: r.status, date: r.created_at,
        }));
        (cash.data || []).forEach((r: any) => next.push({
          id: r.id, rail: 'Cash', client: nameOf(profileMap, r.user_id), email: emailOf(profileMap, r.user_id),
          reference: r.reference, method: r.method, amount: Number(r.amount_sle),
          status: r.status, date: r.created_at,
        }));
        (payouts.data || []).forEach((r: any) => next.push({
          id: r.id, rail: 'Payout', client: nameOf(profileMap, r.user_id), email: emailOf(profileMap, r.user_id),
          reference: r.reference || '', method: r.payout_method, amount: Number(r.amount_sle),
          status: r.status, date: r.created_at,
        }));
        (invoices.data || []).forEach((r: any) => next.push({
          id: r.id, rail: 'Invoice', client: nameOf(profileMap, r.user_id), email: emailOf(profileMap, r.user_id),
          reference: r.invoice_number, method: 'invoice', amount: Number(r.total),
          status: r.status, date: r.created_at,
        }));
        (receipts.data || []).forEach((r: any) => next.push({
          id: r.id, rail: 'Receipt', client: nameOf(profileMap, r.user_id), email: emailOf(profileMap, r.user_id),
          reference: r.receipt_number || r.reference, method: r.payment_method, amount: Number(r.amount_sle),
          status: 'recorded', date: r.created_at,
        }));
        next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHits(next.slice(0, 80));
      } catch {
        if (!cancelled) setHits([]);
      }
      if (!cancelled) setSearching(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search]);

  const netToday = useMemo(
    () => monimeToday + cashConfirmedToday - payoutsPaidToday,
    [monimeToday, cashConfirmedToday, payoutsPaidToday],
  );

  const exportUnmatched = () => {
    downloadCsv(`finance-exceptions-${new Date().toISOString().slice(0, 10)}.csv`, unmatched.map((i) => ({
      rail: i.rail, client: i.client, email: i.email, reference: i.reference,
      amount_sle: i.amount, status: i.status, date: i.date,
    })));
  };

  const exportHits = () => {
    downloadCsv(`finance-search-${new Date().toISOString().slice(0, 10)}.csv`, hits.map((i) => ({
      rail: i.rail, client: i.client, email: i.email, reference: i.reference,
      method: i.method, amount_sle: i.amount, status: i.status, date: i.date,
    })));
  };

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load cash position: {loadError}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Today’s books</p>
          <p className="text-xs text-slate-500">Wallet vs Monime vs cash vs payouts, plus items that still need a second look.</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="WALLET LIABILITY" value={fmtMoney(walletBalance)} icon={Wallet} color="text-emerald-500" accent="bg-emerald-50" />
            <StatCard label="MONIME IN TODAY" value={fmtMoney(monimeToday)} icon={Smartphone} color="text-blue-500" accent="bg-blue-50" />
            <StatCard label="CASH CONFIRMED TODAY" value={fmtMoney(cashConfirmedToday)} icon={CheckCircle2} color="text-teal-500" accent="bg-teal-50" />
            <StatCard label="PAYOUTS SENT TODAY" value={fmtMoney(payoutsPaidToday)} icon={Banknote} color="text-amber-500" accent="bg-amber-50" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="NET TODAY" value={fmtMoney(netToday)} icon={LayoutDashboard} color="text-emerald-500" accent="bg-emerald-50" />
            <StatCard label="CASH UNCONFIRMED" value={fmtMoney(cashCollected)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
            <StatCard label="PAYOUTS QUEUED" value={fmtMoney(payoutsQueued)} icon={Banknote} color="text-red-500" accent="bg-red-50" />
            <StatCard label="INVOICES OUTSTANDING" value={fmtMoney(invoiceOutstanding)} icon={FileText} color="text-blue-500" accent="bg-blue-50" />
          </div>
          {walletPending !== 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              Wallet adjustments awaiting a second admin: {fmtMoney(walletPending)}.
            </div>
          )}
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all rails by client, email, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        {hits.length > 0 && (
          <button onClick={exportHits}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap">
            <Download className="w-4 h-4" /> Export results
          </button>
        )}
      </div>

      {searching && <p className="text-xs text-slate-400">Searching across wallet, Monime, cash, payouts, invoices, and receipts…</p>}

      {hits.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">
            Search results ({hits.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Rail</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Client</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Reference</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden sm:table-cell">Method</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Status</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {hits.map((h) => (
                  <tr key={`${h.rail}-${h.id}`} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-xs font-semibold text-slate-600">{h.rail}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{h.client}</p>
                      <p className="text-xs text-slate-400">{h.email}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{h.reference || '—'}</td>
                    <td className="px-5 py-3 hidden sm:table-cell text-xs text-slate-500 capitalize">{(h.method || '').replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoney(h.amount)}</td>
                    <td className="px-5 py-3 text-center text-xs capitalize">{h.status}</td>
                    <td className="px-5 py-3 hidden md:table-cell text-xs text-slate-400">{formatDate(h.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-slate-800">Unmatched / needs attention</p>
          </div>
          {unmatched.length > 0 && (
            <button onClick={exportUnmatched}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
        </div>
        {unmatched.length === 0 && !loading ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">Books are clear — nothing waiting to match.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Rail</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Client</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Reference</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Why</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {unmatched.map((i) => (
                  <tr key={`${i.rail}-${i.id}`} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-xs font-semibold text-slate-600">{i.rail}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{i.client}</p>
                      <p className="text-xs text-slate-400">{i.email}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{i.reference}</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoney(i.amount)}</td>
                    <td className="px-5 py-3 text-xs text-amber-700">{i.status}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => onOpenTab(i.tab)}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
