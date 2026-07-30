import { useEffect, useState, useMemo } from 'react';
import {
  FileText, Image, FileSpreadsheet, File, Trash2, Download, Search,
  Filter, XCircle, AlertCircle, X, Building2, Truck, Recycle, Brush,
  ShieldCheck, Package, Calendar, User, Clock, Banknote, CheckCircle2,
  XCircle as RejectIcon, Loader2, Landmark,
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

interface PaymentVerificationRow {
  id: string;
  booking_id: string;
  user_id: string;
  document_type: string;
  document_url: string;
  document_name: string;
  document_size: number | null;
  status: string;
  rejection_reason: string | null;
  amount_sle: number | null;
  service_slug: string | null;
  created_at: string;
  updated_at: string;
  bookings: {
    contact_name: string;
    services: { name: string; slug: string };
  } | null;
}

const BANK_DOC_TYPE_LABELS: Record<string, string> = {
  payslip: 'Payslip',
  cheque: 'Cheque',
  deposit_slip: 'Deposit Slip',
};

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
  const [verifications, setVerifications] = useState<PaymentVerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDivision, setActiveDivision] = useState('all');
  const [search, setSearch] = useState('');
  const [uploadingForBooking, setUploadingForBooking] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [view, setView] = useState<'documents' | 'verifications'>('documents');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<PaymentVerificationRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchDocuments = async () => {
    setLoading(true);
    const [docsRes, verifRes] = await Promise.all([
      supabase
        .from('documents')
        .select(`
          id, file_name, file_url, file_type, file_size, uploaded_by_admin, created_at,
          booking_id, user_id, service_slug,
          bookings ( contact_name, services ( name, slug ) )
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('payment_verifications')
        .select(`
          id, booking_id, user_id, document_type, document_url, document_name,
          document_size, status, rejection_reason, amount_sle, service_slug,
          created_at, updated_at,
          bookings ( contact_name, services ( name, slug ) )
        `)
        .order('created_at', { ascending: false }),
    ]);

    if (docsRes.error) {
      console.error('Error fetching documents:', docsRes.error);
    } else {
      setDocuments((docsRes.data as unknown as DocumentRow[]) || []);
    }
    if (verifRes.error) {
      console.error('Error fetching verifications:', verifRes.error);
    } else {
      setVerifications((verifRes.data as unknown as PaymentVerificationRow[]) || []);
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

  const filteredVerifications = useMemo(() => {
    let rows = verifications;
    if (activeDivision !== 'all') {
      rows = rows.filter((v) => (v.service_slug || v.bookings?.services?.slug) === activeDivision);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (v) =>
          v.document_name.toLowerCase().includes(q) ||
          v.bookings?.contact_name?.toLowerCase().includes(q) ||
          v.bookings?.services?.name?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [verifications, activeDivision, search]);

  const pendingVerifCount = useMemo(
    () => verifications.filter((v) => v.status === 'pending').length,
    [verifications]
  );

  const verifCounts = useMemo(() => {
    const map: Record<string, number> = { all: verifications.length };
    DIVISIONS.slice(1).forEach((d) => {
      map[d.slug] = verifications.filter((v) => (v.service_slug || v.bookings?.services?.slug) === d.slug).length;
    });
    return map;
  }, [verifications]);

  const handleVerify = async (verif: PaymentVerificationRow) => {
    setVerifyingId(verif.id);
    const { data: userData } = await supabase.auth.getUser();
    await supabase
      .from('payment_verifications')
      .update({
        status: 'verified',
        verified_by: userData.user?.id || null,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', verif.id);

    await supabase
      .from('bookings')
      .update({ payment_status: 'verified' })
      .eq('id', verif.booking_id);

    await supabase.from('notifications').insert({
      user_id: verif.user_id,
      title: 'Payment Verified',
      body: `Your bank payment for ${verif.bookings?.services?.name || 'booking'} has been verified and confirmed.`,
      type: 'payment_verification',
      booking_id: verif.booking_id,
    });

    // Send confirmation email
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        eventType: 'payment_verified',
        userId: verif.user_id,
        serviceName: verif.bookings?.services?.name,
        bookingId: verif.booking_id,
      }),
    }).catch(() => {});

    setVerifyingId(null);
    fetchDocuments();
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setVerifyingId(rejectModal.id);
    await supabase
      .from('payment_verifications')
      .update({
        status: 'rejected',
        rejection_reason: rejectReason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', rejectModal.id);

    await supabase
      .from('bookings')
      .update({ payment_status: 'rejected' })
      .eq('id', rejectModal.booking_id);

    await supabase.from('notifications').insert({
      user_id: rejectModal.user_id,
      title: 'Payment Rejected',
      body: `Your bank payment for ${rejectModal.bookings?.services?.name || 'booking'} was rejected. Reason: ${rejectReason.trim()}`,
      type: 'payment_verification',
      booking_id: rejectModal.booking_id,
    });

    // Send rejection email
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        eventType: 'payment_rejected',
        userId: rejectModal.user_id,
        serviceName: rejectModal.bookings?.services?.name,
        bookingId: rejectModal.booking_id,
      }),
    }).catch(() => {});

    setVerifyingId(null);
    setRejectModal(null);
    setRejectReason('');
    fetchDocuments();
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Documents Management"
        description="Access and manage documents submitted by clients across all divisions"
        icon={FileText}
      />

      {/* View toggle: Documents vs Payment Verifications */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setView('documents')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === 'documents' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
          }`}
        >
          <FileText className="w-4 h-4" /> Documents
        </button>
        <button
          onClick={() => setView('verifications')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === 'verifications' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
          }`}
        >
          <Banknote className="w-4 h-4" /> Payment Verifications
          {pendingVerifCount > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-red-500 text-white font-bold">{pendingVerifCount}</span>
          )}
        </button>
      </div>

      {view === 'verifications' ? (
        <>
          {/* Validation notice */}
          <div className="mb-4 flex items-center gap-2 text-xs text-slate-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            <Banknote className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
            Bank payment proofs (payslips, cheques, deposit slips) submitted by clients for verification.
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
                    {verifCounts[div.slug] || 0}
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
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Verifications table */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : filteredVerifications.length === 0 ? (
            <EmptyState
              icon={XCircle}
              title="No payment verifications"
              description={search || activeDivision !== 'all' ? 'Try adjusting filters.' : 'No bank payment proofs have been uploaded yet.'}
            />
          ) : (
            <div className="space-y-3">
              {filteredVerifications.map((verif) => {
                const div = DIVISIONS.find((d) => d.slug === (verif.service_slug || verif.bookings?.services?.slug)) || DIVISIONS[0];
                const DivIcon = div.icon;
                const docTypeLabel = BANK_DOC_TYPE_LABELS[verif.document_type] || verif.document_type;
                return (
                  <div key={verif.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="flex items-start gap-4 p-4">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={verif.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-slate-800 hover:text-indigo-600 truncate"
                            title={verif.document_name}
                          >
                            {verif.document_name}
                          </a>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                            <Landmark className="w-3 h-3" /> {docTypeLabel}
                          </span>
                          {verif.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pending</span>
                          )}
                          {verif.status === 'verified' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Verified</span>
                          )}
                          {verif.status === 'rejected' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1"><User className="w-3 h-3" /> {verif.bookings?.contact_name || 'Unknown'}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg ${div.bg} ${div.color}`}><DivIcon className="w-3 h-3" /> {verif.bookings?.services?.name || '—'}</span>
                          {verif.amount_sle != null && <span className="font-semibold text-slate-700">Le {Number(verif.amount_sle).toLocaleString()}</span>}
                          <span>{new Date(verif.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        {verif.status === 'rejected' && verif.rejection_reason && (
                          <p className="mt-1.5 text-xs text-red-600">Rejection reason: {verif.rejection_reason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a
                          href={verif.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          title="View / Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        {verif.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleVerify(verif)}
                              disabled={verifyingId === verif.id}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              {verifyingId === verif.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Verify
                            </button>
                            <button
                              onClick={() => { setRejectModal(verif); setRejectReason(''); }}
                              disabled={verifyingId === verif.id}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
                            >
                              <RejectIcon className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reject modal */}
          {rejectModal && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <RejectIcon className="w-5 h-5 text-red-500" />
                    <h2 className="text-lg font-bold text-slate-900">Reject Payment</h2>
                  </div>
                  <button onClick={() => setRejectModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
                <div className="px-5 py-5">
                  <p className="text-sm text-slate-600 mb-3">
                    Provide a reason for rejecting this payment proof from <span className="font-semibold">{rejectModal.bookings?.contact_name || 'this client'}</span>.
                  </p>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Slip is unreadable, amount mismatch, invalid document..."
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
                  />
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setRejectModal(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={!rejectReason.trim() || verifyingId === rejectModal.id}
                      className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {verifyingId === rejectModal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RejectIcon className="w-4 h-4" />}
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
      <>

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
      </>
      )}
    </div>
  );
}
