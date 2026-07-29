export interface Service {
  id: string;
  name: string;
  slug: string;
}

export interface HrRole {
  id: string;
  service_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  is_default: boolean;
  created_at: string;
  services?: Service | null;
}

export interface Employee {
  id: string;
  user_id: string | null;
  employee_number: string;
  full_name: string;
  email: string;
  phone: string | null;
  service_id: string | null;
  role_id: string | null;
  photo_url: string | null;
  hire_date: string | null;
  status: 'active' | 'on_leave' | 'inactive';
  created_at: string;
  updated_at: string;
  services?: Service | null;
  hr_roles?: HrRole | null;
}

export interface IdCard {
  id: string;
  employee_id: string;
  card_number: string;
  qr_payload: string;
  issue_date: string;
  expiry_date: string | null;
  status: 'active' | 'expired' | 'revoked';
  created_at: string;
  employees?: Pick<Employee, 'id' | 'full_name' | 'employee_number' | 'photo_url' | 'email' | 'phone'>;
}

export interface ActivityLog {
  id: string;
  employee_id: string;
  actor_id: string | null;
  action: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  employees?: Pick<Employee, 'id' | 'full_name' | 'employee_number' | 'photo_url'> | null;
}

export const ACTION_META: Record<string, { label: string; cls: string; icon: string }> = {
  role_assigned:    { label: 'Role Assigned',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',  icon: 'emerald' },
  role_unassigned:  { label: 'Role Unassigned',  cls: 'bg-amber-50 text-amber-700 border-amber-200',          icon: 'amber' },
  status_changed:  { label: 'Status Changed',    cls: 'bg-blue-50 text-blue-700 border-blue-200',            icon: 'blue' },
  profile_updated: { label: 'Profile Updated',   cls: 'bg-slate-100 text-slate-600 border-slate-200',        icon: 'slate' },
  login:           { label: 'Login',            cls: 'bg-violet-50 text-violet-700 border-violet-200',      icon: 'violet' },
  created:         { label: 'Employee Created',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',  icon: 'emerald' },
};

export const DIVISIONS = [
  { name: 'Clearing & Forwarding', slug: 'clearing-forwarding' },
  { name: 'Smart Sort / Recycling', slug: 'smart-sort' },
  { name: 'Cleaning Services', slug: 'cleaning-services' },
  { name: 'Private Security', slug: 'private-security' },
  { name: 'Procurement', slug: 'procurement' },
] as const;

export const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  active:    { label: 'Active',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',    dot: 'bg-emerald-500' },
  on_leave:  { label: 'On Leave',  cls: 'bg-amber-50 text-amber-700 border-amber-200',          dot: 'bg-amber-400' },
  inactive:  { label: 'Inactive',  cls: 'bg-slate-100 text-slate-500 border-slate-200',         dot: 'bg-slate-400' },
  pending:   { label: 'Pending',   cls: 'bg-amber-50 text-amber-700 border-amber-200',          dot: 'bg-amber-400' },
  expired:   { label: 'Expired',   cls: 'bg-red-50 text-red-600 border-red-200',                dot: 'bg-red-400' },
  revoked:   { label: 'Revoked',   cls: 'bg-slate-100 text-slate-500 border-slate-200',          dot: 'bg-slate-400' },
};

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00')).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
