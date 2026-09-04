export const ORG_ROLES = ['staff', 'field_staff', 'division_head', 'super_admin'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const CAPABILITY_KEYS = [
  'div.view',
  'div.manage_bookings',
  'div.approve_quotes',
  'div.manage_documents',
  'div.message_clients',
  'div.cash_collections',
  'div.reports',
  'div.delegate_tasks',
  'div.manage_staff_access',
  'field.jobs',
  'field.attendance',
  'field.incidents',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export const GRANTABLE_CAPABILITIES: CapabilityKey[] = [
  'div.view',
  'div.manage_bookings',
  'div.approve_quotes',
  'div.manage_documents',
  'div.message_clients',
  'div.cash_collections',
  'div.reports',
  'div.delegate_tasks',
  'field.jobs',
  'field.attendance',
  'field.incidents',
];

export const CAPABILITY_META: Record<CapabilityKey, { label: string; desc: string; group: 'division' | 'field' | 'admin' }> = {
  'div.view': { label: 'View division', desc: 'See bookings and pipeline for this division', group: 'division' },
  'div.manage_bookings': { label: 'Manage bookings', desc: 'Update status and assign jobs', group: 'division' },
  'div.approve_quotes': { label: 'Approve quotes', desc: 'Accept or reject quote requests', group: 'division' },
  'div.manage_documents': { label: 'Manage documents', desc: 'Upload and manage booking documents', group: 'division' },
  'div.message_clients': { label: 'Message clients', desc: 'Send messages on division bookings', group: 'division' },
  'div.cash_collections': { label: 'Cash collections', desc: 'Collect and confirm cash payments', group: 'division' },
  'div.reports': { label: 'Reports', desc: 'View division reports and performance', group: 'division' },
  'div.delegate_tasks': { label: 'Delegate tasks', desc: 'Assign work to staff in this division', group: 'division' },
  'div.manage_staff_access': { label: 'Manage staff access', desc: 'Grant and revoke division capabilities', group: 'admin' },
  'field.jobs': { label: 'Field jobs', desc: 'Accept and complete field assignments', group: 'field' },
  'field.attendance': { label: 'Field attendance', desc: 'Clock in and out on site', group: 'field' },
  'field.incidents': { label: 'Field incidents', desc: 'Report field incidents', group: 'field' },
};

export const CANONICAL_DIVISIONS = [
  { name: 'Clearing & Forwarding', slug: 'clearing-forwarding' },
  { name: 'Smart Sort / Recycling', slug: 'waste-management' },
  { name: 'Cleaning Services', slug: 'cleaning-janitorial' },
  { name: 'Private Security', slug: 'private-security' },
  { name: 'Procurement', slug: 'procurement' },
] as const;

export const SLUG_ALIASES: Record<string, string> = {
  'smart-sort': 'waste-management',
  'cleaning-services': 'cleaning-janitorial',
  'waste-management': 'waste-management',
  'cleaning-janitorial': 'cleaning-janitorial',
  'clearing-forwarding': 'clearing-forwarding',
  'private-security': 'private-security',
  procurement: 'procurement',
};

export function canonicalSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return SLUG_ALIASES[slug] || slug;
}

export function templateKeysForRoleName(name: string | null | undefined): CapabilityKey[] {
  const n = (name || '').toLowerCase();
  if (n.includes('head')) {
    return [...GRANTABLE_CAPABILITIES];
  }
  if (n.includes('supervisor') || n.includes('manager') || n.includes('coordinator')) {
    return ['div.view', 'div.manage_bookings', 'div.delegate_tasks', 'div.reports', 'div.manage_documents'];
  }
  if (
    n.includes('field') ||
    n.includes('guard') ||
    n.includes('driver') ||
    n.includes('janitor') ||
    n.includes('cleaner') ||
    n.includes('patrol') ||
    n.includes('handler')
  ) {
    return ['div.view', 'field.jobs', 'field.attendance'];
  }
  return ['div.view'];
}

export function orgRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'super_admin': return 'Super Admin';
    case 'division_head': return 'Division Head';
    case 'field_staff': return 'Field Staff';
    default: return 'Staff';
  }
}
