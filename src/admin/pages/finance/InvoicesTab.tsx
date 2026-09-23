import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FileText, Search, Loader2, Plus, CheckCircle2, Download, Send,
  Trash2, Clock, AlertCircle, DollarSign, Filter, Mail, Printer, Eye, FileDown,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { daysPastDue, downloadCsv } from './financeCsv';
import { CreateInvoiceModal, ViewInvoiceModal } from './InvoicePaper';
import {
  buildOfficialInvoiceHtml, openPrintableHtml, parseInvoiceNotes, type OfficialLineItem,
} from '../../../lib/companyDocs';
import { downloadHtmlAsPdf } from '../../../lib/invoicePdf';
import { toast } from '../../../components/toast/toast';

interface ProfileMap {
  [userId: string]: { full_name: string | null; email: string | null; phone: string | null };
}

type LineItem = OfficialLineItem;

interface Invoice {
  id: string; user_id: string; invoice_number: string; status: string;
  issue_date: string; due_date: string; currency: string;
  subtotal: number; tax_rate: number; tax_amount: number; total: number;
  amount_paid: number; notes: string | null; line_items: LineItem[];
  created_by: string; paid_at: string | null; created_at: string;
  profile?: { full_name: string | null; email: string | null; phone: string | null };
}

function fmtMoney(n: number, currency = 'SLE') {
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function invoiceHtml(inv: Invoice) {
  const parsed = parseInvoiceNotes(inv.notes);
  return buildOfficialInvoiceHtml({
    invoiceNumber: inv.invoice_number,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    currency: inv.currency,
    subtotal: Number(inv.subtotal),
    discountRate: Number(inv.tax_rate),
    discountAmount: Number(inv.tax_amount),
    total: Number(inv.total),
    amountPaid: Number(inv.amount_paid),
    notes: inv.notes,
    lineItems: inv.line_items || [],
    billToName: parsed.billToName || inv.profile?.full_name || 'Client',
    billToAddress: parsed.billToAddress,
    billToEmail: inv.profile?.email,
    billToPhone: inv.profile?.phone,
  });
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
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
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
    const today = new Date().toISOString().split('T')[0];
    const overdueIds = rows.filter((r) => r.status === 'sent' && r.due_date && r.due_date < today).map((r: any) => r.id);
    if (overdueIds.length > 0) {
      await supabase.from('invoices').update({ status: 'overdue' }).in('id', overdueIds);
      rows.forEach((r) => { if (overdueIds.includes(r.id)) r.status = 'overdue'; });
    }
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

  const aging = useMemo(() => {
    const unpaid = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, older: 0 };
    unpaid.forEach((inv) => {
      const days = daysPastDue(inv.due_date);
      const bal = Number(inv.total) - Number(inv.amount_paid);
      if (days <= 0) buckets.current += bal;
      else if (days <= 30) buckets.d30 += bal;
      else if (days <= 60) buckets.d60 += bal;
      else if (days <= 90) buckets.d90 += bal;
      else buckets.older += bal;
    });
    return buckets;
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

  const handleDownloadPdf = async (inv: Invoice) => {
    setActionLoading(`pdf-${inv.id}`);
    try {
      await downloadHtmlAsPdf(invoiceHtml(inv), `invoice-${inv.invoice_number}.pdf`);
      toast.success(`Saved invoice-${inv.invoice_number}.pdf`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the PDF.');
    }
    setActionLoading(null);
  };

  const handlePrint = (inv: Invoice) => {
    openPrintableHtml(invoiceHtml(inv), `invoice-${inv.invoice_number}.html`);
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
    const now = new Date().toISOString();
    const { data: { user } } = await supabase.auth.getUser();
    const balance = Number(inv.total) - Number(inv.amount_paid);
    if (balance > 0) {
      const { error: payErr } = await supabase.from('payments').insert({
        user_id: inv.user_id,
        payable_type: 'invoice',
        payable_id: inv.id,
        amount_sle: balance,
        method: 'bank_transfer',
        status: 'confirmed',
        confirmed_by: user?.id || null,
        confirmed_at: now,
        notes: `Invoice ${inv.invoice_number} marked paid in finance`,
      });
      if (payErr) {
        alert(`Payment record failed: ${payErr.message}`);
        setActionLoading(null);
        return;
      }
    }
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'paid', amount_paid: inv.total, paid_at: now, payment_method: 'bank_transfer' })
      .eq('id', inv.id);
    if (!error) loadInvoices();
    setActionLoading(null);
  };

  const handleRemindOverdue = async () => {
    const overdue = invoices.filter((i) => i.status === 'overdue');
    if (overdue.length === 0) return;
    if (!confirm(`Send a reminder email for ${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}?`)) return;
    setActionLoading('remind-all');
    for (const inv of overdue) {
      await supabase.functions.invoke('generate-invoice', {
        body: { action: 'send-email', invoiceId: inv.id },
      });
    }
    setActionLoading(null);
    loadInvoices();
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <AgingChip label="Current" value={fmtMoney(aging.current)} />
        <AgingChip label="1â€“30 days" value={fmtMoney(aging.d30)} />
        <AgingChip label="31â€“60 days" value={fmtMoney(aging.d60)} />
        <AgingChip label="61â€“90 days" value={fmtMoney(aging.d90)} />
        <AgingChip label="90+ days" value={fmtMoney(aging.older)} warn />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by client, email, or invoice numberâ€¦"
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
        <button onClick={() => downloadCsv('invoices.csv', filtered.map(inv => ({
          invoice_number: inv.invoice_number, client: inv.profile?.full_name || '', email: inv.profile?.email || '',
          status: inv.status, total: inv.total, amount_paid: inv.amount_paid,
          balance: Number(inv.total) - Number(inv.amount_paid), due_date: inv.due_date, issue_date: inv.issue_date,
        })))}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm whitespace-nowrap">
          <Download className="w-4 h-4" /> Export CSV
        </button>
        {stats.overdue > 0 && (
          <button onClick={handleRemindOverdue} disabled={actionLoading === 'remind-all'}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-amber-200 text-amber-700 font-semibold rounded-xl hover:bg-amber-50 transition-colors text-sm whitespace-nowrap disabled:opacity-50">
            {actionLoading === 'remind-all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Remind overdue
          </button>
        )}
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
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <button type="button" onClick={() => setViewInvoice(inv)}
                          className="font-mono text-xs font-semibold text-slate-800 hover:text-emerald-700 hover:underline">
                          {inv.invoice_number}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{inv.profile?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{inv.profile?.email || ''}</p>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell text-slate-500 text-xs">{formatDate(inv.issue_date)}</td>
                      <td className="px-5 py-3 hidden md:table-cell text-slate-500 text-xs">
                        <span className={inv.status === 'overdue' || daysPastDue(inv.due_date) > 0 ? 'text-red-600 font-medium' : ''}>
                          {formatDate(inv.due_date)}
                          {(inv.status === 'sent' || inv.status === 'overdue') && daysPastDue(inv.due_date) > 0 && (
                            <span className="block text-[10px]">{daysPastDue(inv.due_date)}d overdue</span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoney(Number(inv.total), inv.currency)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" onClick={() => setViewInvoice(inv)} title="View invoice"
                            aria-label={`View invoice ${inv.invoice_number}`}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => handleDownloadPdf(inv)} disabled={actionLoading === `pdf-${inv.id}`}
                            title="Download PDF"
                            aria-label={`Download PDF for ${inv.invoice_number}`}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50">
                            {actionLoading === `pdf-${inv.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                          </button>
                          <button type="button" onClick={() => handlePrint(inv)} title="Print"
                            aria-label={`Print invoice ${inv.invoice_number}`}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                            <Printer className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleSendEmail(inv)} disabled={actionLoading === inv.id} title={inv.status === 'overdue' ? 'Send reminder' : 'Send to client'}
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
                            <Send className="w-4 h-4" />
                          </button>
                          {inv.status !== 'paid' && (
                            <button onClick={() => handleMarkPaid(inv)} disabled={actionLoading === inv.id} title="Mark as paid"
                              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(inv)} disabled={actionLoading === inv.id} title="Delete"
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
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
      {viewInvoice && (
        <ViewInvoiceModal
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
          emailing={actionLoading === viewInvoice.id}
          onEmail={() => handleSendEmail(viewInvoice)}
        />
      )}
    </>
  );
}

function AgingChip({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${warn ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200'}`}>
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${warn ? 'text-red-700' : 'text-slate-800'}`}>{value}</p>
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
