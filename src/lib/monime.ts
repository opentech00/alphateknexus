import { Capacitor } from '@capacitor/core';
import type { SupabaseClient } from '@supabase/supabase-js';
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

export type PayMode = 'full' | 'deposit';

export interface CreateCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  reference: string;
  amount: number;
  kind: string;
  redirected: boolean;
}

export interface MonimeReturnContext {
  reference: string;
  purpose: PaymentPurpose;
  relatedId?: string;
  nextPage?: string;
  amount?: number;
  mode?: PayMode;
}

export async function invokeFunction<T = any>(
  name: string,
  body: Record<string, unknown>,
  client: SupabaseClient = supabase,
): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    let message = error.message || 'Request failed';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        /* keep default message */
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const RETURN_KEY = 'atn_monime_return';

export function rememberMonimeReturn(ctx: MonimeReturnContext) {
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function readMonimeReturn(): MonimeReturnContext | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    return raw ? JSON.parse(raw) as MonimeReturnContext : null;
  } catch {
    return null;
  }
}

export function clearMonimeReturn() {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* ignore */
  }
}

function destinationForPurpose(purpose: PaymentPurpose, nextPage?: string): string {
  if (nextPage) return nextPage;
  if (purpose === 'booking') return 'bookings';
  if (purpose === 'invoice') return 'billing';
  if (purpose === 'wallet_topup') return 'account';
  return 'home';
}

export function nextPageForMonime(purpose: PaymentPurpose, nextPage?: string): string {
  return destinationForPurpose(purpose, nextPage);
}

/**
 * Creates a Monime checkout session. For bookings and invoices the server charges the
 * amount due from the ledger; `amount` is only used for wallet top-ups.
 */
export async function createMonimeCheckout(
  amount: number,
  purpose: PaymentPurpose,
  relatedId?: string,
  reference?: string,
  mode: PayMode = 'full',
): Promise<CreateCheckoutResult> {
  const data = await invokeFunction('create-monime-checkout', {
    amount,
    purpose,
    related_id: relatedId || null,
    reference: reference || null,
    mode,
    app_origin: window.location.origin,
  });

  if (!data?.checkoutUrl) {
    throw new Error('No checkout URL returned');
  }

  return {
    checkoutUrl: data.checkoutUrl,
    sessionId: data.sessionId,
    reference: data.reference,
    amount: Number(data.amount ?? amount),
    kind: data.kind || 'full',
    redirected: false,
  };
}

function openMonimeCheckout(url: string): boolean {
  if (Capacitor.isNativePlatform()) {
    const popup = window.open(url, '_blank');
    if (!popup) {
      window.location.assign(url);
      return true;
    }
    return false;
  }
  window.location.assign(url);
  return true;
}

/**
 * Creates a checkout session and navigates to Monime in the same tab.
 * Native WebView falls back to a popup; if that is blocked, same-tab redirect is used.
 */
export async function startMonimePayment(
  amount: number,
  purpose: PaymentPurpose,
  relatedId?: string,
  reference?: string,
  options?: { nextPage?: string; mode?: PayMode },
): Promise<CreateCheckoutResult> {
  const mode = options?.mode || 'full';
  const result = await createMonimeCheckout(amount, purpose, relatedId, reference, mode);
  rememberMonimeReturn({
    reference: result.reference,
    purpose,
    relatedId,
    nextPage: options?.nextPage,
    amount: result.amount,
    mode,
  });
  const redirected = openMonimeCheckout(result.checkoutUrl);
  return { ...result, redirected };
}

/** Starts a fresh checkout for the same payment after a cancel, expiry, or timeout. */
export async function retryMonimePayment(ctx: MonimeReturnContext): Promise<CreateCheckoutResult> {
  return startMonimePayment(ctx.amount ?? 0, ctx.purpose, ctx.relatedId, undefined, {
    nextPage: ctx.nextPage,
    mode: ctx.mode,
  });
}
/**
 * Polls the verify endpoint until payment is completed, failed, or max attempts reached.
 * Used on the payment-return page (and native popup fallback). Do not write ledger from the client.
 */
export async function pollPaymentStatus(
  reference: string,
  onUpdate?: (status: string, attempt: number) => void,
  maxAttempts = 60,
): Promise<VerifyMonimeResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
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
  return { status: 'pending', failure_code: 'timeout' };
}

export interface VerifyMonimeResult {
  status: string;
  reason?: string;
  purpose?: PaymentPurpose;
  related_id?: string | null;
  failure_code?: string | null;
  failure_reason?: string | null;
  amount?: number;
}

export async function verifyMonimePayment(reference: string): Promise<VerifyMonimeResult> {
  const { data, error } = await supabase.functions.invoke('verify-monime-payment', {
    body: { reference },
  });

  if (error) {
    throw new Error(error.message || 'Failed to verify payment');
  }

  return {
    status: data?.status || 'pending',
    reason: data?.failure_reason || data?.reason,
    purpose: data?.purpose,
    related_id: data?.related_id,
    failure_code: data?.failure_code || null,
    failure_reason: data?.failure_reason || data?.reason || null,
    amount: data?.amount,
  };
}
