import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Receipt as ReceiptIcon, Search, Download, Share2, Mail, Trash2,
  Loader2, Filter, Calendar, CheckCircle2, AlertTriangle, RefreshCw,
  ChevronRight, Hash, CreditCard, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Receipt {
  id: string;
  receipt_number: string;
  reference: string;
  amount_sle: number;
  currency: string;
  purpose: string;
  description: string | null;
  payment_method: string;
  payment_id: string | null;
  paid_at: string;
  email_sent: boolean;
  recipient_email: string | null;
  wallet_transaction_id: string | null;
}

const PURPOSE_LABELS: Record<string, string> = {
  wallet_topup: 'Wallet Top-Up',
  wallet_payment: 'Wallet Payment',
  wallet_refund: 'Wallet Refund',
  wallet_adjustment: 'Wallet Adjustment',
  invoice: 'Invoice Payment',
  subscription: 'Subscription Payment',
};

const PURPOSE_COLORS: Record<string, { text: string; bg: string }> = {
  wallet_topup: { text: 'text-emerald-700', bg: 'bg-emerald-50' },
  wallet_payment: { text: 'text-blue-700', bg: 'bg-blue-50' },
  wallet_refund: { text: 'text-teal-700', bg: 'bg-teal-50' },
  wallet_adjustment: { text: 'text-amber-700', bg: 'bg-amber-50' },
  invoice: { text: 'text-indigo-700', bg: 'bg-indigo-50' },
  subscription: { text: 'text-rose-700', bg: 'bg-rose-50' },
};

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function ReceiptsPanel() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Receipt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('payment_receipts')
      .select('*')
      .eq('user_id', user.id)
      .order('paid_at', { ascending: false })
      .limit(200);

    if (!error && data) {
      setReceipts(data as Receipt[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  const filtered = useMemo(() => {
    let result = receipts;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.receipt_number.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.payment_id || '').toLowerCase().includes(q)
      );
    }
    if (purposeFilter !== 'all') {
      result = result.filter(r => r.purpose === purposeFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
      result = result.filter(r => new Date(r.paid_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
      result = result.filter(r => new Date(r.paid_at) <= to);
    }
    return result;
  }, [receipts, search, purposeFilter, dateFrom, dateTo]);

  const totalAmount = useMemo(() =>
    filtered.reduce((sum, r) => sum + r.amount_sle, 0), [filtered]
  );

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    const { error } = await supabase
      .from('payment_receipts')
      .delete()
      .eq('id', deleteConfirm.id);
    if (!error) {
      setReceipts(prev => prev.filter(r => r.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    }
    setDeleting(false);
  };

  const handleResendEmail = async () => {
    if (!selectedReceipt) return;
    setResending(true);
    setEmailStatus('idle');
    try {
      const { error } = await supabase.functions.invoke('send-payment-receipt', {
        body: { receiptId: selectedReceipt.id },
      });
      if (error) throw new Error(error.message);
      setEmailStatus('sent');
      setSelectedReceipt({ ...selectedReceipt, email_sent: true });
    } catch {
      setEmailStatus('error');
    }
    setResending(false);
  };

  const handleDownload = async () => {
    if (!selectedReceipt) return;
    setDownloading(true);
    try {
      const html = buildPrintableReceipt(selectedReceipt);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${selectedReceipt.receipt_number}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed:', e);
    }
    setDownloading(false);
  };

  const handleShare = async () => {
    if (!selectedReceipt) return;
    setSharing(true);
    const shareData = {
      title: `Payment Receipt ${selectedReceipt.receipt_number}`,
      text: `AlphaTek Nexus Receipt — ${formatMoney(selectedReceipt.amount_sle, selectedReceipt.currency)} paid on ${formatDate(selectedReceipt.paid_at)}. Receipt No: ${selectedReceipt.receipt_number}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.text);
        alert('Receipt details copied to clipboard!');
      }
    } catch {
      // user cancelled
    }
    setSharing(false);
  };

  const exportCSV = () => {
    const headers = ['Receipt No', 'Reference', 'Amount (SLE)', 'Currency', 'Type', 'Description', 'Method', 'Transaction ID', 'Date'];
    const rows = filtered.map(r => [
      r.receipt_number,
      r.reference,
      r.amount_sle.toFixed(2),
      r.currency,
      PURPOSE_LABELS[r.purpose] || r.purpose,
      (r.description || '').replace(/,/g, ';'),
      r.payment_method,
      r.payment_id || '',
      new Date(r.paid_at).toISOString(),
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Detail View ──
  if (selectedReceipt) {
    const r = selectedReceipt;
    const pc = PURPOSE_COLORS[r.purpose] || { text: 'text-slate-700', bg: 'bg-slate-50' };
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedReceipt(null)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to receipts
        </button>

        <div className="text-center py-4">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-50 rounded-full mb-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Payment Receipt</h3>
          <p className="text-sm text-slate-400 mt-0.5">{formatDate(r.paid_at)}</p>
        </div>

        <div className="text-center py-2">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Amount Paid</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{formatMoney(r.amount_sle, r.currency)}</p>
        </div>

        <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100">
          <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="Receipt No." value={r.receipt_number} mono />
          <DetailRow icon={<ReceiptIcon className="w-3.5 h-3.5" />} label="Reference" value={r.reference} mono />
          <div className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><CreditCard className="w-3.5 h-3.5" />Type</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pc.bg} ${pc.text}`}>{PURPOSE_LABELS[r.purpose] || r.purpose}</span>
          </div>
          {r.description && <DetailRow icon={<ReceiptIcon className="w-3.5 h-3.5" />} label="Description" value={r.description} />}
          <DetailRow icon={<CreditCard className="w-3.5 h-3.5" />} label="Method" value={r.payment_method} capitalize />
          {r.payment_id && <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="Transaction ID" value={r.payment_id} mono />}
          <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="Date & Time" value={formatDate(r.paid_at)} />
        </div>

        <div>
          {r.email_sent ? (
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              <Mail className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700 flex-1">Receipt sent to {r.recipient_email || 'your email'}.</p>
              <button onClick={handleResendEmail} disabled={resending}
                className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50 flex-shrink-0">
                {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Resend'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <Mail className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <p className="text-xs text-blue-700 flex-1">
                {emailStatus === 'sent' ? 'Receipt email sent!' : emailStatus === 'error' ? 'Failed to send email.' : 'Send receipt to your email?'}
              </p>
              <button onClick={handleResendEmail} disabled={resending || emailStatus === 'sent'}
                className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50 flex-shrink-0">
                {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : emailStatus === 'sent' ? 'Sent' : 'Send'}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button onClick={handleDownload} disabled={downloading}
            className="flex flex-col items-center gap-1 py-3 bg-slate-900 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="text-xs">Download</span>
          </button>
          <button onClick={handleShare} disabled={sharing}
            className="flex flex-col items-center gap-1 py-3 bg-blue-600 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50">
            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            <span className="text-xs">Share</span>
          </button>
          <button onClick={() => setDeleteConfirm(r)}
            className="flex flex-col items-center gap-1 py-3 bg-red-50 text-red-600 font-semibold rounded-xl active:scale-[0.98] transition-transform hover:bg-red-100">
            <Trash2 className="w-4 h-4" />
            <span className="text-xs">Delete</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Delete Confirmation ──
  if (deleteConfirm) {
    return (
      <div className="space-y-4">
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-red-50 rounded-full mb-4">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Delete this receipt?</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
            Receipt <span className="font-mono font-semibold">{deleteConfirm.receipt_number}</span> for {formatMoney(deleteConfirm.amount_sle, deleteConfirm.currency)} will be permanently removed. This action cannot be undone.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => setDeleteConfirm(null)}
            className="py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl active:scale-[0.98] transition-transform">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="py-3 bg-red-600 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
        </div>
      </div>
    );
  }

  // ── List View ──
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search receipts..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`p-2.5 rounded-xl border transition-colors ${showFilters || purposeFilter !== 'all' || dateFrom || dateTo ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
        >
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={loadReceipts}
          className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-slate-50/50 rounded-xl p-3 space-y-2.5">
          <select
            value={purposeFilter}
            onChange={e => setPurposeFilter(e.target.value)}
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
          >
            <option value="all">All Types</option>
            <option value="wallet_topup">Wallet Top-Ups</option>
            <option value="wallet_payment">Wallet Payments</option>
            <option value="wallet_refund">Refunds</option>
            <option value="wallet_adjustment">Adjustments</option>
            <option value="invoice">Invoice Payments</option>
            <option value="subscription">Subscriptions</option>
          </select>
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>
          {(purposeFilter !== 'all' || dateFrom || dateTo || search) && (
            <button
              onClick={() => { setPurposeFilter('all'); setDateFrom(''); setDateTo(''); setSearch(''); }}
              className="text-xs text-slate-500 hover:text-red-500 font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between bg-orange-50/50 border border-orange-100 rounded-xl px-4 py-3">
          <div>
            <p className="text-xs text-slate-500 font-medium">{filtered.length} receipt{filtered.length !== 1 ? 's' : ''}</p>
            <p className="text-sm font-bold text-slate-800">Total: {formatMoney(totalAmount, 'SLE')}</p>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-3 py-2 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ReceiptIcon className="w-7 h-7 text-slate-300" />
          </div>
          <p className="font-semibold text-slate-700">{receipts.length === 0 ? 'No receipts yet' : 'No matching receipts'}</p>
          <p className="text-sm text-slate-400 mt-1">
            {receipts.length === 0
              ? 'Your payment receipts will appear here automatically.'
              : 'Try adjusting your search or filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto -mx-1 px-1">
          {filtered.map(r => {
            const pc = PURPOSE_COLORS[r.purpose] || { text: 'text-slate-700', bg: 'bg-slate-50' };
            return (
              <button
                key={r.id}
                onClick={() => setSelectedReceipt(r)}
                className="w-full flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-orange-200 hover:shadow-sm transition-all text-left group"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${pc.bg}`}>
                  <ReceiptIcon className={`w-5 h-5 ${pc.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800 truncate">{PURPOSE_LABELS[r.purpose] || r.purpose}</p>
                    <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">{r.receipt_number}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDateShort(r.paid_at)} · {r.payment_method}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-slate-900">{formatMoney(r.amount_sle, r.currency)}</p>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-orange-400 ml-auto mt-0.5 transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value, mono, capitalize }: {
  icon: React.ReactNode; label: string; value: string; mono?: boolean; capitalize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</span>
      <span className={`text-xs font-semibold text-slate-900 text-right max-w-[60%] truncate ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function buildPrintableReceipt(receipt: Receipt): string {
  const purposeLabel = PURPOSE_LABELS[receipt.purpose] || receipt.purpose;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt ${receipt.receipt_number}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; margin: 0; padding: 40px; }
  .receipt { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px 40px; text-align: center; }
  .header h1 { margin: 0; color: #fff; font-size: 22px; }
  .header p { margin: 6px 0 0; color: #94a3b8; font-size: 13px; }
  .check { text-align: center; padding: 32px 40px 0; }
  .check-circle { display: inline-block; width: 56px; height: 56px; background: #dcfce7; border-radius: 50%; line-height: 56px; font-size: 28px; }
  .check h2 { margin: 16px 0 4px; color: #0f172a; font-size: 20px; }
  .check p { margin: 0; color: #64748b; font-size: 14px; }
  .amount { text-align: center; padding: 24px 40px; }
  .amount .label { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
  .amount .value { color: #059669; font-size: 32px; font-weight: 800; margin-top: 8px; }
  .details { padding: 0 40px 24px; }
  .details table { width: 100%; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; border-collapse: collapse; }
  .details td { padding: 14px 20px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  .details td:last-child { text-align: right; font-weight: 600; color: #0f172a; }
  .details td:first-child { color: #64748b; }
  .footer { padding: 0 40px 32px; text-align: center; }
  .footer p { color: #94a3b8; font-size: 12px; line-height: 1.6; margin: 0; }
</style></head><body>
<div class="receipt">
  <div class="header"><h1>AlphaTek Nexus</h1><p>Payment Receipt</p></div>
  <div class="check"><div class="check-circle">&#10003;</div><h2>Payment Successful</h2><p>Your payment has been confirmed and processed.</p></div>
  <div class="amount"><div class="label">Amount Paid</div><div class="value">${formatMoney(receipt.amount_sle, receipt.currency)}</div></div>
  <div class="details"><table>
    <tr><td>Receipt No.</td><td style="font-family:monospace">${receipt.receipt_number}</td></tr>
    <tr><td>Reference</td><td style="font-family:monospace">${receipt.reference}</td></tr>
    <tr><td>Type</td><td>${purposeLabel}</td></tr>
    <tr><td>Description</td><td>${receipt.description || purposeLabel}</td></tr>
    <tr><td>Payment Method</td><td style="text-transform:capitalize">${receipt.payment_method}</td></tr>
    <tr><td>Transaction ID</td><td style="font-family:monospace">${receipt.payment_id || 'N/A'}</td></tr>
    <tr><td>Date &amp; Time</td><td>${formatDate(receipt.paid_at)}</td></tr>
  </table></div>
  <div class="footer"><p>This is an automated receipt for your payment on AlphaTek Nexus.<br/>Please keep this for your records.</p></div>
</div>
</body></html>`;
}
