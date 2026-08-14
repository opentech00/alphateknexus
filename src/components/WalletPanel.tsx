import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Wallet, Plus, ArrowDownCircle, ArrowUpCircle, Loader2, X,
  CreditCard, Receipt, History, TrendingUp, Smartphone,
  Trash2, AlertTriangle, XCircle, CheckCircle2, ExternalLink,
  ShoppingBag, RefreshCw, Banknote, Landmark, Clock, ShieldCheck, KeyRound,
  Search, Download, Filter, Calendar, Settings, Bell, MessageSquare, Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createMonimeCheckout, pollPaymentStatus } from '../lib/monime';
import { ReceiptModal } from './ReceiptModal';
import { WalletSettings } from './WalletSettings';
import { DisputeModal } from './DisputeModal';

interface Transaction {
  id: string;
  type: string;
  amount_sle: number;
  balance_after: number | null;
  description: string | null;
  method: string | null;
  reference: string | null;
  status: string;
  recorded_by: string;
  created_at: string;
}

type PaymentState = 'idle' | 'form' | 'opening' | 'waiting' | 'success' | 'failed' | 'cash_pending';
type TopupMethod = 'monime' | 'cash';

const TYPE_META: Record<string, { label: string; icon: typeof ArrowDownCircle; color: string; bg: string }> = {
  topup:      { label: 'Top-Up',     icon: ArrowDownCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  payment:    { label: 'Payment',    icon: ArrowUpCircle,   color: 'text-blue-600',    bg: 'bg-blue-50' },
  refund:     { label: 'Refund',     icon: ArrowDownCircle, color: 'text-teal-600',    bg: 'bg-teal-50' },
  adjustment: { label: 'Adjustment', icon: TrendingUp,     color: 'text-amber-600',   bg: 'bg-amber-50' },
};

function fmtMoney(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}SLE ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function TransactionRow({ t, onReceipt, onDispute }: { t: Transaction; onReceipt?: (t: Transaction) => void; onDispute?: (t: Transaction) => void }) {
  const meta = TYPE_META[t.type] ?? TYPE_META.adjustment;
  const Icon = meta.icon;
  const isCredit = Number(t.amount_sle) > 0;
  const amountColor = isCredit ? 'text-emerald-600' : 'text-slate-700';
  const statusBg = t.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600';

  return (
    <div className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50/80 transition-colors">
      <div className={`w-10 h-10 ${meta.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${meta.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
          {t.status !== 'completed' && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusBg}`}>
              {t.status}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 truncate mt-0.5">
          {t.description || meta.label}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
          <span>{formatDate(t.created_at)}</span>
          <span className="w-0.5 h-0.5 bg-slate-300 rounded-full" />
          <span>{formatTime(t.created_at)}</span>
          {t.method === 'monime' && (
            <>
              <span className="w-0.5 h-0.5 bg-slate-300 rounded-full" />
              <span>Monime</span>
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {t.status === 'completed' && t.type === 'payment' && onDispute && (
          <button
            onClick={() => onDispute(t)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Report issue"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}
        {t.status === 'completed' && onReceipt && (
          <button
            onClick={() => onReceipt(t)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            title="View receipt"
          >
            <Receipt className="w-4 h-4" />
          </button>
        )}
        <div className="text-right">
          <p className={`text-sm font-bold ${amountColor}`}>
            {isCredit ? '+' : ''}{fmtMoney(Number(t.amount_sle))}
          </p>
          {t.balance_after != null && (
            <p className="text-[10px] text-slate-400 mt-0.5">Bal: {fmtMoney(Number(t.balance_after))}</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface WalletPanelProps {
  onChooseService?: () => void;
}

export function WalletPanel({ onChooseService }: WalletPanelProps = {}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fxRates, setFxRates] = useState<{currency_code:string;symbol:string;rate_to_sle:number}[]>([]);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);

  const [payState, setPayState] = useState<PaymentState>('idle');
  const [topupMethod, setTopupMethod] = useState<TopupMethod>('monime');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [payReference, setPayReference] = useState('');
  const [pollAttempt, setPollAttempt] = useState(0);
  const [failReason, setFailReason] = useState('');
  const [successProgress, setSuccessProgress] = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptRef, setReceiptRef] = useState('');
  const [retriesLeft, setRetriesLeft] = useState(3);
  const [retrying, setRetrying] = useState(false);
  const [balancePulse, setBalancePulse] = useState(false);
  const prevBalanceRef = useRef(0);
  const popupRef = useRef<Window | null>(null);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');
  const [txDateFrom, setTxDateFrom] = useState('');
  const [txDateTo, setTxDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const pollCancelledRef = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [disputeTransaction, setDisputeTransaction] = useState<Transaction | null>(null);
  const [walletPrefs, setWalletPrefs] = useState<{ low_balance_threshold: number; auto_topup_enabled: boolean; auto_topup_amount: number; monthly_budget: number } | null>(null);
  const [savedMethods, setSavedMethods] = useState<{ id: string; type: string; provider: string; label: string; detail: string; is_default: boolean }[]>([]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError('Failed to load wallet. Tap refresh to try again.');
    } else {
      setTransactions((data as Transaction[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.from('fx_rates').select('currency_code, symbol, rate_to_sle').eq('is_active', true).neq('currency_code', 'SLE')
      .then(({ data }: { data: {currency_code:string;symbol:string;rate_to_sle:number}[] | null }) => setFxRates(data || []));
  }, []);

  useEffect(() => {
    loadTransactions();

    // Realtime: auto-refresh when wallet transactions are inserted or updated
    const channel = supabase
      .channel('wallet-transactions-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wallet_transactions' },
        () => loadTransactions(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallet_transactions' },
        () => loadTransactions(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadTransactions]);

  const loadWalletPrefs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [prefRes, methodRes] = await Promise.all([
      supabase.from('user_preferences').select('low_balance_threshold, auto_topup_enabled, auto_topup_amount, monthly_budget').eq('user_id', user.id).maybeSingle(),
      supabase.from('payment_methods').select('id, type, provider, label, detail, is_default').eq('user_id', user.id).order('is_default', { ascending: false }),
    ]);
    if (prefRes.data) setWalletPrefs(prefRes.data as any);
    setSavedMethods(methodRes.data || []);
  }, []);

  useEffect(() => { loadWalletPrefs(); }, [loadWalletPrefs]);

  const loadWithdrawals = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setWithdrawals([]); return; }
    const { data } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setWithdrawals(data || []);
  }, []);

  useEffect(() => {
    loadWithdrawals();

    const channel = supabase
      .channel('withdrawal-requests-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawal_requests' },
        () => loadWithdrawals(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadWithdrawals]);

  const pendingWithdrawalTotal = withdrawals
    .filter(w => w.status === 'pending' || w.status === 'approved')
    .reduce((sum, w) => sum + Number(w.amount_sle), 0);

  const balance = transactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + Number(t.amount_sle), 0);

  const availableBalance = Math.max(0, balance - pendingWithdrawalTotal);

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      result = result.filter(t =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.reference || '').toLowerCase().includes(q) ||
        (t.type || '').toLowerCase().includes(q) ||
        (t.method || '').toLowerCase().includes(q)
      );
    }
    if (txTypeFilter !== 'all') {
      result = result.filter(t => t.type === txTypeFilter);
    }
    if (txDateFrom) {
      const from = new Date(txDateFrom); from.setHours(0, 0, 0, 0);
      result = result.filter(t => new Date(t.created_at) >= from);
    }
    if (txDateTo) {
      const to = new Date(txDateTo); to.setHours(23, 59, 59, 999);
      result = result.filter(t => new Date(t.created_at) <= to);
    }
    return result;
  }, [transactions, txSearch, txTypeFilter, txDateFrom, txDateTo]);

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Description', 'Amount (SLE)', 'Status', 'Method', 'Reference', 'Balance After'];
    const rows = filteredTransactions.map(t => [
      new Date(t.created_at).toISOString(),
      t.type || '',
      (t.description || '').replace(/,/g, ';'),
      Number(t.amount_sle).toFixed(2),
      t.status || '',
      t.method || '',
      t.reference || '',
      t.balance_after != null ? Number(t.balance_after).toFixed(2) : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (prevBalanceRef.current !== 0 && prevBalanceRef.current !== availableBalance) {
      setBalancePulse(true);
      const t = setTimeout(() => setBalancePulse(false), 800);
      return () => clearTimeout(t);
    }
    prevBalanceRef.current = availableBalance;
  }, [availableBalance]);

  const totalTopUps = transactions
    .filter(t => t.type === 'topup' && t.status === 'completed')
    .reduce((sum, t) => sum + Number(t.amount_sle), 0);

  const totalSpent = transactions
    .filter(t => t.type === 'payment' && t.status === 'completed')
    .reduce((sum, t) => sum + Math.abs(Number(t.amount_sle)), 0);

  useEffect(() => {
    if (payState !== 'success') return;
    setAnimDone(false);
    const start = Date.now();
    const duration = 3000;
    let frame: number;
    const animate = () => {
      const pct = Math.min((Date.now() - start) / duration, 1);
      setSuccessProgress(pct);
      if (pct < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        setAnimDone(true);
      }
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [payState]);

  useEffect(() => {
    return () => {
      pollCancelledRef.current = true;
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    };
  }, []);

  const handleStartPayment = async () => {
    setError('');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt < 5) { setError('Minimum top-up is SLE 5.00'); return; }
    if (amt > 10000) { setError('Maximum top-up is SLE 10,000.00'); return; }

    if (topupMethod === 'cash') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Please sign in to request a cash top-up.'); return; }
      const { error: payErr } = await supabase.from('payments').insert({
        user_id: user.id,
        payable_type: 'wallet_topup',
        amount_sle: amt,
        method: 'cash',
        status: 'pending',
      });
      if (payErr) { setError(payErr.message); return; }
      setPayReference('');
      setPayState('cash_pending');
      return;
    }

    setPayState('opening');
    try {
      const result = await createMonimeCheckout(amt, 'wallet_topup');
      setPayReference(result.reference);

      const popup = window.open(result.checkoutUrl, '_blank', 'width=500,height=700,scrollbars=yes');
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site and try again.');
      }
      popupRef.current = popup;

      setPayState('waiting');
      setPollAttempt(0);
      pollCancelledRef.current = false;

      const pollResult = await pollPaymentStatus(
        result.reference,
        (_status, attempt) => setPollAttempt(attempt),
      );

      if (pollCancelledRef.current) return;

      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }

      if (pollResult.status === 'completed') {
        setPayState('success');
        setRetriesLeft(3);
        await loadTransactions();
        // Safety net: re-load after 3s in case the insert was still in-flight
        setTimeout(() => loadTransactions(), 3000);
      } else if (pollResult.status === 'failed' || pollResult.status === 'cancelled') {
        setFailReason(pollResult.reason || 'Payment was not completed.');
        setPayState('failed');
      } else {
        setFailReason('Payment is still pending. Click retry to check again, or view your wallet if it was already credited.');
        setPayState('failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initiate payment. Please try again.');
      setPayState('form');
    }
  };

  const handleRetry = async () => {
    if (retriesLeft <= 0 || !payReference) return;
    setRetrying(true);
    setRetriesLeft(prev => prev - 1);
    setPayState('waiting');
    setPollAttempt(0);
    pollCancelledRef.current = false;

    const pollResult = await pollPaymentStatus(
      payReference,
      (_status, attempt) => setPollAttempt(attempt),
    );

    if (pollCancelledRef.current) return;
    setRetrying(false);

    if (pollResult.status === 'completed') {
      setPayState('success');
      setRetriesLeft(3);
      await loadTransactions();
      setTimeout(() => loadTransactions(), 3000);
    } else if (pollResult.status === 'failed' || pollResult.status === 'cancelled') {
      setFailReason(pollResult.reason || 'Payment was not completed.');
      setPayState('failed');
    } else {
      setFailReason('Payment is still pending. Click retry to check again, or view your wallet if it was already credited.');
      setPayState('failed');
    }
  };

  const handleClosePayment = () => {
    pollCancelledRef.current = true;
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    setPayState('idle');
    setTopupMethod('monime');
    setAmount('');
    setError('');
    setPayReference('');
    setFailReason('');
    setSuccessProgress(0);
    setAnimDone(false);
    setShowReceipt(false);
    setReceiptRef('');
    setRetriesLeft(3);
  };

  const handleDeleteHistory = async () => {
    setDeleting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setDeleting(false); return; }
    // Only delete own pending/failed transactions — completed transactions are immutable for audit
    const deletableIds = transactions
      .filter(t => t.status === 'pending' || t.status === 'failed')
      .map(t => t.id);
    if (deletableIds.length > 0) {
      await supabase.from('wallet_transactions')
        .delete()
        .in('id', deletableIds)
        .eq('user_id', user.id);
    }
    setDeleting(false);
    setShowDeleteConfirm(false);
    await loadTransactions();
  };

  const circumference = 2 * Math.PI * 52;
  const strokeDash = circumference * successProgress;

  return (
    <div className="space-y-5">
      {/* Balance Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 rounded-2xl p-6 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-teal-500/5 to-transparent rounded-tr-full" />
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Available Balance</p>
              <p className={`text-4xl font-bold tracking-tight transition-all duration-500 ${balancePulse ? 'scale-110 text-emerald-300' : 'scale-100'}`}>{fmtMoney(availableBalance)}</p>
              {pendingWithdrawalTotal > 0 && (
                <p className="text-xs text-amber-400 mt-1">
                  {fmtMoney(pendingWithdrawalTotal)} in pending withdrawals
                </p>
              )}
              {fxRates.length > 0 && availableBalance > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {fxRates.slice(0, 3).map(r => (
                    <span key={r.currency_code} className="text-xs text-slate-400">
                      ≈ {r.symbol}{(availableBalance / r.rate_to_sle).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.currency_code}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/10 hover:bg-white/20 transition-colors"
                title="Wallet Settings"
              >
                <Settings className="w-4 h-4 text-slate-300" />
              </button>
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/10">
                <Wallet className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setPayState('form'); setError(''); }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-400 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/25"
            >
              <Plus className="w-4 h-4" /> Top Up
            </button>
            <button
              onClick={() => setShowWithdraw(true)}
              disabled={availableBalance <= 0}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-all active:scale-[0.98] border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Banknote className="w-4 h-4" /> Withdraw
            </button>
          </div>
        </div>
      </div>

      {/* Low Balance Alert */}
      {walletPrefs && walletPrefs.low_balance_threshold > 0 && availableBalance < walletPrefs.low_balance_threshold && availableBalance >= 0 && (
        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl animate-in fade-in duration-500">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Low Balance</p>
            <p className="text-xs text-amber-600">Your balance is below {fmtMoney(walletPrefs.low_balance_threshold)}</p>
          </div>
          {walletPrefs.auto_topup_enabled ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg font-medium flex-shrink-0">
              <Zap className="w-3 h-3" /> Auto top-up on
            </div>
          ) : (
            <button
              onClick={() => { setPayState('form'); setError(''); }}
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              Top Up Now
            </button>
          )}
        </div>
      )}

      {/* Mini Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <ArrowDownCircle className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium mb-0.5">Total Top-Ups</p>
          <p className="text-lg font-bold text-slate-900">{fmtMoney(totalTopUps)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <ArrowUpCircle className="w-4 h-4 text-blue-500" />
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium mb-0.5">Total Spent</p>
          <p className="text-lg font-bold text-slate-900">{fmtMoney(totalSpent)}</p>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-slate-800 text-sm">Transaction History</h3>
            {filteredTransactions.length > 0 && (
              <span className="text-[10px] bg-slate-100 text-slate-500 font-medium px-2 py-0.5 rounded-full">
                {filteredTransactions.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${showFilters || txTypeFilter !== 'all' || txDateFrom || txDateTo ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
            </button>
            <button
              onClick={exportCSV}
              disabled={filteredTransactions.length === 0}
              className="flex items-center gap-1.5 text-xs text-slate-500 font-medium hover:text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => loadTransactions()}
              className="flex items-center gap-1.5 text-xs text-slate-500 font-medium hover:text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        {showFilters && (
          <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
                placeholder="Search by description, reference, type..."
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={txTypeFilter}
                onChange={e => setTxTypeFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="all">All Types</option>
                <option value="topup">Top-Ups</option>
                <option value="payment">Payments</option>
                <option value="withdrawal">Withdrawals</option>
                <option value="refund">Refunds</option>
                <option value="adjustment">Adjustments</option>
              </select>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="date"
                  value={txDateFrom}
                  onChange={e => setTxDateFrom(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={txDateTo}
                  onChange={e => setTxDateTo(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              {(txSearch || txTypeFilter !== 'all' || txDateFrom || txDateTo) && (
                <button
                  onClick={() => { setTxSearch(''); setTxTypeFilter('all'); setTxDateFrom(''); setTxDateTo(''); }}
                  className="text-xs text-slate-500 hover:text-red-500 font-medium px-2 py-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              <p className="text-xs text-slate-400">Loading transactions...</p>
            </div>
          </div>
        ) : loadError ? (
          <div className="text-center py-12 px-5">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-sm text-slate-600 font-semibold">Failed to load</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">{loadError}</p>
            <button
              onClick={() => loadTransactions()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12 px-5">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm text-slate-600 font-semibold">{transactions.length === 0 ? 'No transactions yet' : 'No matching transactions'}</p>
            <p className="text-xs text-slate-400 mt-1">{transactions.length === 0 ? 'Top up your wallet to see your transaction history here.' : 'Try adjusting your search or filters.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
            {filteredTransactions.map(t => (
              <TransactionRow key={t.id} t={t} onReceipt={(tx) => { setReceiptRef(tx.reference || `wt-${tx.id}`); setShowReceipt(true); }} onDispute={(tx) => setDisputeTransaction(tx)} />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-scaleIn">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Delete Transaction History?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              This will permanently remove {transactions.length} transaction{transactions.length > 1 ? 's' : ''} from your history.
              Your current balance will not be affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteHistory}
                disabled={deleting}
                className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Flow Modal */}
      {payState !== 'idle' && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md animate-slideUp max-h-[90vh] overflow-y-auto">

            {/* Form State */}
            {payState === 'form' && (
              <>
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Top Up Wallet</h2>
                      <p className="text-xs text-slate-400">Add funds to your wallet</p>
                    </div>
                  </div>
                  <button onClick={handleClosePayment} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <div className="px-6 py-6 space-y-5">
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 flex items-center gap-2">
                      <XCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-2">Amount (SLE)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">SLE</span>
                      <input
                        type="number"
                        step="0.01"
                        min="5"
                        max="10000"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-14 pr-4 py-3.5 border border-slate-200 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      {[50, 100, 250, 500, 1000].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAmount(String(preset))}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                            amount === String(preset)
                              ? 'bg-emerald-500 text-white shadow-sm'
                              : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-2.5">Min SLE 5.00 · Max SLE 10,000.00</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-2">Payment Method</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setTopupMethod('monime')}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all ${
                          topupMethod === 'monime'
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <Smartphone className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-slate-800">Monime</p>
                          <p className="text-[10px] text-slate-400">Pay online now</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopupMethod('cash')}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all ${
                          topupMethod === 'cash'
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <Banknote className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-slate-800">Cash</p>
                          <p className="text-[10px] text-slate-400">Pay in person</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {topupMethod === 'monime' ? (
                    <div className="bg-slate-50 rounded-xl p-3.5 flex items-start gap-3 text-sm text-slate-600">
                      <Smartphone className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span className="text-xs leading-relaxed">
                        A secure Monime checkout window will open. Complete your payment there -- your wallet will be credited automatically here once confirmed.
                      </span>
                    </div>
                  ) : (
                    <div className="bg-amber-50 rounded-xl p-3.5 flex items-start gap-3 text-sm text-amber-800">
                      <Banknote className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span className="text-xs leading-relaxed">
                        Request a cash top-up. Bring the exact amount to our office or hand it to a field agent. Your wallet is credited once an admin confirms receipt.
                      </span>
                    </div>
                  )}
                  <button
                    onClick={handleStartPayment}
                    className={`w-full py-4 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg ${
                      topupMethod === 'cash'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/20'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/20'
                    }`}
                  >
                    {topupMethod === 'cash'
                      ? <><Banknote className="w-5 h-5" /> Request Cash Top-Up</>
                      : <><CreditCard className="w-5 h-5" /> Pay with Monime</>}
                  </button>
                </div>
              </>
            )}

            {/* Opening State */}
            {payState === 'opening' && (
              <div className="p-10 text-center">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-pulse" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Opening Checkout...</h2>
                <p className="text-sm text-slate-500">Preparing your secure Monime payment</p>
              </div>
            )}

            {/* Waiting / Polling State */}
            {payState === 'waiting' && (
              <div className="p-10 text-center">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ExternalLink className="w-7 h-7 text-emerald-500" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                  {retrying ? 'Retrying Verification...' : 'Waiting for Payment'}
                </h2>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">
                  Complete your payment in the Monime window. We'll detect it automatically.
                </p>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                  <span className="text-xs text-slate-400">
                    Checking... (attempt {pollAttempt})
                  </span>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-6">
                  <p className="text-xs text-amber-700">
                    If the Monime window didn't open, check your popup blocker. Keep this page open while paying.
                  </p>
                </div>
                <button
                  onClick={handleClosePayment}
                  className="text-sm text-slate-500 font-medium hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Success State with 3s Animation */}
            {payState === 'success' && (
              <div className="p-10 text-center">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={handleClosePayment} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <div className="relative w-28 h-28 mx-auto mb-6">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                    <circle cx="56" cy="56" r="52" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                    <circle
                      cx="56" cy="56" r="52" fill="none"
                      stroke="#10b981" strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={`${strokeDash} ${circumference}`}
                      className="transition-all duration-75"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`transition-all duration-700 ease-out ${
                      successProgress > 0.25 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                    }`}>
                      <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      </div>
                    </div>
                  </div>
                </div>

                <h1 className={`text-2xl font-bold text-slate-900 mb-2 transition-all duration-500 ${
                  successProgress > 0.4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}>
                  Payment Successful!
                </h1>
                <p className={`text-sm text-slate-500 transition-all duration-500 ${
                  successProgress > 0.5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}>
                  Your wallet has been credited successfully.
                </p>

                {payReference && (
                  <div className={`mt-4 transition-all duration-500 ${
                    successProgress > 0.6 ? 'opacity-100' : 'opacity-0'
                  }`}>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl py-2.5 px-4 inline-block">
                      <p className="text-xs text-emerald-700">Ref: <span className="font-mono font-semibold">{payReference}</span></p>
                    </div>
                  </div>
                )}

                <div className="mt-6 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-75"
                    style={{ width: `${successProgress * 100}%` }}
                  />
                </div>

                {animDone && (
                  <div className="mt-8 space-y-3 animate-fadeIn">
                    <button
                      onClick={() => setShowReceipt(true)}
                      className="w-full py-3.5 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <Receipt className="w-5 h-5" /> View Receipt
                    </button>
                    <button
                      onClick={() => { handleClosePayment(); loadTransactions(); }}
                      className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-emerald-600/20"
                    >
                      <Wallet className="w-5 h-5" /> View Wallet Balance
                    </button>
                    {onChooseService && (
                      <button
                        onClick={() => { handleClosePayment(); onChooseService(); }}
                        className="w-full py-3.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                      >
                        <ShoppingBag className="w-5 h-5" /> Choose a Service
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Failed State with Retry */}
            {payState === 'failed' && (
              <div className="p-10 text-center">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={handleClosePayment} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 animate-shakeX">
                  <XCircle className="w-9 h-9 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-3">Payment Failed</h1>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">{failReason}</p>

                <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6">
                  <p className="text-xs text-red-700 font-medium">
                    {retriesLeft > 0
                      ? `${retriesLeft} retry attempt${retriesLeft > 1 ? 's' : ''} remaining`
                      : 'No retry attempts remaining. Please start a new payment.'}
                  </p>
                </div>

                {payReference && (
                  <div className="mb-6 bg-slate-50 rounded-xl py-2.5 px-4 inline-block">
                    <p className="text-xs text-slate-500">Ref: <span className="font-mono font-semibold">{payReference}</span></p>
                  </div>
                )}

                <div className="space-y-3">
                  {retriesLeft > 0 && (
                    <button
                      onClick={handleRetry}
                      className="w-full py-3.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <RefreshCw className="w-4 h-4" /> Retry Verification ({retriesLeft})
                    </button>
                  )}
                  <button
                    onClick={() => { handleClosePayment(); loadTransactions(); }}
                    className="w-full py-3.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Wallet className="w-5 h-5" /> View Wallet Balance
                  </button>
                  {onChooseService && (
                    <button
                      onClick={() => { handleClosePayment(); onChooseService(); }}
                      className="w-full py-3.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                    >
                      <ShoppingBag className="w-5 h-5" /> Choose a Service
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Cash Pending State */}
            {payState === 'cash_pending' && (
              <div className="p-10 text-center">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={handleClosePayment} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Banknote className="w-10 h-10 text-amber-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Cash Top-Up Requested</h1>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">
                  Your request for <span className="font-semibold text-slate-800">SLE {parseFloat(amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> has been logged.
                  Bring the cash to our office or hand it to a field agent. Your wallet will be credited once an admin confirms receipt.
                </p>
                <button
                  onClick={() => { handleClosePayment(); loadTransactions(); }}
                  className="w-full py-3.5 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Wallet className="w-5 h-5" /> View Wallet
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {showReceipt && (receiptRef || payReference) && (
        <ReceiptModal
          paymentReference={receiptRef || payReference}
          onClose={() => { setShowReceipt(false); setReceiptRef(''); }}
          onViewBookings={() => { handleClosePayment(); setShowReceipt(false); setReceiptRef(''); }}
        />
      )}

      {showWithdraw && (
        <WithdrawModal
          balance={availableBalance}
          actualBalance={balance}
          pendingAmount={pendingWithdrawalTotal}
          onClose={() => setShowWithdraw(false)}
          onSubmitted={() => { setShowWithdraw(false); loadWithdrawals(); }}
        />
      )}

      {withdrawals.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <Banknote className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-slate-800 text-sm">Recent Withdrawals</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {withdrawals.map(w => {
              const statusMeta: Record<string, { label: string; cls: string }> = {
                pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-600' },
                approved: { label: 'Approved', cls: 'bg-blue-50 text-blue-600' },
                rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-600' },
                completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-600' },
                cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-400' },
              };
              const meta = statusMeta[w.status] ?? statusMeta.pending;
              return (
                <div key={w.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/80 transition-colors">
                  <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Banknote className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">SLE {Number(w.amount_sle).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-slate-400 capitalize">{w.payout_method.replace('_', ' ')}</p>
                  </div>
                  {w.status === 'pending' && (
                    <button
                      onClick={async () => {
                        if (!confirm('Cancel this withdrawal request?')) return;
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                          await supabase.from('withdrawal_requests')
                            .update({ status: 'cancelled' })
                            .eq('id', w.id)
                            .eq('user_id', user.id)
                            .eq('status', 'pending');
                        }
                        loadWithdrawals();
                      }}
                      className="text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${meta.cls}`}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showSettings && (
        <WalletSettings onClose={() => { setShowSettings(false); loadWalletPrefs(); }} />
      )}

      {disputeTransaction && (
        <DisputeModal
          transaction={disputeTransaction}
          onClose={() => setDisputeTransaction(null)}
          onSubmitted={() => { setDisputeTransaction(null); }}
        />
      )}
    </div>
  );
}

function WithdrawModal({ balance, actualBalance, pendingAmount, onClose, onSubmitted }: {
  balance: number; actualBalance: number; pendingAmount: number; onClose: () => void; onSubmitted: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'mobile_money' | 'bank_transfer' | 'cash'>('mobile_money');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [momoProvider, setMomoProvider] = useState<'m17' | 'm18'>('m17');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<'form' | 'verify' | 'enable2fa'>('form');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [checking2fa, setChecking2fa] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt > balance) { setError('Amount exceeds your available balance'); return; }
    if (amt < 10) { setError('Minimum withdrawal is SLE 10.00'); return; }
    if (method === 'mobile_money' && !phoneNumber.trim()) { setError('Enter your mobile money phone number'); return; }
    if (method === 'mobile_money' && !momoProvider) { setError('Select a mobile money provider'); return; }
    if (method === 'bank_transfer' && (!bankName.trim() || !accountNumber.trim() || !accountName.trim())) {
      setError('Fill in all bank details'); return;
    }

    setChecking2fa(true);
    try {
      const { data: checkData } = await supabase.functions.invoke('manage-2fa', {
        body: { action: 'verify-login', code: '__check__' },
      });
      if (checkData?.error === '2FA not enabled for this account') {
        setStep('enable2fa');
      } else {
        setStep('verify');
      }
    } catch {
      setStep('verify');
    }
    setChecking2fa(false);
  };

  const handleVerifyAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    if (otpCode.length !== 6) { setOtpError('Enter the 6-digit code'); return; }

    setVerifying(true);
    try {
      const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('manage-2fa', {
        body: { action: 'verify-login', code: otpCode },
      });
      if (verifyErr || !verifyData?.success) {
        setOtpError(verifyData?.error || 'Invalid code. Please try again.');
        setVerifying(false);
        return;
      }

      const amt = parseFloat(amount);
      const payoutDetails: Record<string, string> = {};
      if (method === 'mobile_money') {
        payoutDetails.phone = phoneNumber.trim();
        payoutDetails.provider_id = momoProvider;
        payoutDetails.provider_name = momoProvider === 'm17' ? 'Orange Money' : 'Africell Money';
      }
      if (method === 'bank_transfer') {
        payoutDetails.bank_name = bankName.trim();
        payoutDetails.account_number = accountNumber.trim();
        payoutDetails.account_name = accountName.trim();
      }

      const { error: err } = await supabase.from('withdrawal_requests').insert({
        amount_sle: amt,
        payout_method: method,
        payout_details: payoutDetails,
        status: 'pending',
      });

      setVerifying(false);
      if (err) { setOtpError('We could not process your withdrawal. Please try again.'); return; }
      setSuccess(true);
      setTimeout(onSubmitted, 2000);
    } catch {
      setOtpError('Something went wrong. Please try again.');
      setVerifying(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md p-10 text-center animate-slideUp">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Request Submitted</h2>
          <p className="text-sm text-slate-500">
            Your withdrawal request for SLE {parseFloat(amount).toFixed(2)} is pending admin review.
            {method === 'mobile_money' && ' Once approved, the money will be sent to your phone via Monime mobile money.'}
            {method === 'bank_transfer' && ' Once approved, the funds will be transferred to your bank account.'}
            {method === 'cash' && ' You\'ll be contacted to arrange a cash pickup once approved.'}
            You\'ll be notified when the status changes.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'enable2fa') {
    return (
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col animate-slideUp">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold text-slate-900">2FA Required</h2>
            </div>
            <button onClick={() => { setStep('form'); setOtpCode(''); setOtpError(''); }} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <ShieldCheck className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Enable 2FA to withdraw</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-5">
                Two-factor authentication is required for withdrawals to protect your funds. Please enable it in your account settings first.
              </p>
              <div className="bg-slate-50 rounded-xl p-4 text-left mb-5">
                <ol className="space-y-2 text-xs text-slate-600">
                  <li className="flex gap-2"><span className="font-bold text-slate-800">1.</span> Go to Account Settings</li>
                  <li className="flex gap-2"><span className="font-bold text-slate-800">2.</span> Open the Security tab</li>
                  <li className="flex gap-2"><span className="font-bold text-slate-800">3.</span> Enable Two-Factor Authentication</li>
                  <li className="flex gap-2"><span className="font-bold text-slate-800">4.</span> Return here to complete your withdrawal</li>
                </ol>
              </div>
              <button
                onClick={() => { window.location.hash = 'account'; window.location.href = '/?page=account'; }}
                className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-5 h-5" />
                Go to Account Settings
              </button>
              <button type="button" onClick={() => { setStep('form'); setOtpCode(''); setOtpError(''); }}
                className="w-full py-2.5 text-sm text-slate-500 font-medium hover:text-slate-700 transition-colors mt-2">
                Back to form
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col animate-slideUp">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">Verify Withdrawal</h2>
            </div>
            <button onClick={() => { setStep('form'); setOtpCode(''); setOtpError(''); }} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-5">
            <div className="bg-slate-50 rounded-xl p-4 mb-5 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Amount</span>
              <span className="text-lg font-bold text-slate-800">{fmtMoney(parseFloat(amount) || 0)}</span>
            </div>
            <form onSubmit={handleVerifyAndSubmit} className="space-y-4">
              {otpError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><XCircle className="w-4 h-4 flex-shrink-0" />{otpError}</div>}
              <div className="text-center">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="w-7 h-7 text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1.5">Enter your 2FA code</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Enter the 6-digit code from your authenticator app to confirm this withdrawal of <span className="font-semibold text-slate-700">{fmtMoney(parseFloat(amount) || 0)}</span>.</p>
              </div>
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full text-center text-2xl font-bold tracking-[0.5em] px-4 py-3.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  autoFocus
                />
              </div>
              <button type="submit" disabled={verifying || otpCode.length !== 6}
                className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                {verifying ? 'Verifying…' : 'Confirm & Submit'}
              </button>
              <button type="button" onClick={() => { setStep('form'); setOtpCode(''); setOtpError(''); }}
                className="w-full py-2.5 text-sm text-slate-500 font-medium hover:text-slate-700 transition-colors">
                Back to form
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col animate-slideUp">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Withdraw Funds</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><XCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}

            <div className="bg-slate-50 rounded-xl p-3.5 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Available Balance</span>
              <span className="text-sm font-bold text-slate-800">{fmtMoney(balance)}</span>
              {pendingAmount > 0 && (
                <span className="text-xs text-amber-600 ml-2">
                  ({fmtMoney(pendingAmount)} pending)
                </span>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Amount (SLE)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">SLE</span>
                <input type="number" step="0.01" min="10" max={balance} value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-14 pr-4 py-3.5 border border-slate-200 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all" />
              </div>
              <p className="text-xs text-slate-400 mt-2">Min SLE 10.00 · Max {fmtMoney(balance)}</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Payout Method</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
                  { id: 'bank_transfer', label: 'Bank Transfer', icon: Landmark },
                  { id: 'cash', label: 'Cash Pickup', icon: Banknote },
                ] as const).map(opt => (
                  <button key={opt.id} type="button" onClick={() => setMethod(opt.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all border-2 ${
                      method === opt.id ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}>
                    <opt.icon className="w-5 h-5" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {method === 'mobile_money' && (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 flex items-start gap-3">
                  <Smartphone className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-600 leading-relaxed">Mobile money withdrawals are sent via Monime after admin approval — usually within minutes. The money goes directly to your phone number.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">Mobile Money Provider</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: 'm17', label: 'Orange Money' },
                      { id: 'm18', label: 'Africell Money' },
                    ] as const).map(opt => (
                      <button key={opt.id} type="button" onClick={() => setMomoProvider(opt.id)}
                        className={`py-2.5 rounded-xl text-xs font-semibold transition-all border-2 ${
                          momoProvider === opt.id ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">Phone Number</label>
                  <input type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+232 ..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </>
            )}

            {method === 'bank_transfer' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">Bank Name</label>
                  <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Sierra Leone Commercial Bank"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">Account Number</label>
                  <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">Account Name</label>
                  <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </>
            )}

            {method === 'cash' && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                <p className="text-xs text-amber-700 leading-relaxed">Cash pickups are available at our office. You'll be contacted to arrange a pickup time once your request is approved.</p>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 flex items-start gap-3">
              <Clock className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-600 leading-relaxed">All withdrawal requests are reviewed by our finance team. Mobile money payouts are typically processed within minutes after approval.</p>
            </div>

            <button type="submit" disabled={submitting || checking2fa}
              className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting || checking2fa ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
              {checking2fa ? 'Checking…' : submitting ? 'Submitting…' : 'Continue to Verification'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
