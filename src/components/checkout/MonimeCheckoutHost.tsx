import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import {
  CHECKOUT_CLOSE_EVENT,
  CHECKOUT_OPEN_EVENT,
  allowedCheckoutOrigins,
  emitCheckoutClose,
  isCheckoutReturnMessage,
  openPaymentReturnInPlace,
  type CheckoutOpenDetail,
} from '../../lib/checkoutBridge';

export function MonimeCheckoutHost() {
  const [session, setSession] = useState<CheckoutOpenDetail | null>(null);

  const stayInApp = useCallback(() => {
    if (!session) return;
    emitCheckoutClose();
    openPaymentReturnInPlace({ ref: session.reference, status: 'cancel' });
  }, [session]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<CheckoutOpenDetail>).detail;
      if (detail?.reference && detail.checkoutUrl) setSession(detail);
    };
    const onClose = () => setSession(null);
    window.addEventListener(CHECKOUT_OPEN_EVENT, onOpen);
    window.addEventListener(CHECKOUT_CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(CHECKOUT_OPEN_EVENT, onOpen);
      window.removeEventListener(CHECKOUT_CLOSE_EVENT, onClose);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const allowed = new Set(allowedCheckoutOrigins());
    const onMessage = (event: MessageEvent) => {
      if (!allowed.has(event.origin) || !isCheckoutReturnMessage(event.data)) return;
      emitCheckoutClose();
      openPaymentReturnInPlace({
        ref: event.data.ref,
        status: event.data.status || 'cancel',
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [session]);

  useEffect(() => {
    if (!session?.popup) return;
    const timer = window.setInterval(() => {
      try {
        if (session.popup?.closed) stayInApp();
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearInterval(timer);
  }, [session, stayInApp]);

  if (!session) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/50 px-4 py-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 relative animate-slideUp">
        <button
          type="button"
          onClick={stayInApp}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          aria-label="Stay in AlphaTek Nexus"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold uppercase tracking-wide mb-4">
          <ShieldCheck className="w-4 h-4" />
          Secure Monime checkout
        </div>
        <h2 className="text-xl font-bold text-slate-900">Finish payment in the secure window</h2>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed">
          AlphaTek Nexus stays open. If you cancel in Monime, you return here — nothing is charged.
        </p>
        <p className="mt-3 text-xs text-slate-400 font-mono break-all">{session.reference}</p>
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          Waiting for Monime…
        </div>
        <div className="mt-6 grid gap-3">
          <a
            href={session.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-5 py-3 bg-emerald-600 text-white font-semibold rounded-xl text-center hover:bg-emerald-700"
          >
            Reopen checkout
          </a>
          <button
            type="button"
            onClick={stayInApp}
            className="min-h-[48px] px-5 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200"
          >
            I cancelled — back to AlphaTek
          </button>
        </div>
      </div>
    </div>
  );
}
