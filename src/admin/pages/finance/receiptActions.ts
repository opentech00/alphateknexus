import { toast } from '../../../components/toast/toast';
import { buildReceiptHtmlFromRow } from '../../../lib/companyDocs';
import { downloadHtmlAsPdf } from '../../../lib/invoicePdf';
import { toSleCurrencyText } from '../../../lib/money';

export const RECEIPT_PURPOSE_LABELS: Record<string, string> = {
  wallet_topup: 'Wallet Top-Up',
  wallet_payment: 'Wallet Payment',
  wallet_refund: 'Wallet Refund',
  wallet_adjustment: 'Wallet Adjustment',
  invoice: 'Invoice Payment',
  subscription: 'Subscription',
  booking: 'Booking Payment',
};

export const RECEIPT_METHOD_LABELS: Record<string, string> = {
  monime: 'Mobile Money',
  card: 'Debit Card',
  cash: 'Cash',
  bank: 'Bank Deposit',
  bank_transfer: 'Bank Transfer',
  wallet: 'Wallet',
  system: 'System',
  africell_money: 'Africell Money',
  orange_money: 'Orange Money',
  qmoney: 'QMoney',
  admin: 'Admin',
};

export type OfficialReceipt = {
  id: string;
  user_id: string;
  receipt_number: string;
  reference: string;
  amount_sle: number;
  currency?: string;
  purpose: string;
  description: string | null;
  payment_method: string;
  payment_id?: string | null;
  paid_at: string;
  email_sent?: boolean;
  email_sent_at?: string | null;
  recipient_email?: string | null;
  created_at?: string;
  profile?: { full_name: string | null; email: string | null; phone?: string | null };
};

export function receiptClient(r: OfficialReceipt) {
  return {
    full_name: r.profile?.full_name,
    email: r.profile?.email,
    phone: r.profile?.phone,
    recipient_email: r.recipient_email,
  };
}

export function receiptHtml(r: OfficialReceipt) {
  return buildReceiptHtmlFromRow(r, receiptClient(r));
}

export function receiptMoney(r: OfficialReceipt) {
  const cur = toSleCurrencyText(r.currency) || 'SLE';
  return `${cur} ${Number(r.amount_sle).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function receiptShareText(r: OfficialReceipt) {
  const when = new Date(r.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Alphatek receipt ${r.receipt_number} — ${receiptMoney(r)} paid on ${when}. Ref: ${r.reference}`;
}

export async function downloadReceiptPdf(r: OfficialReceipt) {
  await downloadHtmlAsPdf(receiptHtml(r), `receipt-${r.receipt_number}.pdf`);
  toast.success(`Saved receipt-${r.receipt_number}.pdf`);
}

export async function shareDocument(opts: { title: string; text: string; html?: string; filename?: string }) {
  try {
    if (opts.html && typeof navigator.canShare === 'function') {
      const file = new File([opts.html], opts.filename || 'document.html', { type: 'text/html' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: opts.title, text: opts.text, files: [file] });
        return;
      }
    }
    if (navigator.share) {
      await navigator.share({ title: opts.title, text: opts.text });
      return;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(opts.text);
    toast.success('Copied to clipboard');
  } catch {
    toast.error('Could not share this document.');
  }
}

export async function shareReceipt(r: OfficialReceipt) {
  await shareDocument({
    title: `Payment Receipt ${r.receipt_number}`,
    text: receiptShareText(r),
    html: receiptHtml(r),
    filename: `receipt-${r.receipt_number}.html`,
  });
}
