export type PayslipStatus = 'draft' | 'issued' | 'voided';
export type PaymentMethod = 'bank_transfer' | 'cash' | 'other';

export interface PayslipLine {
  code: string;
  label: string;
  amount: number;
  percent_of_basic?: number | null;
}

export interface EmployeeCompensation {
  employee_id: string;
  basic_salary: number;
  currency: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  default_earnings: PayslipLine[];
  default_deductions: PayslipLine[];
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface Payslip {
  id: string;
  employee_id: string;
  period_year: number;
  period_month: number;
  period_start: string;
  period_end: string;
  status: PayslipStatus;
  currency: string;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  payment_method: PaymentMethod;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  notes: string | null;
  pdf_path: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  issued_at: string | null;
  issued_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  other: 'Other',
};

export const SUGGESTED_EARNINGS: { code: string; label: string }[] = [
  { code: 'transport', label: 'Transport allowance' },
  { code: 'housing', label: 'Housing allowance' },
  { code: 'overtime', label: 'Overtime' },
  { code: 'bonus', label: 'Bonus' },
];

export const SUGGESTED_DEDUCTIONS: { code: string; label: string }[] = [
  { code: 'nassit', label: 'NASSIT' },
  { code: 'paye', label: 'PAYE' },
  { code: 'advance', label: 'Salary advance' },
  { code: 'unpaid_leave', label: 'Unpaid leave' },
];

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function asLines(value: unknown): PayslipLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const r = row as Record<string, unknown>;
    const pct = r.percent_of_basic;
    return {
      code: String(r.code || 'line'),
      label: String(r.label || ''),
      amount: roundMoney(Number(r.amount) || 0),
      percent_of_basic: pct == null || pct === '' ? null : Number(pct),
    };
  });
}

export function resolveLineAmount(line: PayslipLine, basic: number): number {
  const pct = line.percent_of_basic;
  if (pct != null && Number.isFinite(Number(pct)) && Number(pct) !== 0) {
    return roundMoney(basic * Number(pct) / 100);
  }
  return roundMoney(line.amount);
}

export function payslipTotals(earnings: PayslipLine[], deductions: PayslipLine[], basic: number) {
  const resolvedEarnings = earnings.map((l) => ({ ...l, amount: resolveLineAmount(l, basic) }));
  const resolvedDeductions = deductions.map((l) => ({ ...l, amount: resolveLineAmount(l, basic) }));
  const gross_pay = roundMoney(resolvedEarnings.reduce((s, l) => s + l.amount, 0));
  const total_deductions = roundMoney(resolvedDeductions.reduce((s, l) => s + l.amount, 0));
  const net_pay = roundMoney(gross_pay - total_deductions);
  return { earnings: resolvedEarnings, deductions: resolvedDeductions, gross_pay, total_deductions, net_pay };
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function periodBounds(year: number, month: number): { start: string; end: string } {
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(last)}`,
  };
}

export function periodLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function currentPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function monthInputValue(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function parseMonthInput(value: string): { year: number; month: number } {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  if (!m) return currentPeriod();
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function maskAccount(acct: string | null | undefined): string {
  if (!acct) return '—';
  const s = acct.replace(/\s+/g, '');
  if (s.length <= 4) return '••••';
  return `•••• ${s.slice(-4)}`;
}

export function storageFolder(userId: string | null | undefined, employeeId: string): string {
  return userId || employeeId;
}

export function payslipPdfPath(folder: string, year: number, month: number): string {
  return `${folder}/payslips/${year}-${pad2(month)}.pdf`;
}

export function payslipAttachmentPath(folder: string, year: number, month: number, ext: string): string {
  const safe = ext.replace(/^\./, '').toLowerCase() || 'bin';
  return `${folder}/payslips/${year}-${pad2(month)}-attachment.${safe}`;
}

export function emptyLine(kind: 'earning' | 'deduction'): PayslipLine {
  return {
    code: kind === 'earning' ? 'allowance' : 'deduction',
    label: '',
    amount: 0,
    percent_of_basic: null,
  };
}

export function linesFromCompensation(comp: EmployeeCompensation | null): {
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  basic: number;
} {
  const basic = roundMoney(Number(comp?.basic_salary) || 0);
  const extra = (comp?.default_earnings || []).filter((l) => l.code !== 'basic');
  const earnings: PayslipLine[] = [
    { code: 'basic', label: 'Basic salary', amount: basic },
    ...extra,
  ];
  return { earnings, deductions: comp?.default_deductions || [], basic };
}

export function canIssue(earnings: PayslipLine[], netPay: number, basic = 0): boolean {
  const named = earnings.filter((l) => l.label.trim());
  if (named.length === 0) return false;
  const gross = named.reduce((s, l) => s + resolveLineAmount(l, basic), 0);
  return gross > 0 && netPay >= 0;
}

export function fileExt(name: string, mime: string): string {
  const fromName = name.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}
