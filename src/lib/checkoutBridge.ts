import { PRODUCTION_HTTPS_ORIGIN } from './site';
import { paymentReturnHref, type PaymentReturnLink } from './paymentReturn';

export const CHECKOUT_RETURN_MESSAGE = 'atn-monime-return';
export const CHECKOUT_OPEN_EVENT = 'atn-checkout-open';
export const CHECKOUT_CLOSE_EVENT = 'atn-checkout-close';
export const PAYMENT_RETURN_EVENT = 'atn-payment-return';

export type CheckoutOpenDetail = {
  reference: string;
  checkoutUrl: string;
  popup?: Window | null;
};

export type CheckoutReturnMessage = {
  type: typeof CHECKOUT_RETURN_MESSAGE;
  ref: string;
  status: string;
};

export function allowedCheckoutOrigins(): string[] {
  const origins = new Set<string>([PRODUCTION_HTTPS_ORIGIN]);
  if (typeof window !== 'undefined' && window.location.origin) {
    origins.add(window.location.origin);
  }
  return [...origins];
}

export function isCheckoutReturnMessage(data: unknown): data is CheckoutReturnMessage {
  if (!data || typeof data !== 'object') return false;
  const value = data as Record<string, unknown>;
  return value.type === CHECKOUT_RETURN_MESSAGE && typeof value.ref === 'string';
}

export function emitCheckoutOpen(detail: CheckoutOpenDetail) {
  window.dispatchEvent(new CustomEvent(CHECKOUT_OPEN_EVENT, { detail }));
}

export function emitCheckoutClose() {
  window.dispatchEvent(new Event(CHECKOUT_CLOSE_EVENT));
}

export function openPaymentReturnInPlace(link: Pick<PaymentReturnLink, 'ref' | 'status'>) {
  window.history.replaceState({}, '', paymentReturnHref(link.ref, link.status));
  window.dispatchEvent(new CustomEvent(PAYMENT_RETURN_EVENT, { detail: link }));
}

export function notifyOpenerOfCheckoutReturn(ref: string, status: string) {
  const opener = window.opener as Window | null;
  if (!opener || opener.closed) return false;
  const payload: CheckoutReturnMessage = { type: CHECKOUT_RETURN_MESSAGE, ref, status };
  for (const origin of allowedCheckoutOrigins()) {
    try {
      opener.postMessage(payload, origin);
    } catch {
      /* ignore */
    }
  }
  return true;
}
