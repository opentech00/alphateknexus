export const FINANCE_SERVICE_PAGES = [
  { name: 'Clearing & Forwarding', slug: 'clearing-forwarding', page: 'finance-cf' },
  { name: 'Smart Sort / Recycling', slug: 'waste-management', page: 'finance-smart-sort' },
  { name: 'Cleaning Services', slug: 'cleaning-janitorial', page: 'finance-cleaning' },
  { name: 'Private Security', slug: 'private-security', page: 'finance-security' },
  { name: 'Procurement', slug: 'procurement', page: 'finance-procurement' },
] as const;

export type FinanceServicePage = (typeof FINANCE_SERVICE_PAGES)[number]['page'];

export function financePageForSlug(slug: string | null | undefined): string {
  return FINANCE_SERVICE_PAGES.find((s) => s.slug === slug)?.page || 'finance-services';
}

export function slugForFinancePage(page: string): string | null {
  return FINANCE_SERVICE_PAGES.find((s) => s.page === page)?.slug || null;
}

export const ENTRY_KINDS = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'expense', label: 'Expense' },
  { id: 'adjustment', label: 'Adjustment' },
] as const;

export const ENTRY_CATEGORIES = [
  { id: 'booking', label: 'Hire' },
  { id: 'quote', label: 'Quote' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'supplies', label: 'Supplies' },
  { id: 'operations', label: 'Operations' },
  { id: 'contractor', label: 'Contractor' },
  { id: 'tax', label: 'Tax' },
  { id: 'correction', label: 'Correction' },
  { id: 'other', label: 'Other' },
] as const;

export const PAYMENT_CHANNELS = [
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
  { id: 'unpaid', label: 'Unpaid' },
] as const;

export const SETTLEMENTS = [
  { id: 'pending', label: 'Pending' },
  { id: 'collected', label: 'Collected' },
  { id: 'recorded', label: 'Recorded' },
  { id: 'void', label: 'Void' },
  { id: 'refunded', label: 'Refunded' },
] as const;

export const SETTLE_METHODS = [
  { id: 'cash', label: 'Cash', channel: 'offline' },
  { id: 'bank', label: 'Bank transfer', channel: 'offline' },
  { id: 'wallet', label: 'Wallet', channel: 'online' },
  { id: 'monime', label: 'Mobile money', channel: 'online' },
] as const;
