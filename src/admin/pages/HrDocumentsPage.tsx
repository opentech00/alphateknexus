import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText, Search, RefreshCw, Upload, Download, Trash2, X,
  File, Image, FileCheck, AlertCircle, Loader2, FolderOpen,
  Filter, ChevronDown, FileSignature, IdCard, Award, HeartPulse,
  MailWarning, FileSpreadsheet, FileBadge,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import type { Employee } from '../hr/types';

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none transition-colors bg-white placeholder-slate-400';
const sectionCls = 'border border-slate-200 rounded-xl bg-slate-50 p-5';
const sectionLabelCls = 'text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-4 block';
const fieldLabelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ACCEPTED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
];

interface EmployeeDocument {
  id: string;
  employee_id: string;
  uploaded_by: string | null;
  document_type: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  description: string | null;
  created_at: string;
  employees?: Pick<Employee, 'id' | 'full_name' | 'employee_number'>;
}

interface DocTypeMeta {
  label: string;
  icon: typeof FileText;
  color: string;
  bg: string;
}

const DOC_TYPES: Record<string, DocTypeMeta> = {
  resume:             { label: 'Resume / CV',      icon: FileText,        color: 'text-blue-600',       bg: 'bg-blue-50' },
  cover_letter:        { label: 'Cover Letter',     icon: FileText,        color: 'text-cyan-600',       bg: 'bg-cyan-50' },
  contract:           { label: 'Contract',         icon: FileSignature,   color: 'text-emerald-600',   bg: 'bg-emerald-50' },
  offer_letter:       { label: 'Offer Letter',     icon: FileBadge,       color: 'text-teal-600',      bg: 'bg-teal-50' },
  id_copy:            { label: 'ID Copy',          icon: IdCard,         color: 'text-violet-600',    bg: 'bg-violet-50' },
  certificate:        { label: 'Certificate',      icon: Award,           color: 'text-amber-600',     bg: 'bg-amber-50' },
  performance_review: { label: 'Performance Review', icon: FileCheck,     color: 'text-indigo-600',    bg: 'bg-indigo-50' },
  warning_letter:      { label: 'Warning Letter',   icon: MailWarning,    color: 'text-red-600',       bg: 'bg-red-50' },
  medical:            { label: 'Medical Record',    icon: HeartPulse,      color: 'text-rose-600',      bg: 'bg-rose-50' },
  other:              { label: 'Other',             icon: File,            color: 'text-slate-600',     bg: 'bg-slate-50' },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string | null) {
  if (fileType?.startsWith('image/')) return <Image className="w-5 h-5 text-emerald-500" />;
  if (fileType === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-slate-500" />;
}

export function HrDocumentsPage() {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<EmployeeDocument | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const [{ data: docs, error: docsErr }, { data: emps }] = await Promise.all([
      supabase
        .from('employee_documents')
        .select('*, employees!employee_documents_employee_id_fkey(id, full_name, employee_number)')
        .order('created_at', { ascending: false }),
      supabase.from('employees').select('id, full_name, employee_number, email, status').order('full_name'),
    ]);
    if (docsErr) setError(docsErr.message);
    else setDocuments(docs as EmployeeDocument[]);
    setEmployees(emps as Employee[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total: documents.length,
    byType: Object.keys(DOC_TYPES).reduce((acc, key) => {
      acc[key] = documents.filter(d => d.document_type === key).length;
      return acc;
    }, {} as Record<string, number>),
    employeesWithDocs: new Set(documents.map(d => d.employee_id)).size,
  }), [documents]);

  const filtered = useMemo(() => {
    let r = documents;
    if (typeFilter !== 'all') r = r.filter(d => d.document_type === typeFilter);
    if (employeeFilter !== 'all') r = r.filter(d => d.employee_id === employeeFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(d =>
        d.file_name.toLowerCase().includes(s) ||
        d.employees?.full_name.toLowerCase().includes(s) ||
        d.employees?.employee_number.toLowerCase().includes(s) ||
        (d.description || '').toLowerCase().includes(s),
      );
    }
    return r;
  }, [documents, typeFilter, employeeFilter, search]);

  const handleDelete = async (doc: EmployeeDocument) => {
    setDeleteDoc(null);
    const { error: storageErr } = await supabase.storage
      .from('employee-documents')
      .remove([doc.file_path]);
    if (storageErr) { setError(`Failed to delete file: ${storageErr.message}`); return; }
    const { error: dbErr } = await supabase.from('employee_documents').delete().eq('id', doc.id);
    if (dbErr) { setError(dbErr.message); return; }
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    const { data, error: signErr } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(doc.file_path, 300);
    if (signErr || !data?.signedUrl) { setError('Failed to generate download link'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employee Documents"
        description="Store and manage resumes, contracts, certificates, and letters"
        icon={FolderOpen}
        actions={
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload Document
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Documents" value={stats.total} icon={FileText} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Resumes" value={stats.byType.resume || 0} icon={FileText} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Contracts" value={stats.byType.contract || 0} icon={FileSignature} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Employees Covered" value={stats.employeesWithDocs} icon={FileCheck} color="text-amber-600" accent="bg-amber-50" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search file name, employee, description…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="flex gap-3">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none min-w-[140px]">
              <option value="all">All Types</option>
              {Object.entries(DOC_TYPES).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
            <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none min-w-[160px]">
              <option value="all">All Employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
            <button onClick={load} className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No documents found" description="Upload resumes, contracts, certificates, and letters for your employees." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(doc => {
            const meta = DOC_TYPES[doc.document_type] || DOC_TYPES.other;
            const Icon = meta.icon;
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 text-sm truncate" title={doc.file_name}>{doc.file_name}</h3>
                    <p className="text-xs text-slate-400 truncate">{doc.employees?.full_name} · {doc.employees?.employee_number}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.color} flex-shrink-0`}>
                    {meta.label}
                  </span>
                </div>
                {doc.description && (
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{doc.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2.5">
                  <span>{formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleDownload(doc)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Download / View">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteDoc(doc)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showUpload && (
        <UploadDocumentModal
          employees={employees}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); load(); }}
        />
      )}

      {deleteDoc && (
        <DeleteDocumentModal
          doc={deleteDoc}
          onClose={() => setDeleteDoc(null)}
          onConfirm={() => handleDelete(deleteDoc)}
        />
      )}
    </div>
  );
}

// ── Upload Modal ────────────────────────────────────────────────────────────

function UploadDocumentModal({ employees, onClose, onUploaded }: {
  employees: Employee[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [docType, setDocType] = useState('resume');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (f: File): string | null => {
    if (f.size > MAX_FILE_SIZE) return `File exceeds 10MB limit (${formatFileSize(f.size)})`;
    if (f.type && !ACCEPTED_FILE_TYPES.includes(f.type)) return 'Unsupported file type. Use PDF, Word, Excel, images, or text.';
    return null;
  };

  const handleFileSelect = (f: File | null) => {
    if (!f) return;
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError('');
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleSubmit = async () => {
    setError('');
    if (!employeeId) { setError('Please select an employee.'); return; }
    if (!file) { setError('Please select a file to upload.'); return; }
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const filePath = `${employeeId}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
      const { error: uploadErr } = await supabase.storage
        .from('employee-documents')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (uploadErr) { setError(`Upload failed: ${uploadErr.message}`); setLoading(false); return; }

      const { error: insertErr } = await supabase.from('employee_documents').insert({
        employee_id: employeeId,
        uploaded_by: user?.id || null,
        document_type: docType,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type || null,
        file_size: file.size,
        description: description.trim() || null,
      });
      if (insertErr) {
        await supabase.storage.from('employee-documents').remove([filePath]);
        setError(insertErr.message);
        setLoading(false);
        return;
      }
      onUploaded();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3.5 px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Upload className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">Upload Employee Document</h2>
            <p className="text-sm text-slate-500 mt-0.5">Add a resume, contract, certificate, or letter</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && <ErrorBanner message={error} />}

          <div className={sectionCls}>
            <span className={sectionLabelCls}>Document Details</span>
            <div className="space-y-3">
              <div>
                <label className={fieldLabelCls}>Employee <span className="text-red-500">*</span></label>
                <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={inputCls}>
                  <option value="">Select employee…</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_number})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={fieldLabelCls}>Document Type <span className="text-red-500">*</span></label>
                <select value={docType} onChange={e => setDocType(e.target.value)} className={inputCls}>
                  {Object.entries(DOC_TYPES).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={fieldLabelCls}>Description (optional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className={inputCls + ' resize-none'}
                  placeholder="e.g. Signed employment contract — 2026 season"
                />
              </div>
            </div>
          </div>

          <div className={sectionCls}>
            <span className={sectionLabelCls}>File</span>
            <div
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                dragActive ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  {getFileIcon(file.type)}
                  <span className="text-sm font-medium text-slate-700">{file.name}</span>
                  <span className="text-xs text-slate-400">({formatFileSize(file.size)})</span>
                </div>
              ) : (
                <>
                  <Upload className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">Click to browse or drag a file here</p>
                  <p className="text-xs text-slate-400 mt-1">PDF, Word, Excel, images · max 10MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ACCEPTED_FILE_TYPES.join(',')}
                onChange={e => handleFileSelect(e.target.files?.[0] || null)}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] transition-colors disabled:opacity-60"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ───────────────────────────────────────────────

function DeleteDocumentModal({ doc, onClose, onConfirm }: {
  doc: EmployeeDocument;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Delete Document</h2>
            <p className="text-sm text-slate-500">This cannot be undone.</p>
          </div>
        </div>
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
          <p className="text-sm text-red-700">
            You are about to permanently delete <strong>{doc.file_name}</strong>
            {doc.employees && <> for <strong>{doc.employees.full_name}</strong></>}.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 text-sm">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 text-sm flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}
