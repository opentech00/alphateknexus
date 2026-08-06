import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Banknote, Search, Loader2, X, CheckCircle2, XCircle, Clock,
  Filter, ArrowUpCircle, Smartphone, Landmark, RefreshCw, Send, Wallet,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface ProfileMap {
  [userId: string]: { full_name: string | null; email: string | null };
}

interface Withdrawal {
  id: string;
  user_id: string;
  amount_sle: number;
  payout_method: string;
  payout_details: Record<string, string>;
  status: string;
  reference: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  monime_payout_id: string | null;
  payout_status: string | null;
  profile?: { full_name: string | null; email: string | null };
  wallet_balance?: number | null;
}

function fmtMoney(n: number) {
  return `SLE ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function loadProfiles(userIds: string[]): Promise<ProfileMap> {
  if (userIds.length === 0) return {};
  const unique = [...new Set(userIds)];
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', unique);
  const map: ProfileMap = {};
  (data || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email }; });
  return map;
}

async function loadWalletBalances(userIds: string[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  const unique = [...new Set(userIds)];
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('user_id, amount_sle')
    .in('user_id', unique)
    .eq('status', 'completed');
  if (error || !data) return {};
  const map: Record<string, number> = {};
  (data as any[]).forEach((r) => {
    map[r.user_id] = (map[r.user_id] || 0) + Number(r.amount_sle);
  });
  return map;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:    { label: 'Pending',    cls: 'bg-amber-50 text-amber-600' },
  approved:   { label: 'Approved',    cls: 'bg-blue-50 text-blue-600' },
  rejected:   { label: 'Rejected',   cls: 'bg-red-50 text-red-600' },
  completed:  { label: 'Completed',  cls: 'bg-emerald-50 text-emerald-600' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-slate-100 text-slate-400' },
};

const PAYOUT_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Pending',  cls: 'bg-amber-50 text-amber-600' },
  sent:      { label: 'Sent',     cls: 'bg-blue-50 text-blue-600' },
  completed: { label: 'Done',     cls: 'bg-emerald-50 text-emerald-600' },
  failed:    { label: 'Failed',    cls: 'bg-red-50 text-red-600' },
};

const METHOD_META: Record<string, { label: string; icon: typeof Smartphone }> = {
  mobile_money:  { label: 'Mobile Money', icon: Smartphone },
  bank_transfer: { label: 'Bank Transfer', icon: Landmark },
  cash:          { label: 'Cash Pickup', icon: Banknote },
};

export function PayoutsTab() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<Withdrawal | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'complete' | null>(null);
  const [payoutResult, setPayoutResult] = useState<{ success: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { setLoadError(error.message); setWithdrawals([]); setLoading(false); return; }
    const rows = (data || []) as any[];
    const profileMap = await loadProfiles(rows.map(r => r.user_id).filter(Boolean));
    const balanceMap = await loadWalletBalances(rows.map(r => r.user_id).filter(Boolean));
    const enriched: Withdrawal[] = rows.map(r => ({
      ...r,
      profile: profileMap[r.user_id] || { full_name: null, email: null },
      wallet_balance: balanceMap[r.user_id] != null ? balanceMap[r.user_id] : null,
    }));
    setWithdrawals(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const pending = withdrawals.filter(w => w.status === 'pending').length;
    const approved = withdrawals.filter(w => w.status === 'approved').length;
    const completed = withdrawals.filter(w => w.status === 'completed');
    const totalAmount = completed.reduce((s, w) => s + Number(w.amount_sle), 0);
    const pendingAmount = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + Number(w.amount_sle), 0);
    return { pending, approved, completed: completed.length, totalAmount, pendingAmount };
  }, [withdrawals]);

  const filtered = withdrawals.filter(w => {
    if (statusFilter !== 'all' && w.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = w.profile?.full_name || '';
      const email = w.profile?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    }
    return true;
  });

  const openReview = (w: Withdrawal, action: 'approve' | 'reject' | 'complete') => {
    setReviewModal(w);
    setReviewAction(action);
    setAdminNote('');
    setPayoutResult(null);
  };

  const handleReview = async () => {
    if (!reviewModal || !reviewAction) return;
    setActionLoading(reviewModal.id);

    if (reviewAction === 'complete') {
      if (reviewModal.payout_method === 'mobile_money') {
        setPayoutResult(null);
        const { data: payoutData, error: payoutErr } = await supabase.functions.invoke('process-monime-payout', {
          body: { withdrawal_id: reviewModal.id },
        });
        if (payoutErr) {
          let detail = payoutErr.message;
          const ctx = (payoutErr as any).context;
          if (ctx && typeof ctx.json === 'function') {
            try {
              const body = await ctx.json();
              if (body?.error) detail = body.error;
            } catch { /* keep generic message */ }
          }
          setPayoutResult({ success: false, message: detail });
          load();
          setActionLoading(null);
          return;
        }
        if (payoutData?.error) {
          setPayoutResult({ success: false, message: payoutData.error });
          load();
          setActionLoading(null);
          return;
        }
        if (adminNote.trim()) {
          await supabase.from('withdrawal_requests').update({
            admin_note: adminNote.trim(),
          }).eq('id', reviewModal.id);
        }
        setPayoutResult({ success: true, message: 'Payout sent successfully!' });
        setReviewModal(null);
        load();
        setActionLoading(null);
        return;
      }

      const { data, error } = await supabase.rpc('process_withdrawal_completion', {
        p_withdrawal_id: reviewModal.id,
      });
      if (error) {
        setActionLoading(null);
        alert('Failed to complete withdrawal: ' + error.message);
        return;
      }
      const result = data as any;
      if (!result?.success) {
        setActionLoading(null);
        alert(result?.error || 'Failed to complete withdrawal');
        return;
      }
      if (reviewModal.status === 'pending') {
        await supabase.from('withdrawal_requests').update({
          admin_note: adminNote.trim() || null,
        }).eq('id', reviewModal.id);
      }
      setReviewModal(null);
      load();
      setActionLoading(null);
      return;
    }

    const updates: Record<string, any> = {
      admin_note: adminNote.trim() || null,
      reviewed_by: (await supabase.auth.getUser()).data.user?.id,
      reviewed_at: new Date().toISOString(),
    };
    if (reviewAction === 'approve') updates.status = 'approved';
    if (reviewAction === 'reject') updates.status = 'rejected';
    const { error } = await supabase.from('withdrawal_requests').update(updates).eq('id', reviewModal.id);
    if (!error) { setReviewModal(null); load(); }
    setActionLoading(null);
  };

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load withdrawals: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBox label="PENDING" value={String(stats.pending)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
        <StatBox label="APPROVED" value={String(stats.approved)} icon={CheckCircle2} color="text-blue-500" accent="bg-blue-50" />
        <StatBox label="COMPLETED" value={String(stats.completed)} icon={Banknote} color="text-emerald-500" accent="bg-emerald-50" />
        <StatBox label="PENDING AMOUNT" value={fmtMoney(stats.pendingAmount)} icon={ArrowUpCircle} color="text-red-500" accent="bg-red-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by client name or email…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="text-center py-16">
            <Banknote className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No withdrawal requests found</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Client</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right hidden lg:table-cell">Wallet Balance</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden sm:table-cell">Method</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden md:table-cell">Date</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Status</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(w => {
                  const meta = STATUS_META[w.status] ?? STATUS_META.pending;
                  const methodMeta = METHOD_META[w.payout_method] ?? { label: w.payout_method, icon: Banknote };
                  const MethodIcon = methodMeta.icon;
                  const hasSufficientBalance = w.wallet_balance != null && w.wallet_balance >= Number(w.amount_sle);
                  return (
                    <tr key={w.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{w.profile?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{w.profile?.email || ''}</p>
                        {w.payout_details && Object.keys(w.payout_details).length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {Object.entries(w.payout_details).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                          </p>
                        )}
                        {w.monime_payout_id && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Payout ID: {w.monime_payout_id}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoney(Number(w.amount_sle))}</td>
                      <td className="px-5 py-3 text-right hidden lg:table-cell">
                        {w.wallet_balance != null ? (
                          <span className={`font-medium ${hasSufficientBalance ? 'text-slate-600' : 'text-red-600'}`}>
                            {fmtMoney(w.wallet_balance)}
                            {!hasSufficientBalance && <span className="block text-[10px] text-red-500">Insufficient</span>}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                          <MethodIcon className="w-3.5 h-3.5" /> {methodMeta.label}
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell text-slate-500 text-xs">{formatDate(w.created_at)}</td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                          {w.payout_status && w.payout_status !== 'completed' && (
                            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PAYOUT_STATUS_META[w.payout_status]?.cls || ''}`}>
                              {PAYOUT_STATUS_META[w.payout_status]?.label || w.payout_status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {w.status === 'pending' && (
                            <>
                              <button onClick={() => openReview(w, 'approve')} disabled={actionLoading === w.id} title="Approve"
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => openReview(w, 'reject')} disabled={actionLoading === w.id} title="Reject"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {w.status === 'approved' && (
                            <button onClick={() => openReview(w, 'complete')} disabled={actionLoading === w.id}
                              title={w.payout_method === 'mobile_money' ? 'Send Monime payout' : 'Mark completed'}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                              {w.payout_method === 'mobile_money' ? <Send className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                              {w.payout_method === 'mobile_money' ? 'Send Payout' : 'Complete'}
                            </button>
                          )}
                          {(w.status === 'rejected' || w.status === 'completed' || w.status === 'cancelled') && (
                            <span className="text-xs text-slate-300">—</span>
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

      {reviewModal && reviewAction && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                {reviewAction === 'approve' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                {reviewAction === 'reject' && <XCircle className="w-5 h-5 text-red-600" />}
                {reviewAction === 'complete' && <Banknote className="w-5 h-5 text-emerald-600" />}
                <h2 className="text-lg font-bold text-slate-900">
                  {reviewAction === 'approve' && 'Approve Withdrawal'}
                  {reviewAction === 'reject' && 'Reject Withdrawal'}
                  {reviewAction === 'complete' && 'Complete Payout'}
                </h2>
              </div>
              <button onClick={() => setReviewModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-5">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 mb-4">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Client</span><span className="font-semibold text-slate-800">{reviewModal.profile?.full_name || 'Unknown'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Amount</span><span className="font-semibold text-slate-800">{fmtMoney(Number(reviewModal.amount_sle))}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Method</span><span className="font-semibold text-slate-800 capitalize">{reviewModal.payout_method.replace('_', ' ')}</span></div>
                {reviewModal.wallet_balance != null && (
                  <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                    <span className="text-slate-500 flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Wallet Balance</span>
                    <span className={`font-semibold ${reviewModal.wallet_balance >= Number(reviewModal.amount_sle) ? 'text-slate-800' : 'text-red-600'}`}>
                      {fmtMoney(reviewModal.wallet_balance)}
                    </span>
                  </div>
                )}
                {reviewModal.payout_details && Object.keys(reviewModal.payout_details).length > 0 && (
                  <div className="pt-2 border-t border-slate-200">
                    {Object.entries(reviewModal.payout_details).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs py-0.5"><span className="text-slate-400 capitalize">{k.replace('_', ' ')}</span><span className="text-slate-600 font-medium">{v}</span></div>
                    ))}
                  </div>
                )}
              </div>

              {reviewAction === 'complete' && reviewModal.payout_method === 'mobile_money' && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 mb-4 flex items-start gap-3">
                  <Send className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-600 leading-relaxed">
                    Clicking "Send Payout" will transfer {fmtMoney(Number(reviewModal.amount_sle))} to the client's mobile money account via Monime. The wallet will be debited automatically. This action cannot be undone.
                  </p>
                </div>
              )}

              {payoutResult && (
                <div className={`mb-4 p-3 rounded-xl text-sm ${payoutResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {payoutResult.message}
                </div>
              )}

              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Admin Note (optional)</label>
              <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3}
                placeholder={reviewAction === 'reject' ? 'Reason for rejection…' : 'Note for the client…'}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none mb-4" />

              <button onClick={handleReview} disabled={actionLoading === reviewModal.id}
                className={`w-full py-3.5 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  reviewAction === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}>
                {actionLoading === reviewModal.id ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {reviewAction === 'approve' && 'Approve Request'}
                {reviewAction === 'reject' && 'Reject Request'}
                {reviewAction === 'complete' && (reviewModal.payout_method === 'mobile_money' ? 'Send Payout' : 'Mark as Completed')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatBox({ label, value, icon: Icon, color, accent }: {
  label: string; value: string; icon: typeof Banknote; color: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mt-1.5">{label}</p>
    </div>
  );
}
