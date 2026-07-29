import { useEffect, useState, useMemo } from 'react';
import {
  FileText, Image, FileSpreadsheet, File, Trash2, Download, Search,
  Filter, XCircle, AlertCircle, X, Building2, Truck, Recycle, Brush,
  ShieldCheck, Package, Calendar, User, Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, EmptyState } from '../components/ui';

interface DocumentRow {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by_admin: boolean;
  created_at: string;
  booking_id: string;
  user_id: string;
  service_slug: string | null;
  bookings: {
    contact_name: string;
    services: { name: string; slug: string };
  } | null;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME = new Set([
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
]);

const ALLOWED_EXTS = new Set(['pdf', 'csv', 'xls', 'xlsx', 'png']);

const DIVISIONS = [
  { label: 'All Documents', slug: 'all', icon: Building2, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
  { label: 'Clearing & Forwarding', slug: 'clearing-forwarding', icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  { label: 'Smart Sort / Recycling', slug: 'waste-management', icon: Recycle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { label: 'Cleaning Services', slug: 'cleaning-janitorial', icon: Brush, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-200' },
  { label: 'Private Security', slug: 'private-security', icon: ShieldCheck, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  { label: 'Procurement', slug: 'procurement', icon: Package, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string | null, fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (fileType === 'application/pdf' || ext === 'pdf') return <FileText className="w-5 h-5 text-red-500" />;
  if (fileType?.startsWith('image/') || ext === 'png') return <Image className="w-5 h-5 text-blue-500" />;
  if (['csv', 'xls', 'xlsx'].includes(ext) || fileType?.includes('sheet') || fileType?.includes('excel') || fileType === 'text/csv') {
    return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
  }
  return <File className="w-5 h-5 text-slate-400" />;
}

function isAllowedFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTS.has(ext)) return `"${file.name}" — only PDF, CSV, Excel (xls/xlsx), and PNG files are allowed`;
  if (!ALLOWED_MIME.has(file.type) && !['xls', 'xlsx'].includes(ext)) {
    // Excel MIME types vary by browser; trust extension for xls/xlsx
    if (!['xls', 'xlsx'].includes(ext)) return `"${file.name}" — unsupported file type`;
  }
  if (file.size > MAX_FILE_SIZE) return `"${file.name}" exceeds 10MB limit (${formatFileSize(file.size)})`;
  return null;
}

export function DocumentsManagementPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDivision, setActiveDivision] = useState('all');
  const [search, setSearch] = useState('');
  const [uploadingForBooking, setUploadingForBooking] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('documents')
      .select(`
        id, file_name, file_url, file_type, file_size, uploaded_by_admin, created_at,
        booking_id, user_id, service_slug,
        bookings ( contact_name, services ( name, slug ) )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
    } else {
      setDocuments((data as unknown as DocumentRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDocuments(); }, []);

  const filtered = useMemo(() => {
    let rows = documents;
    if (activeDivision !== 'all') {
      rows = rows.filter((d) => (d.service_slug || d.bookings?.services?.slug) === activeDivision);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (d) =>
          d.file_name.toLowerCase().includes(q) ||
          d.bookings?.contact_name?.toLowerCase().includes(q) ||
          d.bookings?.services?.name?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [documents, activeDivision, search]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: documents.length };
    DIVISIONS.slice(1).forEach((d) => {
      map[d.slug] = documents.filter((doc) => (doc.service_slug || doc.bookings?.services?.slug) === d.slug).length;
    });
    return map;
  }, [documents]);

  const handleUpload = async (bookingId: string, userId: string, file: File) => {
    const err = isAllowedFile(file);
    if (err) { setUploadError(err); return; }
    setUploadError(null);
    setUploadingForBooking(bookingId);
    try {
      const filename = `${Date.now()}-${file.name}`;
      const filePath = `${userId}/${bookingId}/${filename}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (upErr) { setUploadError(`Upload failed: ${upErr.message}`); return; }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);
      const { error: insErr } = await supabase.from('documents').insert({
        booking_id: bookingId,
        user_id: userId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        uploaded_by_admin: true,
        service_slug: activeDivision !== 'all' ? activeDivision : null,
      });
      if (insErr) {
        setUploadError(`Failed to save record: ${insErr.message}`);
        await supabase.storage.from('documents').remove([filePath]);
      } else {
        await fetchDocuments();
      }
    } finally {
      setUploadingForBooking(null);
    }
  };

  const handleDelete = async (doc: DocumentRow) => {
    if (!window.confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    const filePath = `${doc.user_id}/${doc.booking_id}/${doc.file_url.split('/').pop()}`;
    await supabase.storage.from('documents').remove([filePath]);
    await supabase.from('documents').delete().eq('id', doc.id);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    setDeletingId(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Documents Management"
        description="Access and manage documents submitted by clients across all divisions"
        icon={FileText}
      />

      {/* Validation notice */}
      <div className="mb-4 flex items-center gap-2 text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
        <AlertCircle className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        Accepted: <span className="font-semibold">PDF, CSV, Excel (xls/xlsx), PNG</span> — max <span className="font-semibold">10MB</span> per file.
      </div>

      {/* Division categories */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {DIVISIONS.map((div) => {
          const Icon = div.icon;
          const active = activeDivision === div.slug;
          return (
            <button
              key={div.slug}
              onClick={() => setActiveDivision(div.slug)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all border ${
                active ? `${div.bg} ${div.color} ${div.border}` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {div.label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-white/70' : 'bg-slate-100'}`}>
                {counts[div.slug] || 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by file name, client, or service..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      {uploadError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Documents */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={XCircle}
          title="No documents found"
          description={search || activeDivision !== 'all' ? 'Try adjusting filters.' : 'No documents have been uploaded yet.'}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">File</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Client</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden lg:table-cell">Division</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Size</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden lg:table-cell">Date</th>
                  <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((doc) => {
                  const div = DIVISIONS.find((d) => d.slug === (doc.service_slug || doc.bookings?.services?.slug)) || DIVISIONS[0];
                  const DivIcon = div.icon;
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {getFileIcon(doc.file_type, doc.file_name)}
                          <div className="min-w-0">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-slate-800 hover:text-emerald-600 truncate block max-w-[200px]"
                              title={doc.file_name}
                            >
                              {doc.file_name}
                            </a>
                            {doc.uploaded_by_admin && (
                              <span className="inline-block mt-0.5 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Admin</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {doc.bookings?.contact_name || 'Unknown'}
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${div.bg} ${div.color}`}>
                          <DivIcon className="w-3 h-3" />
                          {div.label === 'All Documents' ? doc.bookings?.services?.name || '—' : div.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell text-sm text-slate-500">
                        {formatFileSize(doc.file_size)}
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell text-sm text-slate-500">
                        {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            title="View / Download"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={deletingId === doc.id}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === doc.id
                              ? <div className="w-4 h-4 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
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

      {/* Summary footer */}
      {!loading && filtered.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of{' '}
            <span className="font-semibold text-slate-700">{documents.length}</span> documents
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            {activeDivision === 'all' ? 'All divisions' : DIVISIONS.find((d) => d.slug === activeDivision)?.label}
          </span>
        </div>
      )}
    </div>
  );
}
