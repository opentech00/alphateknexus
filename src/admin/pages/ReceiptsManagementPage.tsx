import { useEffect, useState, useCallback } from 'react';
import {
  Receipt as ReceiptIcon, Search, Loader2, Mail, RefreshCw,
  CheckCircle2, Clock, XCircle, Download, Send,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard } from '../components/ui';

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
  email_sent_at: string | null;
  recipient_email: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

const PURPOSE_LABELS: Record<string, string> = {
  wallet_topup: 'Wallet Top-Up',
  invoice: 'Invoice Payment',
  subscription: 'Subscription',
};

function fmtMoney(n: number) {
  return `SLE ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ReceiptsManagementPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [emailFilter, setEmailFilter] = useState('all');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, totalAmount: 0, emailsSent: 0, pending: 0 });

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payment_receipts')
      .select('*, profiles!payment_receipts_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(200);
    setReceipts((data as Receipt[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  useEffect(() => {
    setStats({
      total: receipts.length,
      totalAmount: receipts.reduce((s, r) => s + Number(r.amount_sle), 0),
      emailsSent: receipts.filter(r => r.email_sent).length,
      pending: receipts.filter(r => !r.email_sent).length,
    });
  }, [receipts]);

  const handleResendEmail = async (receiptId: string) => {
    setResendingId(receiptId);
    try {
      const { error } = await supabase.functions.invoke('send-payment-receipt', {
        body: { receiptId },
      });
      if (!error) {
        setReceipts(prev => prev.map(r => r.id === receiptId ? {
          ...r, email_sent: true, email_sent_at: new Date().toISOString(),
        } : r));
      }
    } catch (e) { /* ignore */ }
    setResendingId(null);
  };

  const handleDownload = (receipt: Receipt) => {
    const html = buildPrintableReceipt(receipt);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${receipt.receipt_number}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filtered = receipts.filter(r => {
    if (purposeFilter !== 'all' && r.purpose !== purposeFilter) return false;
    if (emailFilter === 'sent' && !r.email_sent) return false;
    if (emailFilter === 'pending' && r.email_sent) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = r.profiles?.full_name || '';
      const email = r.profiles?.email || '';
      return name.toLowerCase().includes(q) ||
             email.toLowerCase().includes(q) ||
             r.receipt_number.toLowerCase().includes(q) ||
             r.reference.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Payment Receipts"
        description="View and manage all payment receipts sent to clients"
        icon={ReceiptIcon}
        actions={
          <button
            onClick={loadReceipts}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL RECEIPTS" value={String(stats.total)} icon={ReceiptIcon} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="TOTAL AMOUNT" value={fmtMoney(stats.totalAmount)} icon={ReceiptIcon} color="text-blue-500" accent="bg-blue-50" />
        <StatCard label="EMAILS SENT" value={String(stats.emailsSent)} icon={Mail} color="text-teal-500" accent="bg-teal-50" />
        <StatCard label="EMAILS PENDING" value={String(stats.pending)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client, receipt no, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
        </div>
        <select
          value={purposeFilter}
          onChange={e => setPurposeFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          <option value="all">All Types</option>
          <option value="wallet_topup">Wallet Top-Up</option>
          <option value="invoice">Invoice Payment</option>
          <option value="subscription">Subscription</option>
        </select>
        <select
          value={emailFilter}
          onChange={e => setEmailFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          <option value="all">All Emails</option>
          <option value="sent">Email Sent</option>
          <option value="pending">Email Pending</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
          </div>
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
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Receipt No.</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Client</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden sm:table-cell">Type</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Amount</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Email</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden md:table-cell">Date</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs font-semibold text-slate-800">{r.receipt_number}</p>
                      <p className="font-mono text-[10px] text-slate-400">{r.reference}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{r.profiles?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">{r.profiles?.email || r.recipient_email || ''}</p>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className="text-xs font-medium text-slate-600">{PURPOSE_LABELS[r.purpose] || r.purpose}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoney(Number(r.amount_sle))}</td>
                    <td className="px-5 py-3 text-center">
                      {r.email_sent ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-400 text-xs">{formatDate(r.paid_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleDownload(r)}
                          title="Download receipt"
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResendEmail(r.id)}
                          disabled={resendingId === r.id}
                          title="Resend email"
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {resendingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function buildPrintableReceipt(receipt: Receipt): string {
  const purposeLabel = PURPOSE_LABELS[receipt.purpose] || receipt.purpose;
  const dateStr = new Date(receipt.paid_at).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${receipt.receipt_number}</title>
<style>body{font-family:sans-serif;background:#f1f5f9;margin:0;padding:40px}.r{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}.h{background:linear-gradient(135deg,#0f172a,#1e293b);padding:32px 40px;text-align:center;color:#fff}.h h1{margin:0;font-size:22px}.h p{margin:6px 0 0;color:#94a3b8;font-size:13px}.c{text-align:center;padding:32px 40px 0}.c .ck{display:inline-block;width:56px;height:56px;background:#dcfce7;border-radius:50%;line-height:56px;font-size:28px}.c h2{margin:16px 0 4px;color:#0f172a;font-size:20px}.c p{margin:0;color:#64748b;font-size:14px}.a{text-align:center;padding:24px 40px}.a .l{color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px}.a .v{color:#059669;font-size:32px;font-weight:800;margin-top:8px}.d{padding:0 40px 24px}.d table{width:100%;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;border-collapse:collapse}.d td{padding:14px 20px;border-bottom:1px solid #e2e8f0;font-size:13px}.d td:last-child{text-align:right;font-weight:600;color:#0f172a}.d td:first-child{color:#64748b}.f{padding:0 40px 32px;text-align:center}.f p{color:#94a3b8;font-size:12px;line-height:1.6;margin:0}</style></head><body>
<div class="r"><div class="h"><h1>AlphaTek Nexus</h1><p>Payment Receipt</p></div>
<div class="c"><div class="ck">✓</div><h2>Payment Successful</h2><p>Your payment has been confirmed and processed.</p></div>
<div class="a"><div class="l">Amount Paid</div><div class="v">${receipt.currency} ${receipt.amount_sle.toLocaleString()}</div></div>
<div class="d"><table>
<tr><td>Receipt No.</td><td style="font-family:monospace">${receipt.receipt_number}</td></tr>
<tr><td>Reference</td><td style="font-family:monospace">${receipt.reference}</td></tr>
<tr><td>Type</td><td>${purposeLabel}</td></tr>
<tr><td>Description</td><td>${receipt.description || purposeLabel}</td></tr>
<tr><td>Payment Method</td><td style="text-transform:capitalize">${receipt.payment_method}</td></tr>
<tr><td>Transaction ID</td><td style="font-family:monospace">${receipt.payment_id || 'N/A'}</td></tr>
<tr><td>Date &amp; Time</td><td>${dateStr}</td></tr>
</table></div>
<div class="f"><p>This is an automated receipt for your payment on AlphaTek Nexus.<br/>Please keep this for your records.</p></div></div>
</body></html>`;
}
