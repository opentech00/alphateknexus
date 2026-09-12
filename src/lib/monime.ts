import { supabase } from './supabase';

export type PaymentPurpose = 'invoice' | 'wallet_topup' | 'subscription' | 'booking';

export interface MonimePayment {
  id: string;
  checkout_session_id: string | null;
  payment_id: string | null;
  reference: string;
  amount_sle: number;
  status: string;
  purpose: PaymentPurpose;
  related_id: string | null;
  checkout_url: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface CreateCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  reference: string;
}

export interface PendingMonime {
  reference: string;
  amount?: number;
  purpose?: PaymentPurpose;
  relatedId?: string | null;
  status?: string;
  checkoutUrl?: string;
  t?: number;
}

const PENDING_KEY = 'atn-pending-monime';
const RETURN_KEY = 'atn-monime-return';

export function isMobileCheckout(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function savePendingMonime(pending: PendingMonime) {
  const payload = JSON.stringify({ ...pending, t: Date.now() });
  try { sessionStorage.setItem(PENDING_KEY, payload); } catch {}
  try { localStorage.setItem(PENDING_KEY, payload); } catch {}
}

export function readPendingMonime(): PendingMonime | null {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const raw = store.getItem(PENDING_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as PendingMonime;
      if (parsed.t && Date.now() - parsed.t > 30 * 60 * 1000) {
        store.removeItem(PENDING_KEY);
        continue;
      }
      return parsed;
    } catch {
      /* try the next store */
    }
  }
  return null;
}

export function clearPendingMonime() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(RETURN_KEY);
  } catch {}
}

export function resumeTarget(): 'wallet' | 'booking' | 'invoice' | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const flagged = q.get('resume_wallet') === '1'
    || q.get('resume_booking') === '1'
    || q.get('resume_invoice') === '1'
    || q.get('payment') === 'success'
    || q.get('payment') === 'cancel'
    || q.get('payment') === 'cancelled'
    || q.get('status') === 'success'
    || q.get('status') === 'cancel';
  const pending = readPendingMonime();
  if (!flagged && !pending) return null;
  if (q.get('resume_booking') === '1' || pending?.purpose === 'booking') return 'booking';
  if (q.get('resume_invoice') === '1' || pending?.purpose === 'invoice' || pending?.purpose === 'subscription') return 'invoice';
  return 'wallet';
}

export function shouldResumeWallet(): boolean {
  return resumeTarget() === 'wallet';
}

export function consumeStoredReturn(): { status: string; ref: string } | null {
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    localStorage.removeItem(RETURN_KEY);
    const parsed = JSON.parse(raw) as { status?: string; ref?: string; t?: number };
    if (parsed.t && Date.now() - parsed.t > 30 * 60 * 1000) return null;
    return { status: String(parsed.status || 'success').toLowerCase(), ref: parsed.ref || '' };
  } catch {
    return null;
  }
}

export function consumePaymentReturnQuery(): { status: string; ref: string } | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const status = q.get('payment') || q.get('status');
  const resume = q.get('resume_wallet') || q.get('resume_booking') || q.get('resume_invoice');
  const ref = q.get('ref') || '';
  if (!status && !resume && !ref) return null;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('payment');
    url.searchParams.delete('status');
    url.searchParams.delete('ref');
    url.searchParams.delete('resume_wallet');
    url.searchParams.delete('resume_booking');
    url.searchParams.delete('resume_invoice');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {}
  return { status: (status || 'success').toLowerCase(), ref };
}

export function openMonimeCheckout(checkoutUrl: string, pending: PendingMonime): 'popup' | 'redirect' {
  savePendingMonime({ ...pending, checkoutUrl });
  if (!isMobileCheckout()) {
    const popup = window.open(checkoutUrl, 'atn-monime', 'width=480,height=760,scrollbars=yes');
    if (popup && !popup.closed && popup !== window) return 'popup';
  }
  window.location.assign(checkoutUrl);
  return 'redirect';
}

export function createMonimeCheckout(
  amount: number,
  purpose: PaymentPurpose,
  relatedId?: string,
  reference?: string,
): Promise<CreateCheckoutResult> {
  return supabase.functions.invoke('create-monime-checkout', {
    body: {
      amount,
      purpose,
      related_id: relatedId || null,
      reference: reference || null,
      app_origin: window.location.origin,
    },
  }).then(({ data, error }) => {
    if (error) throw new Error(error.message || 'Failed to create checkout session');
    if (!data?.checkoutUrl) throw new Error('No checkout URL returned');
    return {
      checkoutUrl: data.checkoutUrl as string,
      sessionId: data.sessionId as string,
      reference: data.reference as string,
    };
  });
}

export async function startMonimePayment(
  amount: number,
  purpose: PaymentPurpose,
  relatedId?: string,
  reference?: string,
): Promise<CreateCheckoutResult & { mode: 'popup' | 'redirect' }> {
  const result = await createMonimeCheckout(amount, purpose, relatedId, reference);
  const mode = openMonimeCheckout(result.checkoutUrl, {
    reference: result.reference,
    amount,
    purpose,
    relatedId,
  });
  return { ...result, mode };
}

export async function pollPaymentStatus(
  reference: string,
  onUpdate?: (status: string, attempt: number) => void,
  maxAttempts = 90,
): Promise<{ status: string; reason?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await new Promise(resolve => setTimeout(resolve, 1500));
    try {
      const result = await verifyMonimePayment(reference);
      onUpdate?.(result.status, attempt);
      if (result.status === 'completed' || result.status === 'failed' || result.status === 'cancelled') {
        return result;
      }
    } catch {
      onUpdate?.('error', attempt);
    }
  }
  return { status: 'pending' };
}

export async function verifyMonimePayment(reference: string): Promise<{ status: string; reason?: string }> {
  const { data, error } = await supabase.functions.invoke('verify-monime-payment', {
    body: { reference },
  });

  if (error) {
    throw new Error(error.message || 'Failed to verify payment');
  }

  return {
    status: data?.status || 'pending',
    reason: data?.reason,
  };
}
