import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Check, Download, Eye, FileSpreadsheet, Loader2, Plus,
  RefreshCw, Search, Upload, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import { toast } from '../../components/toast/toast';
import { formatLe } from '../../lib/companyDocs';
import { buildPayslipPdfBlob, downloadBlob } from '../../lib/payslipPdf';
import { DIVISIONS, STATUS_META, type Employee } from '../hr/types';
import {
  asLines,
  canIssue,
  currentPeriod,
  emptyLine,
  fileExt,
  linesFromCompensation,
  maskAccount,
  monthInputValue,
  parseMonthInput,
  payslipAttachmentPath,
  payslipPdfPath,
  payslipTotals,
  periodBounds,
  periodLabel,
  storageFolder,
  SUGGESTED_DEDUCTIONS,
  SUGGESTED_EARNINGS,
  type EmployeeCompensation,
  type PaymentMethod,
  type Payslip,
  type PayslipLine,
} from '../hr/payslip';

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none transition-colors bg-white placeholder-slate-400';
const fieldLabelCls = 'block text-sm font-medium text-slate-700 mb-1.5';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ATTACH_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const STATUS_BADGE: Record<string, string> = {
  missing: 'bg-slate-100 text-slate-600',
  draft: 'bg-amber-50 text-amber-700',
  issued: 'bg-emerald-50 text-emerald-700',
  voided: 'bg-red-50 text-red-600',
};

interface LeaveHint {
  employee_id: string;
  start_date: string;
  end_date: string;
}

function overlapDays(start: string, end: string, pStart: string, pEnd: string): number {
  const a = Math.max(new Date(start).getTime(), new Date(pStart).getTime());
  const b = Math.min(new Date(end).getTime(), new Date(pEnd).getTime());
  if (b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

function pdfInput(emp: Employee, slip: Payslip, earnings: PayslipLine[], deductions: PayslipLine[]) {
  return {
    periodYear: slip.period_year,
    periodMonth: slip.period_month,
    employeeNumber: emp.employee_number,
    employeeName: emp.full_name,
    division: emp.services?.name || '—',
    role: emp.hr_roles?.name || '—',
    currency: slip.currency,
    earnings,
    deductions,
    grossPay: slip.gross_pay,
    totalDeductions: slip.total_deductions,
    netPay: slip.net_pay,
    paymentMethod: slip.payment_method,
    bankName: slip.bank_name,
    accountName: slip.account_name,
    accountNumber: slip.account_number,
    notes: slip.notes,
    issuedAt: slip.issued_at,
  };
}

function LineTable({
  title,
  lines,
  basic,
  suggestions,
  readOnly,
  onChange,
}: {
  title: string;
  lines: PayslipLine[];
  basic: number;
  suggestions: { code: string; label: string }[];
  readOnly: boolean;
  onChange: (next: PayslipLine[]) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">{title}</p>
      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={`${line.code}-${i}`} className="grid grid-cols-[1fr_7rem_5rem_auto] gap-2 items-center">
            <input
              value={line.label}
              readOnly={readOnly}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...line, label: e.target.value };
                onChange(next);
              }}
              className={inputCls}
              aria-label={`${title} label ${i + 1}`}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              readOnly={readOnly}
              value={line.amount}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...line, amount: Number(e.target.value) || 0, percent_of_basic: null };
                onChange(next);
              }}
              className={inputCls}
              aria-label={`${title} amount ${i + 1}`}
            />
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              readOnly={readOnly}
              value={line.percent_of_basic ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const next = [...lines];
                const pct = raw === '' ? null : Number(raw);
                next[i] = {
                  ...line,
                  percent_of_basic: pct,
                  amount: pct == null ? line.amount : Math.round(basic * pct) / 100,
                };
                onChange(next);
              }}
              placeholder="% basic"
              className={inputCls}
              aria-label={`${title} percent ${i + 1}`}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
                className="min-h-[44px] min-w-[44px] text-slate-400 hover:text-red-600"
                aria-label={`Remove ${title} line ${i + 1}`}
              >
                <X className="w-4 h-4 mx-auto" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            onClick={() => onChange([...lines, emptyLine(title.toLowerCase().includes('deduct') ? 'deduction' : 'earning')])}
            className="inline-flex items-center gap-1 min-h-[44px] px-3 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
          {suggestions.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => onChange([...lines, { code: s.code, label: s.label, amount: 0 }])}
              className="min-h-[44px] px-3 text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg hover:bg-slate-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function HrPayslipsPage() {
  const now = currentPeriod();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [compensation, setCompensation] = useState<Record<string, EmployeeCompensation>>({});
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [leaveHints, setLeaveHints] = useState<LeaveHint[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ employee: Employee; slip: Payslip } | null>(null);
  const [voiding, setVoiding] = useState<{ employee: Employee; slip: Payslip } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const attachRef = useRef<HTMLInputElement>(null);
  const attachFor = useRef<{ employee: Employee; slip: Payslip } | null>(null);

  const bounds = periodBounds(year, month);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [
      { data: empData, error: empErr },
      { data: compData },
      { data: slipData, error: slipErr },
      { data: leaveData },
    ] = await Promise.all([
      supabase.from('employees').select('*, services(name, slug), hr_roles(name)').order('full_name'),
      supabase.from('employee_compensation').select('*'),
      supabase.from('payslips').select('*').eq('period_year', year).eq('period_month', month),
      supabase
        .from('leave_requests')
        .select('employee_id, start_date, end_date')
        .eq('status', 'approved')
        .eq('leave_type', 'unpaid')
        .lte('start_date', bounds.end)
        .gte('end_date', bounds.start),
    ]);
    if (empErr) setError(empErr.message);
    else if (slipErr) setError(slipErr.message);
    setEmployees((empData as Employee[]) || []);
    const cmap: Record<string, EmployeeCompensation> = {};
    ((compData || []) as EmployeeCompensation[]).forEach((c) => {
      cmap[c.employee_id] = {
        ...c,
        basic_salary: Number(c.basic_salary) || 0,
        default_earnings: asLines(c.default_earnings),
        default_deductions: asLines(c.default_deductions),
      };
    });
    setCompensation(cmap);
    setSlips(((slipData || []) as Payslip[]).map((s) => ({
      ...s,
      earnings: asLines(s.earnings),
      deductions: asLines(s.deductions),
      gross_pay: Number(s.gross_pay) || 0,
      total_deductions: Number(s.total_deductions) || 0,
      net_pay: Number(s.net_pay) || 0,
    })));
    setLeaveHints((leaveData as LeaveHint[]) || []);
    setSelected(new Set());
    setLoading(false);
  }, [year, month, bounds.end, bounds.start]);

  useEffect(() => { load(); }, [load]);

  const liveByEmp = useMemo(() => {
    const map = new Map<string, Payslip>();
    slips.forEach((s) => {
      if (s.status !== 'voided') map.set(s.employee_id, s);
    });
    return map;
  }, [slips]);

  const voidCountByEmp = useMemo(() => {
    const map = new Map<string, number>();
    slips.forEach((s) => {
      if (s.status === 'voided') map.set(s.employee_id, (map.get(s.employee_id) || 0) + 1);
    });
    return map;
  }, [slips]);

  const unpaidByEmp = useMemo(() => {
    const map = new Map<string, number>();
    leaveHints.forEach((l) => {
      const days = overlapDays(l.start_date, l.end_date, bounds.start, bounds.end);
      map.set(l.employee_id, (map.get(l.employee_id) || 0) + days);
    });
    return map;
  }, [leaveHints, bounds.start, bounds.end]);

  const roster = useMemo(() => {
    return employees.filter((e) => e.status === 'active' || e.status === 'on_leave' || liveByEmp.has(e.id));
  }, [employees, liveByEmp]);

  const rows = useMemo(() => {
    let list = roster;
    if (divisionFilter !== 'all') list = list.filter((e) => e.services?.slug === divisionFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((e) =>
        e.full_name.toLowerCase().includes(s) || e.employee_number.toLowerCase().includes(s),
      );
    }
    const mapped = list.map((employee) => {
      const live = liveByEmp.get(employee.id) || null;
      const runStatus = live?.status || 'missing';
      return { employee, live, runStatus };
    });
    if (statusFilter !== 'all') return mapped.filter((r) => r.runStatus === statusFilter);
    return mapped;
  }, [roster, divisionFilter, search, liveByEmp, statusFilter]);

  const stats = useMemo(() => ({
    missing: roster.filter((e) => !liveByEmp.has(e.id)).length,
    draft: slips.filter((s) => s.status === 'draft').length,
    issued: slips.filter((s) => s.status === 'issued').length,
    voided: slips.filter((s) => s.status === 'voided').length,
  }), [roster, liveByEmp, slips]);

  const createDraft = async (emp: Employee): Promise<Payslip | null> => {
    const existing = liveByEmp.get(emp.id);
    if (existing) return existing;
    const comp = compensation[emp.id] || null;
    const from = linesFromCompensation(comp);
    const totals = payslipTotals(from.earnings, from.deductions, from.basic);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      employee_id: emp.id,
      period_year: year,
      period_month: month,
      period_start: bounds.start,
      period_end: bounds.end,
      status: 'draft',
      currency: 'SLE',
      earnings: totals.earnings,
      deductions: totals.deductions,
      gross_pay: totals.gross_pay,
      total_deductions: totals.total_deductions,
      net_pay: totals.net_pay,
      payment_method: comp?.account_number ? 'bank_transfer' : 'cash',
      bank_name: comp?.bank_name || null,
      account_name: comp?.account_name || null,
      account_number: comp?.account_number || null,
      created_by: user?.id || null,
    };
    const { data, error: err } = await supabase.from('payslips').insert(payload).select('*').single();
    if (err || !data) {
      toast.error(err?.message || 'Could not create draft');
      return null;
    }
    const slip: Payslip = {
      ...(data as Payslip),
      earnings: asLines((data as Payslip).earnings),
      deductions: asLines((data as Payslip).deductions),
      gross_pay: Number((data as Payslip).gross_pay) || 0,
      total_deductions: Number((data as Payslip).total_deductions) || 0,
      net_pay: Number((data as Payslip).net_pay) || 0,
    };
    setSlips((prev) => [slip, ...prev]);
    return slip;
  };

  const generateMissing = async () => {
    setWorking(true);
    let created = 0;
    for (const emp of roster) {
      if (liveByEmp.has(emp.id)) continue;
      const slip = await createDraft(emp);
      if (slip) created += 1;
    }
    setWorking(false);
    toast.success(created ? `Created ${created} draft${created === 1 ? '' : 's'}` : 'No missing drafts');
    await load();
  };

  const issueSlip = async (emp: Employee, slip: Payslip, extras?: { earnings: PayslipLine[]; deductions: PayslipLine[] }) => {
    const basic = Number(compensation[emp.id]?.basic_salary) || extras?.earnings.find((l) => l.code === 'basic')?.amount || 0;
    const earnings = extras?.earnings ?? slip.earnings;
    const deductions = extras?.deductions ?? slip.deductions;
    const totals = payslipTotals(earnings, deductions, basic);
    if (!canIssue(totals.earnings, totals.net_pay, basic)) {
      toast.error(`Cannot issue ${emp.full_name}: add earnings and keep net pay at or above zero`);
      return false;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const folder = storageFolder(emp.user_id, emp.id);
    const path = payslipPdfPath(folder, slip.period_year, slip.period_month);
    const forPdf: Payslip = { ...slip, ...totals, issued_at: new Date().toISOString() };
    const blob = await buildPayslipPdfBlob(pdfInput(emp, forPdf, totals.earnings, totals.deductions));
    const { error: upErr } = await supabase.storage
      .from('employee-documents')
      .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
    if (upErr) {
      toast.error(`PDF upload failed: ${upErr.message}`);
      return false;
    }
    const { error: updErr } = await supabase.from('payslips').update({
      earnings: totals.earnings,
      deductions: totals.deductions,
      gross_pay: totals.gross_pay,
      total_deductions: totals.total_deductions,
      net_pay: totals.net_pay,
      payment_method: slip.payment_method,
      bank_name: slip.bank_name,
      account_name: slip.account_name,
      account_number: slip.account_number,
      notes: slip.notes,
      pdf_path: path,
      status: 'issued',
      issued_at: new Date().toISOString(),
      issued_by: user?.id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', slip.id);
    if (updErr) {
      toast.error(updErr.message);
      return false;
    }
    await supabase.from('employee_activity_logs').insert({
      employee_id: emp.id,
      actor_id: user?.id || null,
      action: 'payslip_issued',
      description: `Payslip issued for ${periodLabel(slip.period_year, slip.period_month)}`,
      metadata: { payslip_id: slip.id, net_pay: totals.net_pay },
    });
    toast.success(`Payslip issued for ${emp.full_name}`);
    return true;
  };

  const issueSelected = async () => {
    setWorking(true);
    let n = 0;
    for (const empId of selected) {
      const emp = employees.find((e) => e.id === empId);
      const slip = liveByEmp.get(empId);
      if (!emp || !slip || slip.status !== 'draft') continue;
      if (await issueSlip(emp, slip)) n += 1;
    }
    setWorking(false);
    if (n) await load();
    else toast.info('No valid drafts selected');
  };

  const downloadPdf = async (emp: Employee, slip: Payslip) => {
    if (slip.pdf_path) {
      const { data, error: err } = await supabase.storage.from('employee-documents').createSignedUrl(slip.pdf_path, 300);
      if (err || !data?.signedUrl) { toast.error('Could not open PDF'); return; }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const blob = await buildPayslipPdfBlob(pdfInput(emp, slip, slip.earnings, slip.deductions));
    downloadBlob(blob, `payslip-${emp.employee_number}-${slip.period_year}-${String(slip.period_month).padStart(2, '0')}.pdf`);
  };

  const confirmVoid = async () => {
    if (!voiding) return;
    if (!voidReason.trim()) { toast.error('Add a void reason'); return; }
    setWorking(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('payslips').update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_by: user?.id || null,
      void_reason: voidReason.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', voiding.slip.id);
    if (err) {
      toast.error(err.message);
      setWorking(false);
      return;
    }
    await supabase.from('employee_activity_logs').insert({
      employee_id: voiding.employee.id,
      actor_id: user?.id || null,
      action: 'payslip_voided',
      description: `Payslip voided for ${periodLabel(voiding.slip.period_year, voiding.slip.period_month)}: ${voidReason.trim()}`,
      metadata: { payslip_id: voiding.slip.id },
    });
    toast.success(`Payslip voided for ${voiding.employee.full_name}`);
    setVoiding(null);
    setVoidReason('');
    setWorking(false);
    await load();
  };

  const onAttachFile = async (file: File) => {
    const target = attachFor.current;
    if (!target) return;
    if (file.size > MAX_FILE_SIZE) { toast.error('File exceeds 10MB'); return; }
    if (file.type && !ATTACH_TYPES.includes(file.type)) { toast.error('Use PDF or an image'); return; }
    const folder = storageFolder(target.employee.user_id, target.employee.id);
    const path = payslipAttachmentPath(folder, target.slip.period_year, target.slip.period_month, fileExt(file.name, file.type));
    const { error: upErr } = await supabase.storage.from('employee-documents').upload(path, file, { upsert: true });
    if (upErr) { toast.error(upErr.message); return; }
    const { error: updErr } = await supabase.from('payslips').update({
      attachment_path: path,
      attachment_name: file.name,
      updated_at: new Date().toISOString(),
    }).eq('id', target.slip.id);
    if (updErr) { toast.error(updErr.message); return; }
    toast.success('Attachment saved');
    await load();
  };

  const openEditor = async (emp: Employee) => {
    const slip = liveByEmp.get(emp.id) || await createDraft(emp);
    if (!slip) return;
    setEditing({ employee: emp, slip });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payslips"
        description={`Issue monthly payslips for ${periodLabel(year, month)}. Generate from pay templates, then preview and issue.`}
        icon={FileSpreadsheet}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={generateMissing}
              disabled={working}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 bg-white border border-slate-200 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50"
            >
              Generate drafts
            </button>
            <button
              type="button"
              onClick={issueSelected}
              disabled={working || selected.size === 0}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] disabled:opacity-50"
            >
              Issue selected
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Missing" value={stats.missing} icon={AlertCircle} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Drafts" value={stats.draft} icon={FileSpreadsheet} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Issued" value={stats.issued} icon={Check} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Voided" value={stats.voided} icon={X} color="text-red-600" accent="bg-red-50" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <label className="sr-only" htmlFor="payslip-period">Pay period</label>
          <input
            id="payslip-period"
            type="month"
            value={monthInputValue(year, month)}
            onChange={(e) => {
              const p = parseMonthInput(e.target.value);
              setYear(p.year);
              setMonth(p.month);
            }}
            className={`${inputCls} max-w-[11rem]`}
          />
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or number…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none min-w-[150px]">
            <option value="all">All divisions</option>
            {DIVISIONS.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none min-w-[120px]">
            <option value="all">All statuses</option>
            <option value="missing">Missing</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
          </select>
          <button type="button" onClick={load} className="p-2.5 min-h-[44px] min-w-[44px] border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 mx-auto ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No employees in this run" description="Adjust filters or add staff in Employees." />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-3 py-3 w-10">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Net</th>
                  <th className="px-3 py-3">Bank</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ employee, live, runStatus }) => {
                  const unpaid = unpaidByEmp.get(employee.id) || 0;
                  const voids = voidCountByEmp.get(employee.id) || 0;
                  const sm = STATUS_META[employee.status] ?? STATUS_META.active;
                  return (
                    <tr key={employee.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(employee.id)}
                          onChange={() => toggleSelect(employee.id)}
                          disabled={live?.status !== 'draft'}
                          aria-label={`Select ${employee.full_name}`}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{employee.full_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{employee.employee_number} · {employee.services?.name || 'Unassigned'}</p>
                        <span className={`inline-flex mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${sm.cls}`}>{sm.label}</span>
                        {!compensation[employee.id] && <span className="ml-1 text-[10px] text-amber-700">No template</span>}
                        {unpaid > 0 && <span className="ml-1 text-[10px] text-slate-500">{unpaid}d unpaid leave</span>}
                        {voids > 0 && runStatus === 'missing' && <span className="ml-1 text-[10px] text-red-500">Voided earlier</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[runStatus]}`}>{runStatus}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{live ? formatLe(live.net_pay) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{maskAccount(live?.account_number || compensation[employee.id]?.account_number)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => openEditor(employee)} className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-slate-100 text-slate-500" aria-label={`Edit ${employee.full_name}`}>
                            <Eye className="w-4 h-4 mx-auto" />
                          </button>
                          {live?.status === 'draft' && (
                            <button type="button" disabled={working} onClick={async () => { setWorking(true); await issueSlip(employee, live); setWorking(false); await load(); }} className="min-h-[44px] px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg">Issue</button>
                          )}
                          {live && (
                            <button type="button" onClick={() => downloadPdf(employee, live)} className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-slate-100 text-slate-500" aria-label={`Download ${employee.full_name}`}>
                              <Download className="w-4 h-4 mx-auto" />
                            </button>
                          )}
                          {live && live.status !== 'voided' && (
                            <button
                              type="button"
                              onClick={() => { attachFor.current = { employee, slip: live }; attachRef.current?.click(); }}
                              className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-slate-100 text-slate-500"
                              aria-label={`Attach file for ${employee.full_name}`}
                            >
                              <Upload className="w-4 h-4 mx-auto" />
                            </button>
                          )}
                          {live?.status === 'issued' && (
                            <button type="button" onClick={() => { setVoiding({ employee, slip: live }); setVoidReason(''); }} className="min-h-[44px] px-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg">Void</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <input
        ref={attachRef}
        type="file"
        accept={ATTACH_TYPES.join(',')}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onAttachFile(f);
        }}
      />

      {editing && (
        <PayslipEditorModal
          employee={editing.employee}
          slip={editing.slip}
          basic={Number(compensation[editing.employee.id]?.basic_salary) || 0}
          unpaidDays={unpaidByEmp.get(editing.employee.id) || 0}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
          onIssue={async (updated) => {
            setWorking(true);
            const ok = await issueSlip(editing.employee, updated.slip, {
              earnings: updated.earnings,
              deductions: updated.deductions,
            });
            setWorking(false);
            if (ok) { setEditing(null); await load(); }
          }}
        />
      )}

      {voiding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setVoiding(null)}>
          <div role="dialog" aria-labelledby="void-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 id="void-title" className="text-lg font-bold text-slate-900">Void payslip</h2>
            <p className="text-sm text-slate-500 mt-1">{voiding.employee.full_name} · {periodLabel(year, month)}. You can issue a replacement after voiding.</p>
            <label className={`${fieldLabelCls} mt-4`} htmlFor="void-reason">Reason</label>
            <textarea id="void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setVoiding(null)} className="min-h-[44px] px-4 border border-slate-200 rounded-xl text-sm font-medium">Cancel</button>
              <button type="button" disabled={working} onClick={confirmVoid} className="min-h-[44px] px-4 bg-red-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">Void</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayslipEditorModal({
  employee,
  slip,
  basic,
  unpaidDays,
  onClose,
  onSaved,
  onIssue,
}: {
  employee: Employee;
  slip: Payslip;
  basic: number;
  unpaidDays: number;
  onClose: () => void;
  onSaved: () => void;
  onIssue: (updated: { slip: Payslip; earnings: PayslipLine[]; deductions: PayslipLine[] }) => void;
}) {
  const readOnly = slip.status === 'issued';
  const [earnings, setEarnings] = useState<PayslipLine[]>(slip.earnings);
  const [deductions, setDeductions] = useState<PayslipLine[]>(slip.deductions);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(slip.payment_method);
  const [bankName, setBankName] = useState(slip.bank_name || '');
  const [accountName, setAccountName] = useState(slip.account_name || '');
  const [accountNumber, setAccountNumber] = useState(slip.account_number || '');
  const [notes, setNotes] = useState(slip.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const totals = payslipTotals(earnings, deductions, basic);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const persist = async (andIssue: boolean) => {
    setSaving(true);
    setError('');
    const payload = {
      earnings: totals.earnings,
      deductions: totals.deductions,
      gross_pay: totals.gross_pay,
      total_deductions: totals.total_deductions,
      net_pay: totals.net_pay,
      payment_method: paymentMethod,
      bank_name: bankName.trim() || null,
      account_name: accountName.trim() || null,
      account_number: accountNumber.trim() || null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = await supabase.from('payslips').update(payload).eq('id', slip.id);
    setSaving(false);
    if (err) { setError(err.message); toast.error(err.message); return; }
    const next: Payslip = { ...slip, ...payload, earnings: totals.earnings, deductions: totals.deductions };
    if (andIssue) onIssue({ slip: next, earnings: totals.earnings, deductions: totals.deductions });
    else {
      toast.success('Draft saved');
      onSaved();
    }
  };

  const preview = async () => {
    const blob = await buildPayslipPdfBlob(pdfInput(employee, { ...slip, ...totals, payment_method: paymentMethod, bank_name: bankName, account_name: accountName, account_number: accountNumber, notes }, totals.earnings, totals.deductions));
    downloadBlob(blob, `payslip-${employee.employee_number}-preview.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="slip-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="slip-title" className="text-lg font-bold text-slate-900">Payslip · {periodLabel(slip.period_year, slip.period_month)}</h2>
            <p className="text-sm text-slate-500 truncate">{employee.full_name} · {employee.employee_number} · {employee.hr_roles?.name || 'No role'}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5 text-slate-400 mx-auto" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && <ErrorBanner message={error} />}
          {unpaidDays > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              {unpaidDays} unpaid leave day{unpaidDays === 1 ? '' : 's'} overlap this period. Hint only — add a deduction if needed.
            </p>
          )}
          <LineTable title="Earnings" lines={earnings} basic={basic} suggestions={SUGGESTED_EARNINGS} readOnly={readOnly} onChange={setEarnings} />
          <LineTable title="Deductions" lines={deductions} basic={basic} suggestions={SUGGESTED_DEDUCTIONS} readOnly={readOnly} onChange={setDeductions} />

          <div className="grid grid-cols-3 gap-3 bg-slate-50 rounded-xl p-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Gross</p>
              <p className="text-sm font-bold text-slate-900">{formatLe(totals.gross_pay)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Deductions</p>
              <p className="text-sm font-bold text-slate-900">{formatLe(totals.total_deductions)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Net</p>
              <p className="text-sm font-bold text-emerald-700">{formatLe(totals.net_pay)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabelCls} htmlFor="pay-method">Payment method</label>
              <select id="pay-method" disabled={readOnly} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={inputCls}>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={fieldLabelCls} htmlFor="bank-name">Bank</label>
              <input id="bank-name" readOnly={readOnly} value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={fieldLabelCls} htmlFor="acct-name">Account name</label>
              <input id="acct-name" readOnly={readOnly} value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={fieldLabelCls} htmlFor="acct-no">Account number</label>
              <input id="acct-no" readOnly={readOnly} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputCls} autoComplete="off" />
            </div>
          </div>
          <div>
            <label className={fieldLabelCls} htmlFor="slip-notes">Notes</label>
            <textarea id="slip-notes" readOnly={readOnly} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
          {slip.attachment_name && (
            <p className="text-xs text-slate-500">Attachment: {slip.attachment_name}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={preview} className="min-h-[44px] px-4 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Preview PDF</button>
          {!readOnly && (
            <>
              <button type="button" disabled={saving} onClick={() => persist(false)} className="min-h-[44px] px-4 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save draft'}
              </button>
              <button type="button" disabled={saving} onClick={() => persist(true)} className="min-h-[44px] px-4 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                Issue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
