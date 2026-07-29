import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Banknote, Search, Loader2, X, CheckCircle2, XCircle, Clock,
  Filter, RefreshCw, ArrowUpCircle, FileText,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface ProfileMap {
  [userId: string]: { full_name: string | null; email: string | null };
}

interface Payment {
  id: string;
  user_id: string;
  payable_type: string;
  payable_id: string | null;
  amount_sle: number;
  method: string;
  status: string;
  reference: string;
  collector_id: string | null;
  collected_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  deposit_reference: string | null;
  notes: string | null;
  created_at: string;
  profile?: { full_name: string | null; email: string | null };
  collector?: { full_name: string | null; email: string | null } | null;
}

function fmtMoney(n: number) {
  return `SLE ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function loadProfiles(userIds: string[]): Promise<ProfileMap> {
  if (userIds.length === 0) return {};
  const unique = [...new Set(userIds.filter(Boolean))];
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', unique);
  const map: ProfileMap = {};
  (data || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email }; });
  return map;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:    { label: 'Pending',    cls: 'bg-amber-50 text-amber-600' },
  collected:  { label: 'Collected',  cls: 'bg-blue-50 text-blue-600' },
  confirmed:  { label: 'Confirmed',  cls: 'bg-emerald-50 text-emerald-600' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-slate-100 text-slate-400' },
  failed:     { label: 'Failed',     cls: 'bg-red-50 text-red-600' },
};

const PAYABLE_LABELS: Record<string, string> = {
  booking: 'Booking',
  invoice: 'Invoice',
  wallet_topup: 'Wallet Top-Up',
  subscription: 'Subscription',
};

export function CashPaymentsTab() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<Payment | null>(null);
  const [depositRef, setDepositRef] = useState('');
  const [adminNote, setAdminNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('method', 'cash')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) { setLoadError(error.message); setPayments([]); setLoading(false); return; }
    const rows = (data || []) as any[];
    const profileMap = await loadProfiles(rows.map(r => r.user_id));
    const collectorIds = rows.map(r => r.collector_id).filter(Boolean);
    const collectorMap = collectorIds.length > 0 ? await loadProfiles(collectorIds) : {};
    const enriched: Payment[] = rows.map(r => ({
      ...r,
      profile: profileMap[r.user_id] || { full_name: null, email: null },
      collector: r.collector_id ? (collectorMap[r.collector_id] || null) : null,
    }));
    setPayments(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const pending = payments.filter(p => p.status === 'pending');
    const collected = payments.filter(p => p.status === 'collected');
    const confirmed = payments.filter(p => p.status === 'confirmed');
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, p) => s + Number(p.amount_sle), 0),
      collectedAmount: collected.reduce((s, p) => s + Number(p.amount_sle), 0),
      confirmedAmount: confirmed.reduce((s, p) => s + Number(p.amount_sle), 0),
    };
  }, [payments]);

  const filtered = payments.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = p.profile?.full_name || '';
      const email = p.profile?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || (p.reference || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleConfirm = async (payment: Payment, action: 'collect' | 'confirm' | 'cancel') => {
    setActionLoading(payment.id);
    const { data: { user } } = await supabase.auth.getUser();
    const updates: Record<string, any> = {};
    if (action === 'collect') {
      updates.status = 'collected';
      updates.collected_at = new Date().toISOString();
    } else if (action === 'confirm') {
      updates.status = 'confirmed';
      updates.confirmed_by = user?.id || null;
      updates.confirmed_at = new Date().toISOString();
      updates.deposit_reference = depositRef.trim() || null;
      updates.notes = adminNote.trim() || null;
    } else if (action === 'cancel') {
      updates.status = 'cancelled';
    }
    const { error } = await supabase.from('payments').update(updates).eq('id', payment.id);
    if (!error) {
      if (action === 'confirm' && payment.payable_type === 'wallet_topup') {
        await supabase.from('wallet_transactions').insert({
          user_id: payment.user_id,
          type: 'topup',
          amount_sle: Number(payment.amount_sle),
          method: 'cash',
          reference: payment.reference,
          description: 'Cash top-up confirmed by admin',
          status: 'completed',
          recorded_by: 'admin',
        });
      }
      if (action === 'confirm' && payment.payable_type === 'booking' && payment.payable_id) {
        await supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', payment.payable_id);
      }
      setConfirmModal(null);
      setDepositRef('');
      setAdminNote('');
      load();
    } else {
      setLoadError(error.message);
    }
    setActionLoading(null);
  };

  return (
    <>
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBox label="PENDING" value={String(stats.pendingCount)} icon={Clock} color="text-amber-500" accent="bg-amber-50" />
        <StatBox label="PENDING AMOUNT" value={fmtMoney(stats.pendingAmount)} icon={ArrowUpCircle} color="text-red-500" accent="bg-red-50" />
        <StatBox label="COLLECTED" value={fmtMoney(stats.collectedAmount)} icon={Banknote} color="text-blue-500" accent="bg-blue-50" />
        <StatBox label="CONFIRMED" value={fmtMoney(stats.confirmedAmount)} icon={CheckCircle2} color="text-emerald-500" accent="bg-emerald-50" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by client name, email, or reference…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="collected">Collected</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="failed">Failed</option>
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
            <p className="text-sm font-medium text-slate-500">No cash payments found</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">Client</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left">For</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right">Amount</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden md:table-cell">Reference</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-left hidden lg:table-cell">Collector</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Status</th>
                  <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(p => {
                  const meta = STATUS_META[p.status] ?? STATUS_META.pending;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{p.profile?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{p.profile?.email || ''}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-600 text-xs">{PAYABLE_LABELS[p.payable_type] || p.payable_type}</td>
                      <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoney(Number(p.amount_sle))}</td>
                      <td className="px-5 py-3 hidden md:table-cell font-mono text-xs text-slate-500">{p.reference}</td>
                      <td className="px-5 py-3 hidden lg:table-cell text-xs text-slate-500">{p.collector?.full_name || '—'}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {p.status === 'pending' && (
                            <button onClick={() => handleConfirm(p, 'collect')} disabled={actionLoading === p.id} title="Mark collected"
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
                              <Banknote className="w-4 h-4" />
                            </button>
                          )}
                          {p.status === 'collected' && (
                            <button onClick={() => setConfirmModal(p)} disabled={actionLoading === p.id} title="Confirm deposit"
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                              Confirm
                            </button>
                          )}
                          {(p.status === 'pending' || p.status === 'collected') && (
                            <button onClick={() => handleConfirm(p, 'cancel')} disabled={actionLoading === p.id} title="Cancel"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          {(p.status === 'confirmed' || p.status === 'cancelled' || p.status === 'failed') && (
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

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Confirm Cash Deposit</h2>
              </div>
              <button onClick={() => setConfirmModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-5">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 mb-4">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Client</span><span className="font-semibold text-slate-800">{confirmModal.profile?.full_name || 'Unknown'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Amount</span><span className="font-semibold text-slate-800">{fmtMoney(Number(confirmModal.amount_sle))}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Reference</span><span className="font-mono text-xs text-slate-600">{confirmModal.reference}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">For</span><span className="text-slate-600">{PAYABLE_LABELS[confirmModal.payable_type] || confirmModal.payable_type}</span></div>
              </div>

              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Deposit Reference (optional)</label>
              <input type="text" value={depositRef} onChange={e => setDepositRef(e.target.value)}
                placeholder="Bank deposit slip number"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none mb-4" />

              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Admin Note (optional)</label>
              <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2}
                placeholder="Note for the record…"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none mb-4" />

              <button onClick={() => handleConfirm(confirmModal, 'confirm')} disabled={actionLoading === confirmModal.id}
                className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {actionLoading === confirmModal.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                Confirm Deposit
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
