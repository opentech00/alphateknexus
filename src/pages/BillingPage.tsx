import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Receipt, Smartphone, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/toast/toast';
import { buildOfficialInvoiceHtml } from '../lib/companyDocs';
import { downloadHtmlAsPdf } from '../lib/invoicePdf';
import { startMonimePayment, pollPaymentStatus } from '../lib/monime';
import { PortalPage } from '../components/portal/PortalPage';
import { moneySLE } from '../lib/money';

type Source = 'finance' | 'smart_sort';

interface HubInvoice {
  id: string;
  source: Source;
  number: string;
  status: string;
  issued: string;
  due: string | null;
  total: number;
  paid: number;
  notes: string | null;
  lines: { description?: string; item?: string; quantity?: number; unit_price?: number; total?: number }[];
}

const OPEN = new Set(['sent', 'overdue', 'pending', 'partial']);

function dueOf(inv: HubInvoice) {
  return Math.max(0, inv.total - inv.paid);
}

export function BillingPage({ onBack }: { onBack?: () => void }) {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<HubInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'open' | 'paid' | 'all'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    const [finance, smart] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, status, issue_date, due_date, total, amount_paid, notes, line_items, subtotal, tax_rate, tax_amount').eq('user_id', user.id).neq('status', 'draft').order('issue_date', { ascending: false }),
      supabase.from('smart_sort_invoices').select('id, invoice_number, status, amount_sle, amount_paid_sle, due_date, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    if (finance.error || smart.error) {
      setError(finance.error?.message || smart.error?.message || 'Could not load invoices');
      setLoading(false);
      return;
    }
    const mapped: HubInvoice[] = [
      ...(finance.data || []).map((r) => ({
        id: r.id,
        source: 'finance' as const,
        number: r.invoice_number,
        status: r.status,
        issued: r.issue_date,
        due: r.due_date,
        total: Number(r.total),
        paid: Number(r.amount_paid || 0),
        notes: r.notes,
        lines: Array.isArray(r.line_items) ? r.line_items : [],
      })),
      ...(smart.data || []).map((r) => ({
        id: r.id,
        source: 'smart_sort' as const,
        number: r.invoice_number || 'Smart Sort',
        status: r.status,
        issued: r.created_at,
        due: r.due_date,
        total: Number(r.amount_sle),
        paid: Number(r.amount_paid_sle || 0),
        notes: null,
        lines: [],
      })),
    ];
    setRows(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'paid') return r.status === 'paid';
    return OPEN.has(r.status) && dueOf(r) > 0;
  }), [rows, filter]);

  const outstanding = rows.filter((r) => OPEN.has(r.status)).reduce((s, r) => s + dueOf(r), 0);

  const payWallet = async (inv: HubInvoice) => {
    setBusyId(inv.id);
    const { data, error: err } = await supabase.rpc('pay_invoice_from_wallet', {
      p_invoice_id: inv.id,
      p_source: inv.source,
    });
    setBusyId(null);
    if (err || data?.success === false) {
      toast.error(data?.error || err?.message || 'Wallet payment failed');
      return;
    }
    toast.success('Invoice paid from your wallet');
    await load();
  };

  const payMonime = async (inv: HubInvoice) => {
    setBusyId(inv.id);
    try {
      const started = await startMonimePayment(dueOf(inv), 'invoice', inv.id, inv.number);
      toast.info('Complete payment in the Monime window');
      const result = await pollPaymentStatus(started.reference);
      if (result.status === 'completed') {
        toast.success('Payment received');
        await load();
      } else if (result.status === 'failed' || result.status === 'cancelled') {
        toast.error('Payment was not completed');
      } else {
        toast.info('Payment is still processing. Refresh in a moment.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start mobile money checkout');
    }
    setBusyId(null);
  };

  const download = async (inv: HubInvoice) => {
    if (inv.source !== 'finance') return;
    setBusyId(inv.id);
    try {
      const html = buildOfficialInvoiceHtml({
        invoiceNumber: inv.number,
        issueDate: inv.issued,
        dueDate: inv.due || inv.issued,
        subtotal: inv.total,
        discountRate: 0,
        discountAmount: 0,
        total: inv.total,
        amountPaid: inv.paid,
        notes: inv.notes,
        lineItems: inv.lines,
        billToName: profile?.full_name || 'Client',
        billToEmail: profile?.email,
        billToPhone: profile?.phone,
      });
      await downloadHtmlAsPdf(html, `invoice-${inv.number}.pdf`);
      toast.success('Invoice downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the invoice');
    }
    setBusyId(null);
  };

  return (
    <PortalPage
      title="Billing"
      subtitle="Invoices from every division, with wallet or mobile money."
      onBack={onBack}
      actions={(
        <p className="text-sm text-slate-600">
          Outstanding <span className="font-semibold text-slate-900">{moneySLE(outstanding)}</span>
        </p>
      )}
    >
      <div role="tablist" aria-label="Invoice filter" className="flex gap-2 overflow-x-auto">
        {(['open', 'paid', 'all'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-[44px] px-4 rounded-full text-sm font-semibold capitalize whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              filter === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {id === 'open' ? 'Due' : id}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

      {loading ? (
        <div className="py-16 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" aria-label="Loading invoices" /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
          <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-3" aria-hidden="true" />
          <p className="font-semibold text-slate-800">No invoices in this view</p>
          <p className="text-sm text-slate-500 mt-1">Sent invoices from Alphatek will show up here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((inv, i) => {
            const due = dueOf(inv);
            const payable = OPEN.has(inv.status) && due > 0;
            return (
              <li
                key={`${inv.source}-${inv.id}`}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 motion-safe:animate-[fadeInUp_0.35s_ease]"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{inv.number}</h2>
                      <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{inv.status.replace('_', ' ')}</span>
                      <span className="text-[11px] text-slate-400">{inv.source === 'smart_sort' ? 'Smart Sort' : 'Invoice'}</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      Issued {new Date(inv.issued).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {inv.due ? ` · Due ${new Date(inv.due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                    <p className="mt-2 text-lg font-bold text-slate-900">{payable ? moneySLE(due) : moneySLE(inv.total)} <span className="text-xs font-medium text-slate-400">{payable ? 'due' : 'total'}</span></p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {inv.source === 'finance' && (
                      <button type="button" disabled={busyId === inv.id} onClick={() => void download(inv)} className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60" aria-label={`Download ${inv.number}`}>
                        <Download className="w-4 h-4" aria-hidden="true" /> PDF
                      </button>
                    )}
                    {payable && (
                      <>
                        <button type="button" disabled={busyId === inv.id} onClick={() => void payWallet(inv)} className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
                          <Wallet className="w-4 h-4" aria-hidden="true" /> Wallet
                        </button>
                        <button type="button" disabled={busyId === inv.id} onClick={() => void payMonime(inv)} className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
                          <Smartphone className="w-4 h-4" aria-hidden="true" /> Mobile money
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PortalPage>
  );
}
