import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, Paperclip } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { fmtDate } from '../types';
import { formatLe } from '../../lib/companyDocs';
import { periodLabel } from '../../admin/hr/payslip';

interface HrDoc {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  description: string | null;
  created_at: string;
}

interface IssuedSlip {
  id: string;
  period_year: number;
  period_month: number;
  net_pay: number;
  issued_at: string | null;
  pdf_path: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
}

const LABELS: Record<string, string> = {
  payslip: 'Payslip',
  policy: 'Policy',
  contract: 'Contract',
  offer_letter: 'Offer letter',
  resume: 'Resume',
  certificate: 'Certificate',
  performance_review: 'Performance review',
  warning_letter: 'Warning letter',
  medical: 'Medical',
  id_copy: 'ID copy',
  cover_letter: 'Cover letter',
  other: 'Document',
};

async function openStoragePath(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('employee-documents').createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return null;
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  return data.signedUrl;
}

export function HrFilesPage() {
  const { employee } = useAuth();
  const [docs, setDocs] = useState<HrDoc[]>([]);
  const [slips, setSlips] = useState<IssuedSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (!employee) { setLoading(false); return; }
    (async () => {
      const [{ data: docData, error: docErr }, { data: slipData, error: slipErr }] = await Promise.all([
        supabase
          .from('employee_documents')
          .select('id, document_type, file_name, file_path, description, created_at')
          .eq('employee_id', employee.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('payslips')
          .select('id, period_year, period_month, net_pay, issued_at, pdf_path, attachment_path, attachment_name')
          .eq('employee_id', employee.id)
          .eq('status', 'issued')
          .order('period_year', { ascending: false })
          .order('period_month', { ascending: false }),
      ]);
      if (docErr) setError(docErr.message);
      else if (slipErr) setError(slipErr.message);
      setDocs((docData as HrDoc[]) || []);
      setSlips(((slipData || []) as IssuedSlip[]).map((s) => ({
        ...s,
        net_pay: Number(s.net_pay) || 0,
      })));
      setLoading(false);
    })();
  }, [employee]);

  const openDoc = async (doc: HrDoc) => {
    setOpening(doc.id);
    setError('');
    const url = await openStoragePath(doc.file_path);
    setOpening(null);
    if (!url) setError('Could not open that file. Ask HR if it was uploaded to your folder.');
  };

  const openSlip = async (slip: IssuedSlip, kind: 'pdf' | 'attachment') => {
    const path = kind === 'pdf' ? slip.pdf_path : slip.attachment_path;
    if (!path) {
      setError(kind === 'pdf' ? 'This payslip has no PDF yet. Ask HR to re-issue it.' : 'No bank proof is attached.');
      return;
    }
    setOpening(`${slip.id}-${kind}`);
    setError('');
    const url = await openStoragePath(path);
    setOpening(null);
    if (!url) setError('Could not open that file. Ask HR if it was uploaded to your folder.');
  };

  const legacyPayslips = docs.filter((d) => d.document_type === 'payslip');
  const other = docs.filter((d) => d.document_type !== 'payslip');

  return (
    <div className="space-y-5 emp-fade-in">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Payslips & HR files</h1>
        <p className="text-sm text-slate-400">Download payslips HR has issued and other documents shared with you.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <section>
            <h2 className="text-sm font-bold text-slate-900 mb-2">Payslips</h2>
            {slips.length === 0 ? (
              <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-4">HR has not issued a payslip yet.</p>
            ) : slips.map((s) => (
              <div key={s.id} className="w-full mb-2 bg-white rounded-xl border border-slate-200 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{periodLabel(s.period_year, s.period_month)}</p>
                    <p className="text-xs text-slate-400">
                      Net {formatLe(s.net_pay)}
                      {s.issued_at ? ` · Issued ${fmtDate(s.issued_at)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openSlip(s, 'pdf')}
                    disabled={opening === `${s.id}-pdf`}
                    aria-busy={opening === `${s.id}-pdf`}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-lg text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {opening === `${s.id}-pdf` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span>Download</span>
                  </button>
                </div>
                {s.attachment_path && (
                  <button
                    type="button"
                    onClick={() => openSlip(s, 'attachment')}
                    disabled={opening === `${s.id}-attachment`}
                    aria-busy={opening === `${s.id}-attachment`}
                    className="mt-2 ml-12 inline-flex items-center gap-1.5 min-h-[44px] text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    {opening === `${s.id}-attachment` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                    {s.attachment_name || 'Bank proof'}
                  </button>
                )}
              </div>
            ))}
          </section>
          {legacyPayslips.length > 0 && (
            <Section title="Older uploaded slips" items={legacyPayslips} opening={opening} onOpen={openDoc} />
          )}
          <Section title="Contracts & other files" items={other} opening={opening} onOpen={openDoc} />
        </>
      )}
    </div>
  );
}

function Section({ title, items, opening, onOpen }: {
  title: string; items: HrDoc[]; opening: string | null; onOpen: (d: HrDoc) => void;
}) {
  return (
    <section>
      <h2 className="text-sm font-bold text-slate-900 mb-2">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-4">Nothing here yet.</p>
      ) : items.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onOpen(d)}
          disabled={opening === d.id}
          aria-busy={opening === d.id}
          className="w-full mb-2 flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3.5 text-left hover:bg-slate-50 min-h-[44px]"
        >
          <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{d.file_name}</p>
            <p className="text-xs text-slate-400">{LABELS[d.document_type] || d.document_type} · {fmtDate(d.created_at)}</p>
          </div>
          {opening === d.id ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <Download className="w-4 h-4 text-slate-400" />}
        </button>
      ))}
    </section>
  );
}
