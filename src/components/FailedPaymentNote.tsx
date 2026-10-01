import { AlertTriangle } from 'lucide-react';
import { failureCopy, type FailedPaymentAttempt } from '../lib/paymentAttempts';

export function FailedPaymentNote({ attempt }: { attempt: FailedPaymentAttempt | undefined }) {
  if (!attempt) return null;
  const copy = failureCopy(attempt);
  return (
    <div className={`rounded-xl border px-3 py-2 text-left ${
      copy.tone === 'amber' ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-red-50 border-red-100 text-red-700'
    }`}>
      <p className="text-xs font-semibold inline-flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        {copy.title}
      </p>
      <p className="text-[11px] mt-0.5 leading-relaxed">{copy.body}</p>
      <p className="text-[10px] mt-1 font-mono opacity-80">Ref {attempt.reference}</p>
    </div>
  );
}
