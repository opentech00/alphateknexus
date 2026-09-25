import { Loader2, RotateCcw, Search, XCircle } from 'lucide-react';
import { StatusOrb } from './CheckoutUi';
import {
  describePaymentFailure,
  type PaymentFailureCode,
} from '../../lib/paymentFailure';

export function PaymentFailedPanel({
  code,
  reason,
  status,
  reference,
  retrying,
  onRetry,
  onCancel,
  onCheckAgain,
  retryLabel = 'Retry payment',
  cancelLabel = 'Cancel',
}: {
  code?: string | null;
  reason?: string | null;
  status?: string | null;
  reference?: string | null;
  retrying?: boolean;
  onRetry: () => void;
  onCancel: () => void;
  onCheckAgain?: () => void;
  retryLabel?: string;
  cancelLabel?: string;
}) {
  const copy = describePaymentFailure(code, reason, status);
  const showCheck = copy.code === 'timeout' && !!onCheckAgain;

  return (
    <div className="px-6 py-8 text-center animate-slideUp">
      <StatusOrb tone={copy.tone}><XCircle className="w-9 h-9" /></StatusOrb>
      <h2 className="text-2xl font-bold text-slate-900">{copy.title}</h2>
      <p className="mt-3 text-sm text-slate-500 leading-relaxed">{copy.body}</p>
      <div className={`mt-4 rounded-xl border p-3 text-left text-xs leading-relaxed ${
        copy.tone === 'amber' ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-red-50 border-red-100 text-red-700'
      }`}>
        {copy.hint}
      </div>
      {reference && (
        <p className="mt-4 text-xs text-slate-400 font-mono break-all">Ref: {reference}</p>
      )}
      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="w-full min-h-[48px] py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          {retryLabel}
        </button>
        {showCheck && (
          <button
            type="button"
            onClick={onCheckAgain}
            disabled={retrying}
            className="w-full min-h-[48px] py-3.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Search className="w-4 h-4" />
            Check again
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={retrying}
          className="w-full min-h-[48px] py-3.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 active:scale-[0.98] transition-all"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

export function PaymentFailedScreen({
  message,
  failureCode,
  reference,
  onRetry,
  onViewBookings,
}: {
  message: string;
  failureCode?: PaymentFailureCode | string | null;
  reference?: string | null;
  onRetry: () => void;
  onViewBookings: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 sm:py-16">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl shadow-sm">
        <PaymentFailedPanel
          code={failureCode}
          reason={message}
          reference={reference}
          onRetry={onRetry}
          onCancel={onViewBookings}
          retryLabel="Retry payment"
          cancelLabel="View my bookings"
        />
      </div>
    </div>
  );
}

