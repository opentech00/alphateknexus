import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera, CheckCircle2, Clock, Download, Filter, Landmark, Loader2, RefreshCw,
  Search, XCircle,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { StatCard } from '../../components/ui';
import { SensitiveValue } from '../../../components/SensitiveValue';
import { maskEmail, redactCsvValue } from '../../../lib/sensitive';
import { useFinancePrivacy } from '../../../contexts/FinancePrivacyContext';
import { toast } from '../../../components/toast/toast';
import { downloadCsv } from './financeCsv';
import { type OfficialReceipt } from './receiptActions';
import { ViewReceiptModal } from './ViewReceiptModal';

type BankDeposit = {
  id: string;
  booking_id: string;
  user_id: string;
  payment_method: string;
  document_type: string;
  document_url: string;
  document_name: string;
  amount_sle: number | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  verified_at: string | null;
  profile?: { full_name: string | null; email: string | null };
  booking?: { contact_name: string | null; services?: { name: string | null } | null };
  receipt?: OfficialReceipt | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Awaiting review', cls: 'bg-amber-50 text-amber-700' },
  verified: { label: 'Verified', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-600' },
};

export function BankDepositsTab() {
  const { privacy, money } = useFinancePrivacy();
  const [rows, setRows] = useState<BankDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<BankDeposit | null>(null);
  const [rejectRow, setRejectRow] = useState<BankDeposit | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewReceipt, setViewReceipt] = useState<OfficialReceipt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('payment_verifications')
      .select('id, booking_id, user_id, payment_method, document_type, document_url, document_name, amount_sle, status, rejection_reason, created_at, verified_at, bookings(contact_name, services(name))')
      .eq('payment_method', 'bank')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { setLoadError(error.message); setRows([]); setLoading(false); return; }

    const list = (data || []) as any[];
    const userIds = list.map((r) => r.user_id).filter(Boolean);
    const bookingIds = list.map((r) => r.booking_id).filter(Boolean);
    const [{ data: profiles }, { data: receipts }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').in('id', userIds.length ? [...new Set(userIds)] : ['00000000-0000-0000-0000-000000000000']),
      bookingIds.length
        ? supabase.from('payment_receipts').select('*').in('payment_method', ['bank', 'bank_transfer']).order('created_at', { ascending: false }).limit(400)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = { full_name: p.full_name, email: p.email }; });

    const receiptByUser = new Map<string, OfficialReceipt[]>();
    (receipts || []).forEach((r: OfficialReceipt) => {
      const listForUser = receiptByUser.get(r.user_id) || [];
      listForUser.push(r);
      receiptByUser.set(r.user_id, listForUser);
    });

    setRows(list.map((r) => {
      const bookingRaw = r.bookings;
      const booking = Array.isArray(bookingRaw) ? bookingRaw[0] : bookingRaw;
      const matched = (receiptByUser.get(r.user_id) || []).find((rec) =>
        Math.abs(Number(rec.amount_sle) - Number(r.amount_sle || 0)) < 0.01
        && (r.status === 'verified'),
      ) || null;
      return {
        ...r,
        profile: profileMap[r.user_id],
        booking,
        receipt: matched,
      } as BankDeposit;
    }));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'pending').length,
    verified: rows.filter((r) => r.status === 'verified').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    pendingAmount: rows.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount_sle || 0), 0),
  }), [rows]);

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (r.profile?.full_name || '').toLowerCase().includes(q)
        || (r.profile?.email || '').toLowerCase().includes(q)
        || (r.booking?.contact_name || '').toLowerCase().includes(q)
        || (r.booking?.services?.name || '').toLowerCase().includes(q)
        || r.document_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const review = async (row: BankDeposit, approve: boolean, reason?: string) => {
    setBusy(row.id);
    const { data, error } = await supabase.rpc('finance_review_bank_slip', {
      p_id: row.id,
      p_approve: approve,
      p_reason: reason || null,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const result = data as { success?: boolean; error?: string } | null;
    if (result && result.success === false) { toast.error(result.error || 'Could not review this deposit.'); return; }
    toast.success(approve ? 'Bank deposit verified. An official receipt was issued.' : 'Bank deposit rejected.');
    setRejectRow(null);
    setRejectReason('');
    await load();
  };

  return (
    <>
      <p className="text-sm text-slate-500">
        Clients photograph their bank deposit slip and upload it here. Finance verifies the photo — this is not an official Alphatek receipt.
      </p>

      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{loadError}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="AWAITING REVIEW" value={String(stats.pending)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
        <StatCard label="PENDING AMOUNT" value={money(stats.pendingAmount)} icon={Landmark} color="text-blue-500" accent="bg-blue-50" />
        <StatCard label="VERIFIED" value={String(stats.verified)} icon={CheckCircle2} color="text-emerald-500" accent="bg-emerald-50" />
        <StatCard label="REJECTED" value={String(stats.rejected)} icon={XCircle} color="text-red-500" accent="bg-red-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client, service, or file name…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="pending">Awaiting review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </div>
        <button onClick={() => downloadCsv('bank-deposits.csv', filtered.map((r) => ({
          client: r.profile?.full_name || r.booking?.contact_name || '',
          email: redactCsvValue(privacy, 'email', r.profile?.email || ''),
          service: r.booking?.services?.name || '',
          amount_sle: redactCsvValue(privacy, 'amount', r.amount_sle || 0),
          status: r.status, file: r.document_name, date: r.created_at,
        })))}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 text-sm whitespace-nowrap">
          <Download className="w-4 h-4" /> Export CSV
        </button>
        <button onClick={() => void load()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 text-sm whitespace-nowrap">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Camera className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No bank deposit photos yet</p>
            <p className="text-xs text-slate-400 mt-1">Clients snap their deposit slip after transferring to Alphatek.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Proof</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Client</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden sm:table-cell">Service</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Status</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status] || STATUS_META.pending;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <button type="button" onClick={() => setPreview(r)} className="flex items-center gap-3 text-left">
                          {/\.(png|jpe?g|webp|gif|heic|heif)$/i.test(r.document_name) || r.document_url.includes('image') ? (
                            <img src={r.document_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 bg-slate-50" />
                          ) : (
                            <span className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 inline-flex items-center justify-center">
                              <Camera className="w-5 h-5" />
                            </span>
                          )}
                          <span className="text-xs font-medium text-slate-700 truncate max-w-[140px]">{r.document_name}</span>
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{r.profile?.full_name || r.booking?.contact_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">
                          <SensitiveValue privacy={privacy} masked={maskEmail(r.profile?.email)} full={r.profile?.email || ''} />
                        </p>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell text-slate-600 text-xs">{r.booking?.services?.name || '—'}</td>
                      <td className="px-5 py-3 text-right font-bold text-slate-800">{money(Number(r.amount_sle || 0))}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                        {r.status === 'rejected' && r.rejection_reason && (
                          <p className="text-[10px] text-red-500 mt-1 line-clamp-2">{r.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" onClick={() => setPreview(r)} title="View proof"
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg">
                            <Camera className="w-4 h-4" />
                          </button>
                          {r.status === 'pending' && (
                            <>
                              <button type="button" disabled={busy === r.id} onClick={() => void review(r, true)} title="Verify deposit"
                                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg disabled:opacity-50">
                                {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              </button>
                              <button type="button" disabled={busy === r.id} onClick={() => { setRejectRow(r); setRejectReason(''); }} title="Reject"
                                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {r.receipt && (
                            <button type="button" onClick={() => setViewReceipt(r.receipt!)} title="Official receipt"
                              className="min-h-[44px] px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg">
                              Receipt
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Bank deposit proof</h2>
                <p className="text-xs text-slate-500">{preview.document_name}</p>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-slate-100" aria-label="Close">
                <XCircle className="w-5 h-5 text-slate-500 mx-auto" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              <img src={preview.document_url} alt="Bank deposit proof" className="w-full rounded-xl border border-slate-200 bg-slate-50" />
              <a href={preview.document_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-emerald-700">
                Open original
              </a>
            </div>
          </div>
        </div>
      )}

      {rejectRow && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45" onClick={() => setRejectRow(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Reject bank deposit</h2>
            <p className="text-sm text-slate-500 mb-3">Tell the client why this photo cannot be accepted.</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
              placeholder="e.g. Amount does not match the slip" />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setRejectRow(null)} className="flex-1 min-h-[44px] rounded-xl border border-slate-200 font-semibold text-sm">Cancel</button>
              <button type="button" disabled={!rejectReason.trim() || busy === rejectRow.id}
                onClick={() => void review(rejectRow, false, rejectReason.trim())}
                className="flex-1 min-h-[44px] rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-50">
                {busy === rejectRow.id ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewReceipt && (
        <ViewReceiptModal receipt={viewReceipt} onClose={() => setViewReceipt(null)} />
      )}
    </>
  );
}
