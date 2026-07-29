import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FileText, Search, Loader2, Plus, X, CheckCircle2, Download, Send,
  Trash2, Clock, AlertCircle, DollarSign, Calendar, Filter,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface ProfileMap {
  [userId: string]: { full_name: string | null; email: string | null; phone: string | null };
}

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Invoice {
  id: string; user_id: string; invoice_number: string; status: string;
  issue_date: string; due_date: string; currency: string;
  subtotal: number; tax_rate: number; tax_amount: number; total: number;
  amount_paid: number; notes: string | null; line_items: LineItem[];
  created_by: string; paid_at: string | null; created_at: string;
  profile?: { full_name: string | null; email: string | null; phone: string | null };
}

interface FxRate {
  currency_code: string; rate_to_sle: number;
}

function fmtMoney(n: number, currency = 'SLE') {
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function loadProfiles(userIds: string[]): Promise<ProfileMap> {
  if (userIds.length === 0) return {};
  const unique = [...new Set(userIds)];
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .in('id', unique);
  const map: ProfileMap = {};
  (data || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email, phone: p.phone }; });
  return map;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Draft',    cls: 'bg-slate-100 text-slate-600' },
  sent:     { label: 'Sent',     cls: 'bg-blue-50 text-blue-600' },
  paid:     { label: 'Paid',     cls: 'bg-emerald-50 text-emerald-600' },
  overdue:  { label: 'Overdue',  cls: 'bg-red-50 text-red-600' },
  cancelled:{ label: 'Cancelled',cls: 'bg-slate-100 text-slate-400' },
};

export function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { setLoadError(error.message); setInvoices([]); setLoading(false); return; }
    const rows = (data || []) as any[];
    const profileMap = await loadProfiles(rows.map(r => r.user_id).filter(Boolean));
    const enriched: Invoice[] = rows.map(r => ({
      ...r, profile: profileMap[r.user_id] || { full_name: null, email: null, phone: null },
    }));
    setInvoices(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const stats = useMemo(() => {
    const total = invoices.length;
    const totalAmount = invoices.reduce((s, i) => s + Number(i.total), 0);
    const paid = invoices.filter(i => i.status === 'paid').length;
    const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0);
    const overdue = invoices.filter(i => i.status === 'overdue').length;
    return { total, totalAmount, paid, outstanding, overdue };
  }, [invoices]);

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = inv.profile?.full_name || '';
      const email = inv.profile?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || inv.invoice_number.toLowerCase().includes(q);
    }
    return true;
  });

  const handleDownload = async (inv: Invoice) => {
    setActionLoading(inv.id);
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice', {
        body: { action: 'generate-pdf', invoiceId: inv.id },
      });
      if (error || !data?.html) throw new Error(error?.message || 'Failed to generate PDF');
      const blob = new Blob([data.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `invoice-${inv.invoice_number}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to download: ${err.message}`);
    }
    setActionLoading(null);
  };

  const handleSendEmail = async (inv: Invoice) => {
    setActionLoading(inv.id);
    try {
      const { error } = await supabase.functions.invoke('generate-invoice', {
        body: { action: 'send-email', invoiceId: inv.id },
      });
      if (error) throw new Error(error.message);
      loadInvoices();
    } catch (err: any) {
      alert(`Failed to send: ${err.message}`);
    }
    setActionLoading(null);
  };

  const handleMarkPaid = async (inv: Invoice) => {
    setActionLoading(inv.id);
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'paid', amount_paid: inv.total, paid_at: new Date().toISOString() })
      .eq('id', inv.id);
    if (!error) loadInvoices();
    setActionLoading(null);
  };

  const handleDelete = async (inv: Invoice) => {
    if (!confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`)) return;
    setActionLoading(inv.id);
    const { error } = await supabase.from('invoices').delete().eq('id', inv.id);
    if (!error) loadInvoices();
    setActionLoading(null);
  };

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load invoices: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBox label="TOTAL INVOICES" value={String(stats.total)} icon={FileText} color="text-emerald-500" accent="bg-emerald-50" />
        <StatBox label="INVOICED AMOUNT" value={fmtMoney(stats.totalAmount)} icon={DollarSign} color="text-blue-500" accent="bg-blue-50" />
        <StatBox label="OUTSTANDING" value={fmtMoney(stats.outstanding)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
        <StatBox label="OVERDUE" value={String(stats.overdue)} icon={AlertCircle} color="text-red-500" accent="bg-red-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by client, email, or invoice number…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors text-sm whitespace-nowrap">
          <Plus className="w-4 h-4" /> Create Invoice
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No invoices found</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Invoice No.</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Client</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden sm:table-cell">Issue Date</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden md:table-cell">Due Date</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Total</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Status</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(inv => {
                  const meta = STATUS_META[inv.status] ?? STATUS_META.draft;
                  const balance = Number(inv.total) - Number(inv.amount_paid);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-800">{inv.invoice_number}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{inv.profile?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{inv.profile?.email || ''}</p>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell text-slate-500 text-xs">{formatDate(inv.issue_date)}</td>
                      <td className="px-5 py-3 hidden md:table-cell text-slate-500 text-xs">{formatDate(inv.due_date)}</td>
                      <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoney(Number(inv.total), inv.currency)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => handleDownload(inv)} disabled={actionLoading === inv.id} title="Download"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50">
                            {actionLoading === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleSendEmail(inv)} disabled={actionLoading === inv.id} title="Send to client"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
                            <Send className="w-4 h-4" />
                          </button>
                          {inv.status !== 'paid' && (
                            <button onClick={() => handleMarkPaid(inv)} disabled={actionLoading === inv.id} title="Mark as paid"
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(inv)} disabled={actionLoading === inv.id} title="Delete"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateInvoiceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); loadInvoices(); }}
        />
      )}
    </>
  );
}

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [userId, setUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [currency, setCurrency] = useState('SLE');
  const [fxRates, setFxRates] = useState<FxRate[]>([]);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price: 0, total: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('fx_rates').select('currency_code, rate_to_sle').eq('is_active', true)
      .then(({ data }: { data: FxRate[] | null }) => setFxRates(data || []));
  }, []);

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    if (q.length < 2) { setUserResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    setUserResults(data || []);
  };

  const updateLineItem = (idx: number, field: keyof LineItem, value: string) => {
    setLineItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: field === 'description' ? value : parseFloat(value) || 0 };
      updated.total = updated.quantity * updated.unit_price;
      return updated;
    }));
  };

  const addLineItem = () => setLineItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, total: 0 }]);
  const removeLineItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = subtotal * (parseFloat(taxRate) || 0) / 100;
  const total = subtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!userId) { setError('Select a client'); return; }
    if (lineItems.some(i => !i.description.trim())) { setError('All line items need a description'); return; }
    setSubmitting(true);
    const { error: err } = await supabase.from('invoices').insert({
      user_id: userId,
      status: 'draft',
      issue_date: issueDate,
      due_date: dueDate,
      currency,
      subtotal,
      tax_rate: parseFloat(taxRate) || 0,
      tax_amount: taxAmount,
      total,
      amount_paid: 0,
      notes: notes.trim() || null,
      line_items: lineItems,
      created_by: 'admin',
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Create Invoice</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Client</label>
              <input type="text" value={userSearch} onChange={e => searchUsers(e.target.value)} placeholder="Search by name or email…"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              {userResults.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {userResults.map(u => (
                    <button key={u.id} type="button"
                      onClick={() => { setUserId(u.id); setUserSearch(`${u.full_name || u.email || ''}`); setUserResults([]); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                      <p className="text-sm font-medium text-slate-800">{u.full_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </button>
                  ))}
                </div>
              )}
              {userId && <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Client selected</div>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Issue Date</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Currency</label>
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none">
                  {fxRates.length === 0 && <option value="SLE">SLE</option>}
                  {fxRates.map(r => <option key={r.currency_code} value={r.currency_code}>{r.currency_code}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Tax Rate (%)</label>
                <input type="number" step="0.01" min="0" value={taxRate} onChange={e => setTaxRate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-800">Line Items</label>
                <button type="button" onClick={addLineItem}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>
              <div className="space-y-2">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <input type="text" value={item.description} onChange={e => updateLineItem(idx, 'description', e.target.value)}
                      placeholder="Description"
                      className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                    <input type="number" value={item.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)}
                      min="1" step="1" title="Quantity"
                      className="w-16 px-2 py-2.5 border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-emerald-500 outline-none" />
                    <input type="number" value={item.unit_price} onChange={e => updateLineItem(idx, 'unit_price', e.target.value)}
                      min="0" step="0.01" title="Unit Price"
                      className="w-24 px-2 py-2.5 border border-slate-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-emerald-500 outline-none" />
                    <div className="w-24 px-2 py-2.5 text-right text-sm font-semibold text-slate-700">
                      {fmtMoney(item.total, currency).replace(currency + ' ', '')}
                    </div>
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => removeLineItem(idx)}
                        className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-700">{fmtMoney(subtotal, currency)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Tax ({taxRate || 0}%)</span><span className="font-semibold text-slate-700">{fmtMoney(taxAmount, currency)}</span></div>
              <div className="flex justify-between text-base pt-2 border-t border-slate-200"><span className="font-bold text-slate-900">Total</span><span className="font-bold text-emerald-600">{fmtMoney(total, currency)}</span></div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Payment instructions or notes for the client…"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
            </div>

            <button type="submit" disabled={submitting}
              className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
              {submitting ? 'Creating…' : 'Create Invoice'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color, accent }: {
  label: string; value: string; icon: typeof FileText; color: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mt-1.5">{label}</p>
    </div>
  );
}
