import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, Clock, Download, Filter, Loader2, Receipt as ReceiptIcon, RefreshCw, Search,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { StatCard } from '../../components/ui';
import { SensitiveValue } from '../../../components/SensitiveValue';
import { maskEmail, maskReference, redactCsvValue } from '../../../lib/sensitive';
import { useFinancePrivacy } from '../../../contexts/FinancePrivacyContext';
import { openPrintableHtml } from '../../../lib/companyDocs';
import { toast } from '../../../components/toast/toast';
import { downloadCsv } from './financeCsv';
import {
  downloadReceiptPdf,
  RECEIPT_METHOD_LABELS,
  RECEIPT_PURPOSE_LABELS,
  receiptHtml,
  shareReceipt,
  type OfficialReceipt,
} from './receiptActions';
import { ReceiptRowActions, ViewReceiptModal } from './ViewReceiptModal';

async function loadProfiles(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {} as Record<string, { full_name: string | null; email: string | null; phone: string | null }>;
  const { data } = await supabase.from('profiles').select('id, full_name, email, phone').in('id', unique);
  const map: Record<string, { full_name: string | null; email: string | null; phone: string | null }> = {};
  (data || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email, phone: p.phone }; });
  return map;
}

export function ReceiptsTab() {
  const { privacy, money } = useFinancePrivacy();
  const [receipts, setReceipts] = useState<OfficialReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [emailFilter, setEmailFilter] = useState('all');
  const [viewReceipt, setViewReceipt] = useState<OfficialReceipt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('payment_receipts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) { setLoadError(error.message); setReceipts([]); setLoading(false); return; }
    const rows = (data || []) as OfficialReceipt[];
    const profileMap = await loadProfiles(rows.map((r) => r.user_id));
    setReceipts(rows.map((r) => ({ ...r, profile: profileMap[r.user_id] || { full_name: null, email: null, phone: null } })));
    setLoading(false);
  }, []);

  useEffect(() => { void loadReceipts(); }, [loadReceipts]);

  const stats = useMemo(() => ({
    total: receipts.length,
    totalAmount: receipts.reduce((s, r) => s + Number(r.amount_sle), 0),
    emailsSent: receipts.filter((r) => r.email_sent).length,
    pending: receipts.filter((r) => !r.email_sent).length,
  }), [receipts]);

  const filtered = receipts.filter((r) => {
    if (purposeFilter !== 'all' && r.purpose !== purposeFilter) return false;
    if (methodFilter !== 'all' && r.payment_method !== methodFilter) return false;
    if (emailFilter === 'sent' && !r.email_sent) return false;
    if (emailFilter === 'pending' && r.email_sent) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (r.profile?.full_name || '').toLowerCase().includes(q)
        || (r.profile?.email || '').toLowerCase().includes(q)
        || r.receipt_number.toLowerCase().includes(q)
        || r.reference.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const emailReceipt = async (r: OfficialReceipt) => {
    setBusy(r.id);
    try {
      const { error } = await supabase.functions.invoke('send-payment-receipt', { body: { receiptId: r.id } });
      if (error) throw new Error(error.message);
      setReceipts((prev) => prev.map((row) => row.id === r.id ? { ...row, email_sent: true, email_sent_at: new Date().toISOString() } : row));
      toast.success(`Sent ${r.receipt_number}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the receipt.');
    }
    setBusy(null);
  };

  const handlePdf = async (r: OfficialReceipt) => {
    setBusy(`pdf-${r.id}`);
    try { await downloadReceiptPdf(r); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not create the PDF.'); }
    setBusy(null);
  };

  const handleShare = async (r: OfficialReceipt) => {
    setBusy(`share-${r.id}`);
    await shareReceipt(r);
    setBusy(null);
  };

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load receipts: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="OFFICIAL RECEIPTS" value={String(stats.total)} icon={ReceiptIcon} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="TOTAL AMOUNT" value={money(stats.totalAmount)} icon={ReceiptIcon} color="text-blue-500" accent="bg-blue-50" />
        <StatCard label="EMAILS SENT" value={String(stats.emailsSent)} icon={CheckCircle2} color="text-teal-500" accent="bg-teal-50" />
        <StatCard label="EMAILS PENDING" value={String(stats.pending)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
      </div>

      <p className="text-sm text-slate-500">
        Numbered Alphatek receipts for every confirmed payment — wallet, mobile money, card, cash, and bank deposit.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client, receipt no, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="all">All types</option>
            {Object.entries(RECEIPT_PURPOSE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="all">All methods</option>
            {Object.entries(RECEIPT_METHOD_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="all">All emails</option>
            <option value="sent">Email sent</option>
            <option value="pending">Email pending</option>
          </select>
        </div>
        <button onClick={() => downloadCsv('payment-receipts.csv', filtered.map((r) => ({
          receipt_number: r.receipt_number, client: r.profile?.full_name || '',
          email: redactCsvValue(privacy, 'email', r.profile?.email || ''),
          purpose: r.purpose, method: r.payment_method,
          amount_sle: redactCsvValue(privacy, 'amount', r.amount_sle),
          reference: redactCsvValue(privacy, 'reference', r.reference),
          email_sent: r.email_sent ? 'yes' : 'no', date: r.paid_at,
        })))}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 text-sm whitespace-nowrap">
          <Download className="w-4 h-4" /> Export CSV
        </button>
        <button onClick={() => void loadReceipts()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 text-sm whitespace-nowrap">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <ReceiptIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No receipts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Receipt No.</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Client</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden sm:table-cell">Type</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden md:table-cell">Method</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Email</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <button type="button" onClick={() => setViewReceipt(r)}
                        className="font-mono text-xs font-semibold text-slate-800 hover:text-emerald-700 hover:underline">
                        {r.receipt_number}
                      </button>
                      <p className="font-mono text-[10px] text-slate-400">
                        <SensitiveValue privacy={privacy} masked={maskReference(r.reference)} full={r.reference} mono />
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{r.profile?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">
                        <SensitiveValue privacy={privacy} masked={maskEmail(r.profile?.email || r.recipient_email)} full={r.profile?.email || r.recipient_email || ''} />
                      </p>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell text-xs font-medium text-slate-600">
                      {RECEIPT_PURPOSE_LABELS[r.purpose] || r.purpose}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-xs text-slate-500 capitalize">
                      {RECEIPT_METHOD_LABELS[r.payment_method] || r.payment_method.replace(/_/g, ' ')}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800">{money(Number(r.amount_sle))}</td>
                    <td className="px-5 py-3 text-center">
                      {r.email_sent
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Sent</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium"><Clock className="w-3.5 h-3.5" /> Pending</span>}
                    </td>
                    <td className="px-5 py-3">
                      <ReceiptRowActions
                        receipt={r}
                        busy={busy}
                        onView={() => setViewReceipt(r)}
                        onDownload={() => void handlePdf(r)}
                        onPrint={() => openPrintableHtml(receiptHtml(r), `receipt-${r.receipt_number}.html`)}
                        onShare={() => void handleShare(r)}
                        onEmail={() => void emailReceipt(r)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewReceipt && (
        <ViewReceiptModal
          receipt={viewReceipt}
          onClose={() => setViewReceipt(null)}
          emailing={busy === viewReceipt.id}
          onEmail={() => void emailReceipt(viewReceipt)}
        />
      )}
    </>
  );
}
