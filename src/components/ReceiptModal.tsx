import { useEffect, useState, useRef } from 'react';
import {
  CheckCircle2, X, Download, Share2, Mail, Loader2, Receipt as ReceiptIcon,
  Calendar, CreditCard, Hash, ArrowLeft,
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
}

interface ReceiptModalProps {
  paymentReference: string;
  onClose: () => void;
  onViewBookings?: () => void;
}

const PURPOSE_LABELS: Record<string, string> = {
  wallet_topup: 'Wallet Top-Up',
  wallet_payment: 'Wallet Payment',
  wallet_refund: 'Wallet Refund',
  wallet_adjustment: 'Wallet Adjustment',
  invoice: 'Invoice Payment',
  subscription: 'Subscription Payment',
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

export function ReceiptModal({ paymentReference, onClose, onViewBookings }: ReceiptModalProps) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Poll for the receipt — the edge function creates it asynchronously after payment confirmation
      for (let i = 0; i < 15; i++) {
        const { data } = await supabase
          .from('payment_receipts')
          .select('*')
          .eq('reference', paymentReference)
          .maybeSingle();
        if (!cancelled && data) {
          setReceipt(data as Receipt);
          setLoading(false);
          return;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [paymentReference]);

  const handleResendEmail = async () => {
    if (!receipt) return;
    setResending(true);
    setEmailStatus('idle');
    try {
      const { error } = await supabase.functions.invoke('send-payment-receipt', {
        body: { receiptId: receipt.id },
      });
      if (error) throw new Error(error.message);
      setEmailStatus('sent');
      setReceipt({ ...receipt, email_sent: true });
    } catch {
      setEmailStatus('error');
    }
    setResending(false);
  };

  const handleDownload = async () => {
    if (!receipt) return;
    setDownloading(true);
    try {
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
    } catch (e) {
      console.error('Download failed:', e);
    }
    setDownloading(false);
  };

  const handleShare = async () => {
    if (!receipt) return;
    setSharing(true);
    const shareData = {
      title: `Payment Receipt ${receipt.receipt_number}`,
      text: `AlphaTek Nexus Receipt — ${formatMoney(receipt.amount_sle, receipt.currency)} paid on ${formatDate(receipt.paid_at)}. Receipt No: ${receipt.receipt_number}`,
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
      // user cancelled or clipboard failed
    }
    setSharing(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating your receipt...</p>
        </div>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <ReceiptIcon className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Receipt Not Ready Yet</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Your payment was successful, but the receipt is still being generated. You can find it later in your transaction history.
          </p>
          <div className="space-y-2.5">
            {onViewBookings && (
              <button
                onClick={onViewBookings}
                className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform"
              >
                View My Bookings
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl active:scale-[0.98] transition-transform"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <ReceiptIcon className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Payment Receipt</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Success checkmark */}
        <div className="px-6 pt-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 rounded-full mb-3">
            <CheckCircle2 className="w-9 h-9 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Payment Successful</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Your payment has been confirmed.</p>
        </div>

        {/* Amount */}
        <div className="px-6 py-5 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">Amount Paid</p>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatMoney(receipt.amount_sle, receipt.currency)}
          </p>
        </div>

        {/* Receipt details */}
        <div className="px-6 pb-5">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
            <ReceiptRow icon={<Hash className="w-3.5 h-3.5" />} label="Receipt No." value={receipt.receipt_number} mono />
            <ReceiptRow icon={<ReceiptIcon className="w-3.5 h-3.5" />} label="Reference" value={receipt.reference} mono />
            <ReceiptRow icon={<CreditCard className="w-3.5 h-3.5" />} label="Type" value={PURPOSE_LABELS[receipt.purpose] || receipt.purpose} />
            {receipt.description && <ReceiptRow icon={<ReceiptIcon className="w-3.5 h-3.5" />} label="Description" value={receipt.description} />}
            <ReceiptRow icon={<CreditCard className="w-3.5 h-3.5" />} label="Method" value={receipt.payment_method} capitalize />
            {receipt.payment_id && <ReceiptRow icon={<Hash className="w-3.5 h-3.5" />} label="Transaction ID" value={receipt.payment_id} mono />}
            <ReceiptRow icon={<Calendar className="w-3.5 h-3.5" />} label="Date & Time" value={formatDate(receipt.paid_at)} />
          </div>
        </div>

        {/* Email confirmation banner */}
        <div className="px-6 pb-4">
          {receipt.email_sent ? (
            <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl px-4 py-3">
              <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400 flex-1">
                A receipt has been sent to your email ({receipt.recipient_email || 'on file'}).
              </p>
              <button
                onClick={handleResendEmail}
                disabled={resending}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50 flex-shrink-0"
              >
                {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Resend'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3">
              <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400 flex-1">
                {emailStatus === 'sent' ? 'Receipt email sent!' : emailStatus === 'error' ? 'Failed to send email.' : 'Send receipt to your email?'}
              </p>
              <button
                onClick={handleResendEmail}
                disabled={resending || emailStatus === 'sent'}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline disabled:opacity-50 flex-shrink-0"
              >
                {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : emailStatus === 'sent' ? 'Sent' : 'Send'}
              </button>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-6 pb-6 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center justify-center gap-2 py-3 bg-slate-900 dark:bg-slate-700 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download
            </button>
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Share
            </button>
          </div>
          {onViewBookings && (
            <button
              onClick={onViewBookings}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl active:scale-[0.98] transition-transform"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Bookings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({
  icon, label, value, mono, capitalize,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </span>
      <span className={`text-xs font-semibold text-slate-900 dark:text-slate-100 text-right max-w-[60%] truncate ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>
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
  <div class="check"><div class="check-circle">✓</div><h2>Payment Successful</h2><p>Your payment has been confirmed and processed.</p></div>
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
