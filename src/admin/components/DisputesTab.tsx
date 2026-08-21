import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  MessageSquare, Loader2, Search, CheckCircle2, XCircle,
  Clock, Eye, X, AlertTriangle, RefreshCw, Filter,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Dispute {
  id: string;
  user_id: string;
  transaction_id: string;
  reason: string;
  description: string;
  status: string;
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  refund_amount: number;
  created_at: string;
  updated_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
  wallet_transactions: { amount_sle: number; type: string; description: string | null; created_at: string } | null;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700', icon: Clock },
  under_review: { label: 'Under Review', cls: 'bg-blue-50 text-blue-700', icon: Eye },
  resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700', icon: XCircle },
};

const REASON_LABELS: Record<string, string> = {
  incorrect_amount: 'Incorrect Amount',
  duplicate_charge: 'Duplicate Charge',
  service_not_received: 'Service Not Received',
  unauthorized: 'Unauthorized Transaction',
  other: 'Other Issue',
};

function fmtMoney(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}SLE ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function DisputesTab() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [resolveAction, setResolveAction] = useState<'resolved' | 'rejected'>('resolved');
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('wallet_disputes')
      .select('*, profiles!wallet_disputes_user_id_fkey(full_name, email), wallet_transactions!wallet_disputes_transaction_id_fkey(amount_sle, type, description, created_at)')
      .order('created_at', { ascending: false });
    setDisputes((data as Dispute[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => disputes.filter(d => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = d.profiles?.full_name || '';
      const email = d.profiles?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || d.reason.toLowerCase().includes(q);
    }
    return true;
  }), [disputes, statusFilter, search]);

  const handleResolve = async () => {
    if (!selected) return;
    setResolving(true);

    const { data: { user } } = await supabase.auth.getUser();
    const refund = parseFloat(refundAmount) || 0;

    await supabase.from('wallet_disputes').update({
      status: resolveAction,
      admin_notes: adminNotes.trim() || null,
      refund_amount: refund,
      resolved_by: user?.id || null,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', selected.id);

    if (resolveAction === 'resolved' && refund > 0) {
      await supabase.from('wallet_transactions').insert({
        user_id: selected.user_id,
        type: 'refund',
        amount_sle: refund,
        description: `Dispute refund: ${REASON_LABELS[selected.reason] || selected.reason}`,
        method: 'wallet',
        reference: `dispute-${selected.id.slice(0, 8)}`,
        status: 'completed',
        recorded_by: 'admin',
      });
    }

    setResolving(false);
    setSelected(null);
    setAdminNotes('');
    setRefundAmount('');
    load();
  };

  const stats = useMemo(() => ({
    total: disputes.length,
    pending: disputes.filter(d => d.status === 'pending').length,
    under_review: disputes.filter(d => d.status === 'under_review').length,
    resolved: disputes.filter(d => d.status === 'resolved').length,
  }), [disputes]);

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Disputes', value: stats.total, cls: 'text-slate-600 bg-slate-50' },
          { label: 'Pending', value: stats.pending, cls: 'text-amber-600 bg-amber-50' },
          { label: 'Under Review', value: stats.under_review, cls: 'text-blue-600 bg-blue-50' },
          { label: 'Resolved', value: stats.resolved, cls: 'text-emerald-600 bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-400 font-medium mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.cls.split(' ')[0]}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client name or email..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button onClick={load} className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Disputes List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No disputes found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(d => {
              const meta = STATUS_META[d.status] || STATUS_META.pending;
              const StatusIcon = meta.icon;
              return (
                <button
                  key={d.id}
                  onClick={() => { setSelected(d); setAdminNotes(d.admin_notes || ''); setRefundAmount(String(d.refund_amount || '')); }}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-800">{d.profiles?.full_name || 'Unknown'}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <p className="text-xs text-slate-500">{REASON_LABELS[d.reason] || d.reason}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {d.wallet_transactions && ` · ${fmtMoney(Math.abs(Number(d.wallet_transactions.amount_sle)))}`}
                    </p>
                  </div>
                  <Eye className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Dispute Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-bold text-slate-900">Dispute Details</h2>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
              {/* Client info */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-400 font-medium mb-1">Client</p>
                <p className="text-sm font-semibold text-slate-800">{selected.profiles?.full_name || 'Unknown'}</p>
                <p className="text-xs text-slate-400">{selected.profiles?.email || ''}</p>
              </div>

              {/* Transaction */}
              {selected.wallet_transactions && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-medium mb-1">Transaction</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800">{selected.wallet_transactions.description || selected.wallet_transactions.type}</p>
                    <p className="text-sm font-bold text-slate-800">{fmtMoney(Math.abs(Number(selected.wallet_transactions.amount_sle)))}</p>
                  </div>
                </div>
              )}

              {/* Reason + description */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-1">Reason</p>
                <p className="text-sm font-semibold text-slate-800 mb-2">{REASON_LABELS[selected.reason] || selected.reason}</p>
                <p className="text-xs text-slate-400 font-medium mb-1">Description</p>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{selected.description}</p>
              </div>

              {/* Admin response */}
              {(selected.status === 'pending' || selected.status === 'under_review') && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Admin Notes</label>
                    <textarea
                      value={adminNotes}
                      onChange={e => setAdminNotes(e.target.value)}
                      placeholder="Internal notes or response to the client..."
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Refund Amount (SLE)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={refundAmount}
                      onChange={e => setRefundAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <p className="text-xs text-slate-400 mt-1">Set to 0 for no refund</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setResolveAction('resolved'); handleResolve(); }}
                      disabled={resolving}
                      className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Resolve
                    </button>
                    <button
                      onClick={() => { setResolveAction('rejected'); handleResolve(); }}
                      disabled={resolving}
                      className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Reject
                    </button>
                  </div>
                </>
              )}

              {(selected.status === 'resolved' || selected.status === 'rejected') && (
                <div className={`p-4 rounded-xl ${selected.status === 'resolved' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className="text-xs font-medium text-slate-400 mb-1">Resolution</p>
                  <p className={`text-sm font-semibold ${selected.status === 'resolved' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {selected.status === 'resolved' ? 'Resolved' : 'Rejected'}
                    {selected.refund_amount > 0 && ` · Refunded ${fmtMoney(selected.refund_amount)}`}
                  </p>
                  {selected.admin_notes && <p className="text-xs text-slate-600 mt-2">{selected.admin_notes}</p>}
                  {selected.resolved_at && (
                    <p className="text-[10px] text-slate-400 mt-2">
                      {new Date(selected.resolved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
