export type WorkInboxTab = 'mine' | 'quotes' | 'unassigned' | 'cash' | 'tasks';

export type EmployeePage =
  | 'my-day'
  | 'work-inbox'
  | 'division-workspace'
  | 'admin-finance'
  | 'finance'
  | 'wallet'
  | 'receipts'
  | 'finance-services'
  | 'finance-cf'
  | 'finance-smart-sort'
  | 'finance-cleaning'
  | 'finance-security'
  | 'finance-procurement'
  | 'activities'
  | 'documents'
  | 'report'
  | 'performance'
  | 'delegated-tasks'
  | 'cash-collections'
  | 'leave'
  | 'hr-files'
  | 'profile'
  | 'notifications';

export interface NavTarget {
  page: EmployeePage;
  inboxTab?: WorkInboxTab;
  bookingId?: string | null;
}

export const PAGE_LABELS: Record<EmployeePage, string> = {
  'my-day': 'My Day',
  'work-inbox': 'Work inbox',
  'division-workspace': 'Division workspace',
  'admin-finance': 'Admin & Finance',
  finance: 'Finance module',
  wallet: 'Wallet',
  receipts: 'Receipts',
  'finance-services': 'Service ledgers',
  'finance-cf': 'C&F ledger',
  'finance-smart-sort': 'Smart Sort ledger',
  'finance-cleaning': 'Cleaning ledger',
  'finance-security': 'Security ledger',
  'finance-procurement': 'Procurement ledger',
  activities: 'More work',
  documents: 'Documents',
  report: 'Report',
  performance: 'Performance',
  'delegated-tasks': 'Delegated tasks',
  'cash-collections': 'Cash collections',
  leave: 'Leave and attendance',
  'hr-files': 'Payslips and HR files',
  profile: 'Profile',
  notifications: 'Notifications',
};

const PAGE_SET = new Set<string>(Object.keys(PAGE_LABELS));

export function isEmployeePage(value: string): value is EmployeePage {
  return PAGE_SET.has(value);
}

export function destinationForNotification(n: {
  type: string;
  booking_id?: string | null;
  title?: string | null;
  body?: string | null;
}): NavTarget {
  const haystack = `${n.title ?? ''} ${n.body ?? ''}`.toLowerCase();

  if (n.type === 'payslip_issued' || n.type === 'hr_file_uploaded') {
    return { page: 'hr-files' };
  }

  if (n.booking_id) {
    const inboxTab: WorkInboxTab =
      /quote|pending review|pending_review|awaiting approval/.test(haystack) ? 'quotes' : 'mine';
    return { page: 'work-inbox', inboxTab, bookingId: n.booking_id };
  }

  if (/payslip/.test(haystack) || /hr folder/.test(haystack) || /new hr file/.test(haystack)) {
    return { page: 'hr-files' };
  }

  switch (n.type) {
    case 'booking_update':
    case 'message':
    case 'field_dispatch':
      return { page: 'work-inbox', inboxTab: 'mine' };
    case 'payment':
      return { page: 'work-inbox', inboxTab: 'cash' };
    case 'hr_update':
      return { page: 'leave' };
    default:
      return { page: 'notifications' };
  }
}

export function destinationForActivityKey(key: string): NavTarget {
  switch (key) {
    case 'overview':
      return { page: 'my-day' };
    case 'work-queue':
    case 'schedule':
      return { page: 'work-inbox', inboxTab: 'mine' };
    case 'bookings':
      return { page: 'work-inbox', inboxTab: 'quotes' };
    case 'division':
    case 'role':
    case 'id-card':
      return { page: 'profile' };
    case 'manage-division':
      return { page: 'division-workspace' };
    case 'admin-finance':
      return { page: 'admin-finance' };
    default:
      if (isEmployeePage(key)) return { page: key };
      return { page: 'my-day' };
  }
}
