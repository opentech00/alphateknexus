import type { IncomingNotification } from '../components/toast/toast';
import { destinationForNotification } from '../employee/lib/workNav';

const SLUG_TO_ADMIN_PAGE: Record<string, string> = {
  'clearing-forwarding': 'division-cf',
  'waste-management': 'division-smart-sort',
  'cleaning-janitorial': 'division-cleaning',
  'private-security': 'division-security',
  'procurement': 'division-procurement',
};

export function destinationForClientNotification(n: IncomingNotification): string {
  if (n.type === 'support') return 'support';
  if (/quote/i.test(`${n.title} ${n.body}`)) return 'quotes';
  if (n.type === 'payment') return 'billing';
  if (n.booking_id || n.type === 'booking_update' || n.type === 'message' || n.type === 'review_prompt') {
    return 'bookings';
  }
  if (n.type === 'subscription') return 'account';
  return 'account';
}

export function destinationForAdminNotification(n: IncomingNotification): string {
  if (n.service_slug && SLUG_TO_ADMIN_PAGE[n.service_slug]) {
    return SLUG_TO_ADMIN_PAGE[n.service_slug];
  }
  switch (n.type) {
    case 'booking_update':
    case 'message':
    case 'review_prompt':
      return 'bookings';
    case 'payment':
      return 'documents';
    case 'support':
      return 'support';
    case 'hr_update':
      return 'hr-employees';
    case 'payslip_issued':
      return 'hr-payslips';
    case 'incident':
    case 'field_dispatch':
      return n.type === 'incident' ? 'field-incidents' : 'field-dispatch';
    default:
      return 'overview';
  }
}

export { destinationForNotification };
