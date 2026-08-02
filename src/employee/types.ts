export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
}

export interface HrRole {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_default: boolean;
  services?: Service | null;
}

export interface IdCard {
  id: string;
  card_number: string;
  qr_payload: string;
  issue_date: string;
  expiry_date: string | null;
  status: 'active' | 'expired' | 'revoked';
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
  position: string | null;
  date_of_birth: string | null;
  emergency_contact: string | null;
  address: string | null;
  resume_url: string | null;
  must_change_password: boolean;
  services?: Service | null;
  hr_roles?: HrRole | null;
}

export const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending:    { label: 'Pending',   cls: 'bg-amber-50 text-amber-700 border-amber-200',          dot: 'bg-amber-400' },
  confirmed:  { label: 'Confirmed', cls: 'bg-blue-50 text-blue-700 border-blue-200',             dot: 'bg-blue-500' },
  in_progress:{ label: 'In Progress',cls: 'bg-blue-50 text-blue-700 border-blue-200',            dot: 'bg-blue-500' },
  active:    { label: 'Active',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',    dot: 'bg-emerald-500' },
  on_leave:  { label: 'On Leave',  cls: 'bg-amber-50 text-amber-700 border-amber-200',          dot: 'bg-amber-400' },
  inactive:  { label: 'Inactive',  cls: 'bg-slate-100 text-slate-500 border-slate-200',         dot: 'bg-slate-400' },
  expired:   { label: 'Expired',   cls: 'bg-red-50 text-red-600 border-red-200',                dot: 'bg-red-400' },
  revoked:   { label: 'Revoked',   cls: 'bg-slate-100 text-slate-500 border-slate-200',          dot: 'bg-slate-400' },
};

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00')).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
