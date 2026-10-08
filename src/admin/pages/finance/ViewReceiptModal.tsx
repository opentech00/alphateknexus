import { useState, type ReactNode } from 'react';
import { Eye, FileDown, Loader2, Printer, Send, Share2, X } from 'lucide-react';
import { formatDocDate, openPrintableHtml } from '../../../lib/companyDocs';
import { toast } from '../../../components/toast/toast';
import {
  downloadReceiptPdf,
  receiptHtml,
  shareReceipt,
  type OfficialReceipt,
} from './receiptActions';

export function ViewReceiptModal({
  receipt,
  onClose,
  onEmail,
  emailing,
}: {
  receipt: OfficialReceipt;
  onClose: () => void;
  onEmail?: () => void;
  emailing?: boolean;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const html = receiptHtml(receipt);

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      await downloadReceiptPdf(receipt);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the PDF.');
    }
    setPdfBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="view-receipt-title"
        className="bg-[#ececec] rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[96vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0 gap-3">
          <div className="min-w-0">
            <h2 id="view-receipt-title" className="text-lg font-bold text-slate-900">Receipt {receipt.receipt_number}</h2>
            <p className="text-xs text-slate-500">{formatDocDate(receipt.paid_at)} · {receipt.reference}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfBusy}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              PDF
            </button>
            <button
              type="button"
              onClick={() => openPrintableHtml(html, `receipt-${receipt.receipt_number}.html`)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              type="button"
              onClick={async () => { setShareBusy(true); await shareReceipt(receipt); setShareBusy(false); }}
              disabled={shareBusy}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold disabled:opacity-50"
            >
              {shareBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Share
            </button>
            {onEmail && (
              <button type="button" onClick={onEmail} disabled={emailing}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold disabled:opacity-50">
                {emailing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Email'}
              </button>
            )}
            <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close">
              <X className="w-5 h-5 text-slate-500 mx-auto" />
            </button>
          </div>
        </div>
        <div className="overflow-auto flex-1 p-3 sm:p-4">
          <iframe title={`Receipt ${receipt.receipt_number}`} srcDoc={html} className="w-full min-h-[80vh] bg-white rounded-lg border border-slate-200" />
        </div>
      </div>
    </div>
  );
}

export function ReceiptRowActions({
  receipt,
  busy,
  onView,
  onDownload,
  onPrint,
  onShare,
  onEmail,
}: {
  receipt: OfficialReceipt;
  busy?: string | null;
  onView: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onShare: () => void;
  onEmail?: () => void;
}) {
  const spinning = busy === receipt.id || busy === `pdf-${receipt.id}` || busy === `share-${receipt.id}`;
  return (
    <div className="flex items-center justify-center gap-1">
      <IconBtn label={`View receipt ${receipt.receipt_number}`} title="View" onClick={onView}>
        <Eye className="w-4 h-4" />
      </IconBtn>
      <IconBtn
        label={`Download PDF for ${receipt.receipt_number}`}
        title="Download PDF"
        disabled={busy === `pdf-${receipt.id}`}
        onClick={onDownload}
      >
        {busy === `pdf-${receipt.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      </IconBtn>
      <IconBtn label={`Print receipt ${receipt.receipt_number}`} title="Print" onClick={onPrint}>
        <Printer className="w-4 h-4" />
      </IconBtn>
      <IconBtn
        label={`Share receipt ${receipt.receipt_number}`}
        title="Share"
        disabled={busy === `share-${receipt.id}`}
        onClick={onShare}
      >
        {busy === `share-${receipt.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
      </IconBtn>
      {onEmail && (
        <IconBtn
          label={`Email receipt ${receipt.receipt_number}`}
          title="Send to client"
          disabled={spinning && busy === receipt.id}
          onClick={onEmail}
        >
          {busy === receipt.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </IconBtn>
      )}
    </div>
  );
}

function IconBtn({
  children, title, label, onClick, disabled,
}: {
  children: ReactNode; title: string; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}
