import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import {
  exportBrandedTable,
  exportServiceRequests,
  type ExportFormat,
  type ServiceRequestExportRow,
} from '../lib/exportServiceRequests';

type Props = {
  disabled?: boolean;
  documentTitle?: string;
  rows?: ServiceRequestExportRow[];
  headers?: string[];
  tableRows?: string[][];
  filenameStem?: string;
};

export function ServiceRequestExportMenu({
  disabled,
  documentTitle = 'Client Service Requests',
  rows,
  headers,
  tableRows,
  filenameStem,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const empty = rows ? rows.length === 0 : (tableRows?.length || 0) === 0;

  const run = async (format: ExportFormat) => {
    setBusy(format);
    setError(null);
    try {
      if (headers && tableRows) {
        await exportBrandedTable({
          format,
          documentTitle,
          filenameStem: filenameStem || 'Alphateknexus-client-service-requests',
          headers,
          rows: tableRows,
        });
      } else {
        await exportServiceRequests(rows || [], format, documentTitle);
      }
      setOpen(false);
    } catch (err) {
      setError((err as Error).message || 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || empty || Boolean(busy)}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Export
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close export menu" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-30 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Download as</p>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run('pdf')}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <FileText className="w-4 h-4 text-rose-600" />
              PDF
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run('word')}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              MS Word
            </button>
          </div>
        </>
      )}
      {error && <p className="absolute right-0 mt-1 text-xs text-red-600 whitespace-nowrap">{error}</p>}
    </div>
  );
}
