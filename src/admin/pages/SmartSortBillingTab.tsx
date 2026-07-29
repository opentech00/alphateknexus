import { useEffect, useMemo, useState } from 'react';
import {
  FileText, Wallet, TrendingUp, AlertCircle, Search, RefreshCw, Download,
  X, Plus, CheckCircle2, Clock, CreditCard, Banknote, Smartphone, ChevronDown,
  ChevronUp, Receipt, Send,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Invoice {
  id: string;
  subscription_id: string;
  user_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  amount_sle: number;
  amount_paid_sle: number;
  status: string;
  due_date: string;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  smart_sort_subscriptions: {
    plan_name: string | null;
    address: string;
    profiles: { full_name: string | null; email: string | null } | null;
  } | null;
  smart_sort_payments: Payment[] | null;
}

interface Payment {
  id: string;
  invoice_id: string;
  amount_sle: number;
  method: string;
  reference: string | null;
  status: string;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  paid: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial: { label: 'Partial', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  overdue: { label: 'Overdue', cls: 'bg-red-50 text-red-600 border-red-200' },
  void: { label: 'Void', cls: 'bg-slate-100 text-slate-400 border-slate-200' },
};

const METHOD_META: Record<string, { label: string; icon: typeof Wallet }> = {
  cash: { label: 'Cash', icon: Banknote },
  bank_transfer: { label: 'Bank Transfer', icon: CreditCard },
  africell_money: { label: 'Africell Money', icon: Smartphone },
  orange_money: { label: 'Orange Money', icon: Smartphone },
  qmoney: { label: 'QMoney', icon: Smartphone },
  other: { label: 'Other', icon: Wallet },
};

function fmtDate(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return '—';
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00')).toLocaleDateString('en-GB', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number) {
  return `SLE ${n.toLocaleString()}`;
}

export function SmartSortBillingTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<'due_date' | 'amount' | 'created_at'>('due_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [genSubId, setGenSubId] = useState('');
  const [genAmount, setGenAmount] = useState('');
  const [genPeriodStart, setGenPeriodStart] = useState('');
  const [genPeriodEnd, setGenPeriodEnd] = useState('');
  const [genDueDate, setGenDueDate] = useState('');
  const [genError, setGenError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [activeSubs, setActiveSubs] = useState<{ id: string; label: string }[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('smart_sort_invoices')
      .select('*, smart_sort_subscriptions(plan_name, address, profiles(full_name, email)), smart_sort_payments(id, invoice_id, amount_sle, method, reference, status, created_at)')
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      setInvoices([]);
    } else {
      setInvoices((data as Invoice[]) || []);
    }
    setLoading(false);
  };

  const loadActiveSubs = async () => {
    const { data } = await supabase
      .from('smart_sort_subscriptions')
      .select('id, plan_name, plan_price_sle, address, profiles(full_name, email)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (data) {
      setActiveSubs((data as any[]).map(s => ({
        id: s.id,
        label: `${s.profiles?.full_name || 'Client'} — ${s.plan_name || 'Custom'} (${fmtMoney(s.plan_price_sle || 0)})`,
      })));
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let result = invoices;
    if (statusFilter !== 'all') result = result.filter(i => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.smart_sort_subscriptions?.profiles?.full_name || '').toLowerCase().includes(q) ||
        (i.smart_sort_subscriptions?.profiles?.email || '').toLowerCase().includes(q)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'due_date') cmp = a.due_date.localeCompare(b.due_date);
      else if (sortKey === 'amount') cmp = a.amount_sle - b.amount_sle;
      else cmp = a.created_at.localeCompare(b.created_at);
      return cmp * dir;
    });
    return result;
  }, [invoices, statusFilter, search, sortKey, sortDir]);

  const stats = useMemo(() => {
    const total = invoices.reduce((s, i) => s + i.amount_sle, 0);
    const collected = invoices.reduce((s, i) => s + i.amount_paid_sle, 0);
    const outstanding = total - collected;
    const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.amount_sle - i.amount_paid_sle), 0);
    const paidCount = invoices.filter(i => i.status === 'paid').length;
    const pendingCount = invoices.filter(i => i.status === 'pending').length;
    const partialCount = invoices.filter(i => i.status === 'partial').length;
    const overdueCount = invoices.filter(i => i.status === 'overdue').length;
    return { total, collected, outstanding, overdue, paidCount, pendingCount, partialCount, overdueCount };
  }, [invoices]);

  const updateInvoice = async (id: string, patch: Partial<Invoice>) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, ...patch } as Invoice : i));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, ...patch } as Invoice : prev);
    await supabase.from('smart_sort_invoices').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  };

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const seq = String(invoices.length + 1).padStart(4, '0');
    return `SS-${year}-${seq}`;
  };

  const openGenerate = () => {
    loadActiveSubs();
    setGenSubId(activeSubs[0]?.id || '');
    setGenAmount('');
    setGenPeriodStart('');
    setGenPeriodEnd('');
    setGenDueDate('');
    setGenError('');
    setShowGenerate(true);
  };

  const handleGenerate = async () => {
    if (!genSubId) { setGenError('Select a subscription.'); return; }
    if (!genPeriodStart || !genPeriodEnd || !genDueDate) { setGenError('Fill in all dates.'); return; }
    const amount = parseInt(genAmount, 10);
    if (isNaN(amount) || amount <= 0) { setGenError('Enter a valid amount.'); return; }
    setGenerating(true);
    setGenError('');
    const sub = activeSubs.find(s => s.id === genSubId);
    const subData = await supabase.from('smart_sort_subscriptions').select('user_id, plan_price_sle').eq('id', genSubId).maybeSingle();
    if (!subData.data) { setGenError('Subscription not found.'); setGenerating(false); return; }
    const { error: err } = await supabase.from('smart_sort_invoices').insert({
      subscription_id: genSubId,
      user_id: subData.data.user_id,
      invoice_number: generateInvoiceNumber(),
      period_start: genPeriodStart,
      period_end: genPeriodEnd,
      amount_sle: amount,
      due_date: genDueDate,
      status: 'pending',
      sent_at: new Date().toISOString(),
    });
    if (err) { setGenError(err.message); setGenerating(false); return; }
    setGenerating(false);
    setShowGenerate(false);
    load();
  };

  const openPayment = (inv: Invoice) => {
    setSelected(inv);
    setPayAmount(String(inv.amount_sle - inv.amount_paid_sle));
    setPayMethod('cash');
    setPayReference('');
    setShowPayment(true);
  };

  const recordPayment = async () => {
    if (!selected) return;
    const amount = parseInt(payAmount, 10);
    if (isNaN(amount) || amount <= 0) return;
    setRecordingPayment(true);
    const { data: payData, error: payErr } = await supabase.from('smart_sort_payments').insert({
      invoice_id: selected.id,
      user_id: selected.user_id,
      amount_sle: amount,
      method: payMethod,
      reference: payReference.trim() || null,
      status: 'confirmed',
    }).select('id, invoice_id, amount_sle, method, reference, status, created_at').single();
    if (payErr) { setRecordingPayment(false); return; }
    const newPaid = selected.amount_paid_sle + amount;
    const newStatus = newPaid >= selected.amount_sle ? 'paid' : 'partial';
    await updateInvoice(selected.id, {
      amount_paid_sle: newPaid,
      status: newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : selected.paid_at,
    });
    setInvoices(prev => prev.map(i => i.id === selected.id ? {
      ...i, amount_paid_sle: newPaid, status: newStatus,
      smart_sort_payments: [...(i.smart_sort_payments || []), payData as Payment],
    } as Invoice : i));
    setRecordingPayment(false);
    setShowPayment(false);
  };

  const markOverdue = async (inv: Invoice) => {
    await updateInvoice(inv.id, { status: 'overdue' });
  };

  const voidInvoice = async (inv: Invoice) => {
    if (!confirm(`Void invoice ${inv.invoice_number}?`)) return;
    await updateInvoice(inv.id, { status: 'void' });
  };

  const exportCsv = () => {
    const headers = ['Invoice #', 'Client', 'Email', 'Period Start', 'Period End', 'Amount', 'Paid', 'Balance', 'Status', 'Due Date', 'Sent At', 'Paid At'];
    const rows = filtered.map(i => [
      i.invoice_number,
      i.smart_sort_subscriptions?.profiles?.full_name || '',
      i.smart_sort_subscriptions?.profiles?.email || '',
      i.period_start, i.period_end, i.amount_sle, i.amount_paid_sle,
      i.amount_sle - i.amount_paid_sle, i.status, i.due_date,
      i.sent_at || '', i.paid_at || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-sort-invoices-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null;

  const StatusBadge = ({ status }: { status: string }) => {
    const m = STATUS_META[status] ?? STATUS_META.pending;
    return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{m.label}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Billed', value: fmtMoney(stats.total), icon: FileText, color: 'text-slate-600' },
          { label: 'Collected', value: fmtMoney(stats.collected), icon: Wallet, color: 'text-emerald-600' },
          { label: 'Outstanding', value: fmtMoney(stats.outstanding), icon: TrendingUp, color: 'text-blue-600' },
          { label: 'Overdue', value: fmtMoney(stats.overdue), icon: AlertCircle, color: 'text-red-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Paid Invoices', value: stats.paidCount, icon: CheckCircle2 },
          { label: 'Pending', value: stats.pendingCount, icon: Clock },
          { label: 'Partial', value: stats.partialCount, icon: CreditCard },
          { label: 'Overdue', value: stats.overdueCount, icon: AlertCircle },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-slate-50 rounded-xl border border-slate-100 p-3 flex items-center gap-3">
            <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-slate-800">{value}</p>
              <p className="text-[11px] text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoice #, client, email…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="all">All Status</option>
              {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <button onClick={exportCsv} className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors" title="Export CSV">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={load} className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={openGenerate}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg text-sm hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> New Invoice
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No invoices yet</p>
          <p className="text-sm text-slate-400 mt-1">Generate invoices for active subscriptions to track billing.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3 hidden md:table-cell">Period</th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('amount')}>
                    <span className="inline-flex items-center gap-1">Amount <SortIcon k="amount" /></span>
                  </th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('due_date')}>
                    <span className="inline-flex items-center gap-1">Due <SortIcon k="due_date" /></span>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(inv => {
                  const balance = inv.amount_sle - inv.amount_paid_sle;
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelected(inv)}>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-800">{inv.invoice_number}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 truncate">{inv.smart_sort_subscriptions?.profiles?.full_name || 'Client'}</div>
                        <div className="text-xs text-slate-400 truncate">{inv.smart_sort_subscriptions?.plan_name || 'Custom'}</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">
                        {fmtDate(inv.period_start, { day: 'numeric', month: 'short' })} – {fmtDate(inv.period_end, { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{fmtMoney(inv.amount_sle)}</td>
                      <td className="px-4 py-3 text-emerald-600 font-medium">{fmtMoney(inv.amount_paid_sle)}</td>
                      <td className={`px-4 py-3 font-medium ${balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmtMoney(balance)}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {balance > 0 && inv.status !== 'void' && (
                            <button onClick={() => openPayment(inv)} title="Record Payment" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {inv.status === 'pending' && (
                            <button onClick={() => markOverdue(inv)} title="Mark Overdue" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <AlertCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {inv.status !== 'void' && inv.status !== 'paid' && (
                            <button onClick={() => voidInvoice(inv)} title="Void" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            Showing {filtered.length} of {invoices.length} invoices
          </div>
        </div>
      )}

      {/* Invoice Detail Drawer */}
      {selected && !showPayment && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="font-bold text-slate-900">{selected.invoice_number}</h3>
                <p className="text-xs text-slate-400">{fmtDate(selected.created_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Client</h4>
                <p className="font-semibold text-slate-900">{selected.smart_sort_subscriptions?.profiles?.full_name || 'Client'}</p>
                {selected.smart_sort_subscriptions?.profiles?.email && (
                  <p className="text-sm text-slate-500">{selected.smart_sort_subscriptions.profiles.email}</p>
                )}
                <p className="text-sm text-slate-600 mt-1">{selected.smart_sort_subscriptions?.address}</p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billing Period</h4>
                <p className="text-sm text-slate-700">{fmtDate(selected.period_start)} – {fmtDate(selected.period_end)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Amount</span><span className="font-semibold text-slate-900">{fmtMoney(selected.amount_sle)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Paid</span><span className="font-semibold text-emerald-600">{fmtMoney(selected.amount_paid_sle)}</span></div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-200"><span className="text-slate-500">Balance Due</span><span className="font-bold text-red-600">{fmtMoney(selected.amount_sle - selected.amount_paid_sle)}</span></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">Status:</span>
                <StatusBadge status={selected.status} />
                <span className="text-xs text-slate-400 ml-auto">Due {fmtDate(selected.due_date)}</span>
              </div>
              {selected.smart_sort_payments && selected.smart_sort_payments.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment History</h4>
                  <div className="space-y-2">
                    {selected.smart_sort_payments.map(p => {
                      const M = METHOD_META[p.method]?.icon ?? Wallet;
                      return (
                        <div key={p.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                          <M className="w-4 h-4 text-slate-400" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-800">{fmtMoney(p.amount_sle)}</p>
                            <p className="text-xs text-slate-400">{METHOD_META[p.method]?.label ?? p.method} {p.reference && `· ${p.reference}`}</p>
                          </div>
                          <span className="text-xs text-slate-400">{fmtDate(p.created_at, { day: 'numeric', month: 'short' })}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {selected.amount_sle - selected.amount_paid_sle > 0 && selected.status !== 'void' && (
                <button
                  onClick={() => openPayment(selected)}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg text-sm hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Record Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generate Invoice Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowGenerate(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-lg font-bold text-slate-900">Generate Invoice</h2>
              <button onClick={() => setShowGenerate(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Subscription *</label>
                <select
                  value={genSubId}
                  onChange={e => {
                    setGenSubId(e.target.value);
                    const sub = activeSubs.find(s => s.id === e.target.value);
                    if (sub) {
                      const priceMatch = sub.label.match(/\(([^)]+)\)/);
                      if (priceMatch) setGenAmount(priceMatch[1].replace(/[^\d]/g, ''));
                    }
                  }}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {activeSubs.length === 0 && <option value="">No active subscriptions</option>}
                  {activeSubs.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Period Start *</label>
                  <input type="date" value={genPeriodStart} onChange={e => setGenPeriodStart(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Period End *</label>
                  <input type="date" value={genPeriodEnd} onChange={e => setGenPeriodEnd(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Amount (SLE) *</label>
                  <input type="number" min={1} value={genAmount} onChange={e => setGenAmount(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Due Date *</label>
                  <input type="date" value={genDueDate} onChange={e => setGenDueDate(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2 text-sm text-slate-500">
                <Send className="w-4 h-4 text-slate-400" />
                Invoice will be auto-numbered ({generateInvoiceNumber()}) and marked as sent.
              </div>
              {genError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{genError}</div>}
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex-shrink-0 flex gap-3">
              <button onClick={() => setShowGenerate(false)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleGenerate} disabled={generating} className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {generating ? 'Generating…' : 'Generate Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayment && selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPayment(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Record Payment</h2>
                <p className="text-xs text-slate-400">{selected.invoice_number} · Balance {fmtMoney(selected.amount_sle - selected.amount_paid_sle)}</p>
              </div>
              <button onClick={() => setShowPayment(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Amount (SLE) *</label>
                <input type="number" min={1} value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Payment Method *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(METHOD_META).map(([k, m]) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={k}
                        onClick={() => setPayMethod(k)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                          payMethod === k ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Reference (optional)</label>
                <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="Transaction ID, receipt #" className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex-shrink-0 flex gap-3">
              <button onClick={() => setShowPayment(false)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={recordPayment} disabled={recordingPayment} className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {recordingPayment ? 'Recording…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
