import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { fmtDate } from '../types';

interface HrDoc {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  description: string | null;
  created_at: string;
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

export function HrFilesPage() {
  const { employee } = useAuth();
  const [docs, setDocs] = useState<HrDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (!employee) { setLoading(false); return; }
    (async () => {
      const { data, error: err } = await supabase
        .from('employee_documents')
        .select('id, document_type, file_name, file_path, description, created_at')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false });
      if (err) setError(err.message);
      setDocs((data as HrDoc[]) || []);
      setLoading(false);
    })();
  }, [employee]);

  const open = async (doc: HrDoc) => {
    setOpening(doc.id);
    setError('');
    const { data, error: err } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(doc.file_path, 300);
    setOpening(null);
    if (err || !data?.signedUrl) {
      setError('Could not open that file. Ask HR if it was uploaded to your folder.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const payslips = docs.filter((d) => d.document_type === 'payslip');
  const other = docs.filter((d) => d.document_type !== 'payslip');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Payslips & HR files</h1>
        <p className="text-sm text-slate-400">Download documents HR has shared with you. Uploads are done by admin.</p>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <Section title="Payslips" items={payslips} opening={opening} onOpen={open} />
          <Section title="Contracts & other files" items={other} opening={opening} onOpen={open} />
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
          className="w-full mb-2 flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3.5 text-left hover:bg-slate-50"
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
