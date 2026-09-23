import { useEffect, useState } from 'react';
import { Landmark, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../components/toast/toast';
import { ErrorBanner } from '../components/ui';
import {
  asLines,
  emptyLine,
  SUGGESTED_DEDUCTIONS,
  SUGGESTED_EARNINGS,
  type EmployeeCompensation,
  type PayslipLine,
} from './payslip';

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none transition-colors bg-white placeholder-slate-400';
const fieldLabelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

function LineEditor({
  title,
  lines,
  suggestions,
  onChange,
}: {
  title: string;
  lines: PayslipLine[];
  suggestions: { code: string; label: string }[];
  onChange: (next: PayslipLine[]) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{title}</p>
      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={`${line.code}-${i}`} className="grid grid-cols-[1fr_6.5rem_4.5rem_2.25rem] gap-1.5 items-center">
            <input
              value={line.label}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...line, label: e.target.value };
                onChange(next);
              }}
              placeholder="Label"
              className={inputCls}
              aria-label={`${title} label ${i + 1}`}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={line.amount}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...line, amount: Number(e.target.value) || 0 };
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
              value={line.percent_of_basic ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const next = [...lines];
                next[i] = { ...line, percent_of_basic: raw === '' ? null : Number(raw) };
                onChange(next);
              }}
              placeholder="% basic"
              className={inputCls}
              aria-label={`${title} percent of basic ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
              className="h-11 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
              aria-label={`Remove ${title.toLowerCase()} line ${i + 1}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          onClick={() => onChange([...lines, emptyLine(title.toLowerCase().includes('deduct') ? 'deduction' : 'earning')])}
          className="inline-flex items-center gap-1 min-h-[44px] px-3 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <Plus className="w-3.5 h-3.5" /> Add line
        </button>
        {suggestions.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => onChange([...lines, { code: s.code, label: s.label, amount: 0, percent_of_basic: null }])}
            className="min-h-[44px] px-3 text-xs font-medium text-slate-500 border border-dashed border-slate-200 rounded-lg hover:bg-slate-50"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CompensationEditor({ employeeId }: { employeeId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [basic, setBasic] = useState(0);
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [earnings, setEarnings] = useState<PayslipLine[]>([]);
  const [deductions, setDeductions] = useState<PayslipLine[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const { data, error: err } = await supabase
        .from('employee_compensation')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle();
      if (cancelled) return;
      if (err) setError(err.message);
      const row = data as EmployeeCompensation | null;
      setBasic(Number(row?.basic_salary) || 0);
      setBankName(row?.bank_name || '');
      setAccountName(row?.account_name || '');
      setAccountNumber(row?.account_number || '');
      setNotes(row?.notes || '');
      setEarnings(asLines(row?.default_earnings));
      setDeductions(asLines(row?.default_deductions));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  const save = async () => {
    setSaving(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      employee_id: employeeId,
      basic_salary: basic,
      currency: 'SLE',
      bank_name: bankName.trim() || null,
      account_name: accountName.trim() || null,
      account_number: accountNumber.trim() || null,
      default_earnings: earnings.filter((l) => l.label.trim()),
      default_deductions: deductions.filter((l) => l.label.trim()),
      notes: notes.trim() || null,
      updated_by: user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = await supabase.from('employee_compensation').upsert(payload, { onConflict: 'employee_id' });
    setSaving(false);
    if (err) {
      setError(err.message);
      toast.error(err.message);
      return;
    }
    toast.success('Pay template saved');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}
      <div className="flex items-center gap-2 text-slate-700">
        <Landmark className="w-4 h-4" />
        <p className="text-sm font-semibold">Compensation (admin only)</p>
      </div>
      <p className="text-xs text-slate-400">Used to prefill monthly payslip drafts. Staff cannot see this template.</p>
      <div>
        <label className={fieldLabelCls} htmlFor={`basic-${employeeId}`}>Basic salary (Le)</label>
        <input
          id={`basic-${employeeId}`}
          type="number"
          min={0}
          step="0.01"
          value={basic}
          onChange={(e) => setBasic(Number(e.target.value) || 0)}
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={fieldLabelCls} htmlFor={`bank-${employeeId}`}>Bank</label>
          <input id={`bank-${employeeId}`} value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={fieldLabelCls} htmlFor={`acct-name-${employeeId}`}>Account name</label>
          <input id={`acct-name-${employeeId}`} value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={fieldLabelCls} htmlFor={`acct-no-${employeeId}`}>Account number</label>
          <input id={`acct-no-${employeeId}`} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputCls} autoComplete="off" />
        </div>
      </div>
      <LineEditor title="Default earnings" lines={earnings} suggestions={SUGGESTED_EARNINGS} onChange={setEarnings} />
      <LineEditor title="Default deductions" lines={deductions} suggestions={SUGGESTED_DEDUCTIONS} onChange={setDeductions} />
      <div>
        <label className={fieldLabelCls} htmlFor={`notes-${employeeId}`}>Notes</label>
        <textarea id={`notes-${employeeId}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save pay template
      </button>
    </div>
  );
}
