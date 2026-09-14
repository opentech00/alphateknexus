import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, FileText, Filter, Loader2, Plus, RefreshCw, Search, X, XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  APPROVAL_STATUS_META,
  FINANCE_APPROVAL_KINDS,
  KIND_LABELS,
  summarizeApprovalPayload,
  type FinanceApprovalKind,
  type FinanceApprovalRow,
} from '../lib/financeApprovals';

interface ProfileMap {
  [id: string]: { full_name: string | null; email: string | null };
}

async function loadProfiles(userIds: string[]): Promise<ProfileMap> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', unique);
  const map: ProfileMap = {};
  (data || []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
    map[p.id] = { full_name: p.full_name, email: p.email };
  });
  return map;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FinanceApprovalsPanel({
  scope,
  allowCreate = true,
}: {
  scope: 'all' | 'drafts' | 'awaiting';
  allowCreate?: boolean;
}) {
  const [rows, setRows] = useState<(FinanceApprovalRow & { requester?: { full_name: string | null; email: string | null } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [canDecide, setCanDecide] = useState<Record<string, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [pendingWithdrawals, setPendingWithdrawals] = useState<{
    id: string; amount_sle: number; user_id: string; created_at: string;
    profile?: { full_name: string | null; email: string | null };
  }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);

    const next: Record<string, boolean> = {};
    await Promise.all(FINANCE_APPROVAL_KINDS.map(async (kind) => {
      const { data: ok } = await supabase.rpc('finance_can_decide', { p_kind: kind });
      next[kind] = ok === true;
    }));
    setCanDecide(next);

    let q = supabase.from('finance_approvals').select('*').order('created_at', { ascending: false }).limit(200);
    if (scope === 'drafts' && user?.id) q = q.eq('requested_by', user.id).eq('status', 'draft');
    if (scope === 'awaiting') q = q.eq('status', 'submitted');

    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setRows([]);
      setPendingWithdrawals([]);
      setLoading(false);
      return;
    }
    const list = (data || []) as FinanceApprovalRow[];
    const profiles = await loadProfiles(list.flatMap((r) => [r.requested_by, r.approved_by || '']));
    setRows(list.map((r) => ({ ...r, requester: profiles[r.requested_by] })));

    if (scope === 'awaiting' && next.withdrawal) {
      const linked = new Set(list.map((r) => r.related_id).filter(Boolean));
      const { data: wData } = await supabase
        .from('withdrawal_requests')
        .select('id, amount_sle, user_id, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      const pending = ((wData || []) as { id: string; amount_sle: number; user_id: string; created_at: string }[])
        .filter((w) => !linked.has(w.id));
      const wProfiles = await loadProfiles(pending.map((w) => w.user_id));
      setPendingWithdrawals(pending.map((w) => ({ ...w, profile: wProfiles[w.user_id] })));
    } else {
      setPendingWithdrawals([]);
    }

    setLoading(false);
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const name = r.requester?.full_name || '';
      const email = r.requester?.email || '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || r.kind.includes(q);
    });
  }, [rows, kindFilter, search]);

  const decide = async (id: string, approve: boolean) => {
    setBusyId(id);
    setError('');
    const { data, error: err } = await supabase.rpc('decide_finance_approval', {
      p_id: id,
      p_approve: approve,
      p_note: noteById[id] || null,
    });
    if (err) setError(err.message);
    else if (data && (data as { success?: boolean }).success === false) setError('Could not record that decision');
    setBusyId(null);
    await load();
  };

  const submitDraft = async (id: string) => {
    setBusyId(id);
    const { error: err } = await supabase.rpc('submit_finance_approval', { p_id: id });
    if (err) setError(err.message);
    setBusyId(null);
    await load();
  };

  const reviewWithdrawal = async (id: string, approve: boolean) => {
    setBusyId(id);
    setError('');
    const { error: err } = await supabase.rpc('review_withdrawal_request', {
      p_withdrawal_id: id,
      p_approve: approve,
      p_note: noteById[id] || null,
    });
    if (err) setError(err.message);
    setBusyId(null);
    await load();
  };

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requester or kind…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none"
          >
            <option value="all">All kinds</option>
            {FINANCE_APPROVAL_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
          <button type="button" onClick={() => void load()} className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {allowCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> New request
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 flex justify-center">
          <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
        </div>
      ) : filtered.length === 0 && pendingWithdrawals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <FileText className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No approval items</p>
        </div>
      ) : (
        <>
      {pendingWithdrawals.length > 0 && (kindFilter === 'all' || kindFilter === 'withdrawal') && (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-50 bg-amber-50/60">
            <p className="text-sm font-semibold text-amber-800">Pending client withdrawals</p>
          </div>
          <div className="divide-y divide-slate-50">
            {pendingWithdrawals.map((w) => (
              <div key={w.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{w.profile?.full_name || 'Client'}</p>
                  <p className="text-xs text-slate-400">{w.profile?.email || formatDate(w.created_at)}</p>
                </div>
                <p className="text-sm font-bold text-slate-800">
                  SLE {Number(w.amount_sle).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    value={noteById[w.id] || ''}
                    onChange={(e) => setNoteById((prev) => ({ ...prev, [w.id]: e.target.value }))}
                    placeholder="Note"
                    className="w-32 px-2 py-1 border border-slate-200 rounded-lg text-xs"
                  />
                  <button type="button" disabled={busyId === w.id} onClick={() => void reviewWithdrawal(w.id, true)}
                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                    {busyId === w.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  </button>
                  <button type="button" disabled={busyId === w.id} onClick={() => void reviewWithdrawal(w.id, false)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Kind</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Summary</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Requester</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Date</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => {
                  const meta = APPROVAL_STATUS_META[r.status];
                  const mine = userId && r.requested_by === userId;
                  const canAct = r.status === 'submitted' && canDecide[r.kind] && !mine;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-slate-800">{KIND_LABELS[r.kind]}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {summarizeApprovalPayload(r.kind, r.payload)}
                        {r.note && <p className="text-xs text-slate-400 mt-0.5">{r.note}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-slate-800">{r.requester?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{r.requester?.email || ''}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-400">{formatDate(r.submitted_at || r.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-center gap-1.5">
                          {r.status === 'draft' && mine && (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => void submitDraft(r.id)}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              Submit
                            </button>
                          )}
                          {canAct && (
                            <>
                              <input
                                value={noteById[r.id] || ''}
                                onChange={(e) => setNoteById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                placeholder="Note (optional)"
                                className="w-36 px-2 py-1 border border-slate-200 rounded-lg text-xs"
                              />
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  title="Approve"
                                  disabled={busyId === r.id}
                                  onClick={() => void decide(r.id, true)}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                >
                                  {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                </button>
                                <button
                                  type="button"
                                  title="Reject"
                                  disabled={busyId === r.id}
                                  onClick={() => void decide(r.id, false)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            </>
                          )}
                          {r.status === 'submitted' && mine && (
                            <span className="text-[10px] text-amber-600 font-medium">Awaiting checker</span>
                          )}
                          {(r.status === 'approved' || r.status === 'rejected') && r.decision_note && (
                            <p className="text-[10px] text-slate-400 max-w-[10rem] truncate">{r.decision_note}</p>
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
        </>
      )}

      {showCreate && (
        <CreateApprovalModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />
      )}
    </div>
  );
}

function CreateApprovalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<FinanceApprovalKind>('invoice');
  const [asDraft, setAsDraft] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [rate, setRate] = useState('');
  const [withdrawalId, setWithdrawalId] = useState('');
  const [pendingWithdrawals, setPendingWithdrawals] = useState<{ id: string; amount_sle: number; user_id: string }[]>([]);

  useEffect(() => {
    if (kind === 'withdrawal') {
      supabase.from('withdrawal_requests').select('id, amount_sle, user_id').eq('status', 'pending').order('created_at', { ascending: false }).limit(30)
        .then(({ data }) => setPendingWithdrawals((data as { id: string; amount_sle: number; user_id: string }[]) || []));
    }
  }, [kind]);

  const searchClients = async (q: string) => {
    setClientSearch(q);
    if (q.length < 2) { setClients([]); return; }
    const { data, error: err } = await supabase.rpc('search_finance_clients', { p_query: q });
    if (err) {
      const fallback = await supabase.from('profiles').select('id, full_name, email').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(10);
      setClients(fallback.data || []);
      return;
    }
    setClients((data as { id: string; full_name: string | null; email: string | null }[]) || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const amt = parseFloat(amount);
    let payload: Record<string, unknown> = {};
    let relatedId: string | null = null;

    if (kind === 'invoice') {
      if (!clientId) { setError('Select a client'); setSubmitting(false); return; }
      if (!amt || amt <= 0) { setError('Enter an amount'); setSubmitting(false); return; }
      payload = {
        user_id: clientId,
        currency: 'SLE',
        subtotal: amt,
        tax_rate: 0,
        tax_amount: 0,
        total: amt,
        notes: description || note,
        line_items: [{ item: description || 'Invoice', description: description || 'Invoice', quantity: 1, trips: '1', unit_price: amt, total: amt }],
        status: 'sent',
      };
    } else if (kind === 'wallet_adjust') {
      if (!clientId) { setError('Select a client'); setSubmitting(false); return; }
      if (!amt || amt === 0) { setError('Enter an amount'); setSubmitting(false); return; }
      payload = {
        user_id: clientId,
        type: amt < 0 ? 'payment' : 'adjustment',
        amount_sle: amt,
        method: 'admin',
        description: description || 'Wallet adjustment',
      };
    } else if (kind === 'fx_rate') {
      if (!currency.trim() || !rate) { setError('Currency and rate are required'); setSubmitting(false); return; }
      payload = {
        currency_code: currency.toUpperCase().trim(),
        currency_name: currency.toUpperCase().trim(),
        symbol: '',
        rate_to_sle: parseFloat(rate),
        is_active: true,
      };
    } else if (kind === 'withdrawal') {
      if (!withdrawalId) { setError('Select a pending withdrawal'); setSubmitting(false); return; }
      const w = pendingWithdrawals.find((x) => x.id === withdrawalId);
      relatedId = withdrawalId;
      payload = { amount_sle: w?.amount_sle || 0, user_id: w?.user_id };
    }

    const { error: err } = await supabase.rpc('create_finance_approval', {
      p_kind: kind,
      p_payload: payload,
      p_related_id: relatedId,
      p_note: note.trim() || null,
      p_submit: !asDraft,
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">New finance request</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Kind</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as FinanceApprovalKind)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white outline-none">
              {FINANCE_APPROVAL_KINDS.filter((k) => k !== 'ledger_settle').map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </div>

          {(kind === 'invoice' || kind === 'wallet_adjust') && (
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Client</label>
              <input value={clientSearch} onChange={(e) => void searchClients(e.target.value)} placeholder="Search name or email…"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
              {clients.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  {clients.map((u) => (
                    <button key={u.id} type="button"
                      onClick={() => { setClientId(u.id); setClientSearch(`${u.full_name || u.email || ''}`); setClients([]); }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0">
                      <p className="text-sm font-medium">{u.full_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </button>
                  ))}
                </div>
              )}
              {clientId && <p className="mt-1 text-xs text-emerald-600">Client selected</p>}
            </div>
          )}

          {(kind === 'invoice' || kind === 'wallet_adjust') && (
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">{kind === 'invoice' ? 'Amount (SLE)' : 'Amount (SLE, negative to debit)'}</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
            </div>
          )}

          {kind === 'fx_rate' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Currency</label>
                <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none uppercase" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Rate to SLE</label>
                <input type="number" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
              </div>
            </div>
          )}

          {kind === 'withdrawal' && (
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Pending withdrawal</label>
              {pendingWithdrawals.length === 0 ? (
                <p className="text-sm text-slate-500">No pending withdrawals, or you do not have access to the payouts list.</p>
              ) : (
                <select value={withdrawalId} onChange={(e) => setWithdrawalId(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white outline-none">
                  <option value="">Select…</option>
                  {pendingWithdrawals.map((w) => (
                    <option key={w.id} value={w.id}>SLE {Number(w.amount_sle).toLocaleString()} · {w.id.slice(0, 8)}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Description / note</label>
            <textarea value={kind === 'fx_rate' ? note : description} onChange={(e) => { if (kind === 'fx_rate') setNote(e.target.value); else setDescription(e.target.value); }}
              rows={2} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none resize-none" />
          </div>

          {kind !== 'fx_rate' && (
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Internal note</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} className="rounded border-slate-300 text-emerald-600" />
            Save as draft (assistant can submit later)
          </label>

          <button type="submit" disabled={submitting}
            className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {asDraft ? 'Save draft' : 'Submit for approval'}
          </button>
        </form>
      </div>
    </div>
  );
}
