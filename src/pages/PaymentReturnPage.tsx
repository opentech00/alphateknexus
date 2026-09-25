import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { StatusOrb } from '../components/checkout/CheckoutUi';
import {
  clearMonimeReturn,
  nextPageForMonime,
  pollPaymentStatus,
  readMonimeReturn,
  retryMonimePayment,
  verifyMonimePayment,
  type PaymentPurpose,
} from '../lib/monime';
import { toast } from '../components/toast/toast';

export function PaymentReturnPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const statusParam = params.get('status') || '';
  const reference = params.get('ref') || readMonimeReturn()?.reference || '';
  const stored = useMemo(() => readMonimeReturn(), []);

  const [phase, setPhase] = useState<'loading' | 'success' | 'cancel' | 'pending' | 'failed'>(
    statusParam === 'cancel' ? 'cancel' : 'loading',
  );
  const [attempt, setAttempt] = useState(0);

  const destination = (purpose?: PaymentPurpose) =>
    nextPageForMonime(purpose || stored?.purpose || 'wallet_topup', stored?.nextPage);

  const leave = (purpose?: PaymentPurpose) => {
    clearMonimeReturn();
    window.history.replaceState({}, '', window.location.pathname);
    onNavigate(destination(purpose));
  };

  useEffect(() => {
    if (!reference) {
      setPhase('failed');
      toast.error('Missing payment reference.');
      return;
    }
    if (statusParam === 'cancel') {
      toast.info('Payment was cancelled.');
      void verifyMonimePayment(reference).catch(() => {});
      return;
    }

    let cancelled = false;

    const finish = (next: 'success' | 'cancel' | 'failed', purpose?: PaymentPurpose) => {
      setPhase(next);
      if (next === 'success') toast.success('Payment received');
      else if (next === 'cancel') toast.info('Payment was cancelled.');
      else toast.error('Payment was not completed.');
      window.setTimeout(() => leave(purpose), 1400);
    };

    (async () => {
      try {
        const first = await verifyMonimePayment(reference);
        if (cancelled) return;
        if (first.status === 'completed') {
          finish('success', first.purpose);
          return;
        }
        if (first.status === 'failed' || first.status === 'cancelled') {
          finish(first.status === 'cancelled' ? 'cancel' : 'failed', first.purpose);
          return;
        }
        const polled = await pollPaymentStatus(reference, (_status, n) => {
          if (!cancelled) setAttempt(n);
        });
        if (cancelled) return;
        if (polled.status === 'completed') finish('success', polled.purpose);
        else if (polled.status === 'cancelled') finish('cancel', polled.purpose);
        else if (polled.status === 'failed') finish('failed', polled.purpose);
        else setPhase('pending');
      } catch (err) {
        if (!cancelled) {
          setPhase('failed');
          toast.error(err instanceof Error ? err.message : 'Could not confirm payment.');
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, statusParam]);

  const retry = async () => {
    if (!reference) return;
    setPhase('loading');
    try {
      const result = await pollPaymentStatus(reference, (_status, n) => setAttempt(n));
      if (result.status === 'completed') {
        toast.success('Payment received');
        leave(result.purpose);
        return;
      }
      if (result.status === 'failed' || result.status === 'cancelled') {
        setPhase(result.status === 'cancelled' ? 'cancel' : 'failed');
        return;
      }
      setPhase('pending');
    } catch (err) {
      setPhase('failed');
      toast.error(err instanceof Error ? err.message : 'Could not confirm payment.');
    }
  };

  const [restarting, setRestarting] = useState(false);
  const canPayAgain = !!stored && stored.reference === reference && stored.purpose !== 'subscription';

  const payAgain = async () => {
    if (!stored) return;
    setRestarting(true);
    try {
      const result = await retryMonimePayment(stored);
      if (!result.redirected) {
        window.history.replaceState({}, '', `/?page=payment-return&ref=${encodeURIComponent(result.reference)}`);
        window.location.reload();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not restart the payment.');
      setRestarting(false);
    }
  };

  const payAgainButton = canPayAgain ? (
    <button
      type="button"
      onClick={() => void payAgain()}
      disabled={restarting}
      className="min-h-[48px] px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
    >
      {restarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
      Pay again
    </button>
  ) : null;

  const step = phase === 'success' ? 2 : phase === 'loading' || phase === 'pending' ? (attempt > 0 ? 1 : 0) : 0;
  const progress = phase === 'success' ? 1 : Math.min(attempt / 60, 0.92);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 sm:py-16 bg-slate-50">
      <div className="text-center max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm animate-slideUp">
        <ConfirmSteps active={step} />
        {phase === 'loading' && (
          <>
            <ConfirmRing progress={progress} />
            <h1 className="text-xl font-bold text-slate-900">Confirming payment</h1>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              Finish in Monime. This page updates as soon as the payment is confirmed.
            </p>
            {reference && <p className="mt-3 text-xs text-slate-400 font-mono break-all">{reference}</p>}
          </>
        )}
        {phase === 'success' && (
          <>
            <StatusOrb tone="emerald"><CheckCircle2 className="w-9 h-9" /></StatusOrb>
            <h1 className="text-xl font-bold text-slate-900">Payment received</h1>
            <p className="mt-3 text-sm text-slate-500">Taking you back to your account.</p>
          </>
        )}
        {phase === 'cancel' && (
          <>
            <StatusOrb tone="amber"><XCircle className="w-9 h-9" /></StatusOrb>
            <h1 className="text-xl font-bold text-slate-900">Payment cancelled</h1>
            <p className="mt-3 text-sm text-slate-500">Nothing was charged. You can start a fresh checkout whenever you are ready.</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              {payAgainButton}
              <button type="button" onClick={() => leave()} className="min-h-[48px] px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform">
                Continue
              </button>
            </div>
          </>
        )}
        {phase === 'failed' && (
          <>
            <StatusOrb tone="red"><XCircle className="w-9 h-9" /></StatusOrb>
            <h1 className="text-xl font-bold text-slate-900">Payment not confirmed</h1>
            <p className="mt-3 text-sm text-slate-500">
              {reference ? `Reference ${reference}. ` : ''}Check again, or start a fresh payment.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              {payAgainButton}
              {reference && (
                <button type="button" onClick={() => void retry()} className="min-h-[48px] px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform">
                  Check again
                </button>
              )}
              <button type="button" onClick={() => leave()} className="min-h-[48px] px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform">
                Go back
              </button>
            </div>
          </>
        )}
        {phase === 'pending' && (
          <>
            <StatusOrb tone="amber"><Loader2 className="w-9 h-9 animate-spin" /></StatusOrb>
            <h1 className="text-xl font-bold text-slate-900">Still waiting on the bank</h1>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              Complete payment in Monime. This page updates when the bank confirms.
            </p>
            {reference && <p className="mt-2 text-xs text-slate-400 font-mono break-all">{reference}</p>}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <button type="button" onClick={() => void retry()} className="min-h-[48px] px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform">
                Check again
              </button>
              <button type="button" onClick={() => leave()} className="min-h-[48px] px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform">
                Check later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConfirmSteps({ active }: { active: number }) {
  const labels = ['Sent', 'Bank', 'Confirmed'];
  return (
    <ol className="flex items-center justify-between gap-2 mb-6" aria-label="Payment progress">
      {labels.map((label, i) => {
        const done = i <= active;
        return (
          <li key={label} className="flex-1 min-w-0">
            <div className={`h-1.5 rounded-full mb-2 transition-colors duration-300 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            <span className={`block text-[11px] font-semibold truncate ${done ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ConfirmRing({ progress }: { progress: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - Math.max(0.08, Math.min(progress, 1)) * c;
  return (
    <div className="relative w-20 h-20 mx-auto mb-5" role="status" aria-label="Checking payment">
      <svg viewBox="0 0 88 88" className="w-20 h-20">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#d1fae5" strokeWidth="6" />
        <circle
          cx="44" cy="44" r={r} fill="none" stroke="#059669" strokeWidth="6"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className="checkout-ring" transform="rotate(-90 44 44)"
        />
      </svg>
      <Loader2 className="w-6 h-6 text-emerald-600 animate-spin absolute inset-0 m-auto" />
    </div>
  );
}
