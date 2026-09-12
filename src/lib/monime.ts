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

/**
 * Creates a Monime checkout session by calling the edge function.
 */
export async function createMonimeCheckout(
  amount: number,
  purpose: PaymentPurpose,
  relatedId?: string,
  reference?: string,
): Promise<CreateCheckoutResult> {
  const { data, error } = await supabase.functions.invoke('create-monime-checkout', {
    body: {
      amount,
      purpose,
      related_id: relatedId || null,
      reference: reference || null,
      app_origin: window.location.origin,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to create checkout session');
  }

  if (!data?.checkoutUrl) {
    throw new Error('No checkout URL returned');
  }

  return {
    checkoutUrl: data.checkoutUrl,
    sessionId: data.sessionId,
    reference: data.reference,
  };
}

/**
 * Opens Monime checkout in a popup window.
 * Use pollPaymentStatus() to detect when payment completes.
 * Does NOT redirect the main page.
 */
export async function startMonimePayment(
  amount: number,
  purpose: PaymentPurpose,
  relatedId?: string,
  reference?: string,
): Promise<CreateCheckoutResult> {
  const result = await createMonimeCheckout(amount, purpose, relatedId, reference);

  const popup = window.open(result.checkoutUrl, '_blank', 'width=500,height=700,scrollbars=yes');
  if (!popup) {
    throw new Error('Popup blocked. Please allow popups for this site.');
  }

  return result;
}

/**
 * Polls the verify endpoint until payment is completed, failed, or max attempts reached.
 * @param reference The payment reference
 * @param onUpdate Optional callback for each poll attempt
 * @param maxAttempts Maximum poll attempts (default 60 = ~2 minutes at 2s intervals)
 */
export async function pollPaymentStatus(
  reference: string,
  onUpdate?: (status: string, attempt: number) => void,
  maxAttempts = 60,
): Promise<{ status: string; reason?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      const result = await verifyMonimePayment(reference);
      onUpdate?.(result.status, attempt);
      if (result.status === 'completed' || result.status === 'failed' || result.status === 'cancelled') {
        return result;
      }
    } catch (err) {
      onUpdate?.('error', attempt);
    }
  }
  return { status: 'pending' };
}

/**
 * Verifies a payment by calling the verify edge function.
 */
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
