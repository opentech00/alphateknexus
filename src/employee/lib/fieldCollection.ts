import { invokeFunction } from '../../lib/monime';
import { supabase } from './supabase';

export interface FieldCollectionSummary {
  total: number | null;
  paid: number;
  due: number;
  payment_status: string | null;
  pending?: { reference: string; checkout_url: string; amount_sle: number; created_at: string } | null;
}

export function fieldCollectionSummary(bookingId: string) {
  return invokeFunction<FieldCollectionSummary>(
    'create-field-collection',
    { booking_id: bookingId, action: 'summary' },
    supabase,
  );
}

export function startFieldCollection(bookingId: string) {
  return invokeFunction<FieldCollectionSummary & { checkoutUrl: string; reference: string; amount: number }>(
    'create-field-collection',
    { booking_id: bookingId, action: 'create', app_origin: window.location.origin },
    supabase,
  );
}

export function fieldCollectionStatus(bookingId: string, reference: string) {
  return invokeFunction<FieldCollectionSummary & { status: string; reference: string }>(
    'create-field-collection',
    { booking_id: bookingId, action: 'status', reference },
    supabase,
  );
}
