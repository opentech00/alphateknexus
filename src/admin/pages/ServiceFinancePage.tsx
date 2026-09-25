import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Banknote, Download, FileText, Loader2, Lock, Pencil, Plus, RefreshCw,
  Search, Shield, Smartphone, Trash2, TrendingUp, Wallet, WifiOff, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard } from '../components/ui';
import { downloadCsv } from './finance/financeCsv';
import { PrivacyToggle, SensitiveValue } from '../../components/SensitiveValue';
import { getFinancePrivacy, maskReference, redactCsvValue, setFinancePrivacy } from '../../lib/sensitive';
import {
  ENTRY_CATEGORIES,
  ENTRY_KINDS,
  FINANCE_SERVICE_PAGES,
  PAYMENT_CHANNELS,
  SETTLE_METHODS,
  SETTLEMENTS,
  financePageForSlug,
} from '../../lib/financeServices';

interface ServiceRow {
  id: string;
  name: string;
  slug: string;
}

interface LedgerEntry {
  id: string;
  service_id: string;
  entry_date: string;
  kind: 'revenue' | 'expense' | 'adjustment';
  category: string;
  amount_sle: number;
  description: string | null;
  reference: string | null;
  notes: string | null;
  booking_id: string | null;
  source: 'manual' | 'booking';
  channel: 'online' | 'offline' | 'unpaid' | null;
  settlement: 'recorded' | 'pending' | 'collected' | 'void' | 'refunded';
  request_type: 'quote' | 'hire' | null;
  payment_method: string | null;
  invoice_id: string | null;
  created_at: string;
}

function fmtMoney(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}SLE ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const KIND_META: Record<string, { label: string; cls: string }> = {
  revenue: { label: 'Revenue', cls: 'bg-emerald-50 text-emerald-700' },
  expense: { label: 'Expense', cls: 'bg-red-50 text-red-700' },
  adjustment: { label: 'Adjustment', cls: 'bg-amber-50 text-amber-700' },
};

const CHANNEL_META: Record<string, { label: string; cls: string }> = {
  online: { label: 'Online', cls: 'bg-blue-50 text-blue-700' },
  offline: { label: 'Offline', cls: 'bg-amber-50 text-amber-800' },
  unpaid: { label: 'Unpaid', cls: 'bg-slate-100 text-slate-600' },
};

const SETTLEMENT_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700' },
  collected: { label: 'Collected', cls: 'bg-emerald-50 text-emerald-700' },
  recorded: { label: 'Recorded', cls: 'bg-slate-100 text-slate-600' },
  void: { label: 'Void', cls: 'bg-slate-100 text-slate-400' },
  refunded: { label: 'Refunded', cls: 'bg-red-50 text-red-600' },
};

function isCollected(e: Pick<LedgerEntry, 'source' | 'settlement' | 'kind'>) {
  if (e.kind !== 'revenue') return false;
  if (e.source === 'manual') return e.settlement !== 'void';
  return e.settlement === 'collected';
}

export function ServiceFinancePage({
  initialSlug,
  onNavigate,
}: {
  initialSlug?: string | null;
  onNavigate: (page: string) => void;
}) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug || null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [settlementFilter, setSettlementFilter] = useState('all');
  const [canWrite, setCanWrite] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [modal, setModal] = useState<Partial<LedgerEntry> | null>(null);
  const [quoteEntry, setQuoteEntry] = useState<LedgerEntry | null>(null);
  const [settleEntry, setSettleEntry] = useState<LedgerEntry | null>(null);
  const [invoiceEntry, setInvoiceEntry] = useState<LedgerEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [totalsByService, setTotalsByService] = useState<Record<string, { collected: number; pending: number }>>({});
  const [isSuper, setIsSuper] = useState(false);
  const [privacy, setPrivacy] = useState(getFinancePrivacy);
  const [notice, setNotice] = useState('');
  const [bankSlips, setBankSlips] = useState<{
    id: string; booking_id: string; document_type: string; document_name: string;
    document_url: string; amount_sle: number | null; created_at: string; contact_name: string;
  }[]>([]);
  const [rejectSlip, setRejectSlip] = useState<{ id: string } | null>(null);

  const selected = services.find((s) => s.slug === selectedSlug) || null;

  const loadServices = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('services')
      .select('id, name, slug')
      .eq('is_internal', false)
      .order('name');
    if (err) { setError(err.message); return; }
    setServices((data as ServiceRow[]) || []);
  }, []);

  const loadPermissions = useCallback(async () => {
    const [{ data: add }, { data: manage }, { data: del }, { data: isSuper }, { data: canManage }] = await Promise.all([
      supabase.rpc('has_finance_permission', { perm: 'can_add_transactions' }),
      supabase.rpc('has_finance_permission', { perm: 'can_manage_invoices' }),
      supabase.rpc('has_finance_permission', { perm: 'can_delete_transactions' }),
      supabase.rpc('is_super_admin'),
      supabase.rpc('finance_can_manage_ledgers'),
    ]);
    setCanWrite(add === true || manage === true || isSuper === true || canManage === true);
    setCanDelete(del === true || manage === true || isSuper === true);
    setIsSuper(isSuper === true);
  }, []);

  const loadHubTotals = useCallback(async (list: ServiceRow[]) => {
    if (list.length === 0) { setTotalsByService({}); return; }
    const { data } = await supabase
      .from('service_finance_entries')
      .select('service_id, kind, amount_sle, source, settlement');
    const map: Record<string, { collected: number; pending: number }> = {};
    list.forEach((s) => { map[s.id] = { collected: 0, pending: 0 }; });
    (data || []).forEach((row: { service_id: string; kind: string; amount_sle: number; source: string; settlement: string }) => {
      if (!map[row.service_id]) map[row.service_id] = { collected: 0, pending: 0 };
      const amt = Number(row.amount_sle) || 0;
      if (row.kind === 'revenue' && row.source === 'booking' && row.settlement === 'pending') {
        map[row.service_id].pending += Math.abs(amt);
      } else if (isCollected({ kind: row.kind as LedgerEntry['kind'], source: row.source as LedgerEntry['source'], settlement: row.settlement as LedgerEntry['settlement'] })) {
        map[row.service_id].collected += amt;
      }
    });
    setTotalsByService(map);
  }, []);

  const loadLedger = useCallback(async (service: ServiceRow) => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('service_finance_entries')
      .select('*')
      .eq('service_id', service.id)
      .order('entry_date', { ascending: false })
      .limit(500);
    if (err) setError(err.message);
    setEntries((data as LedgerEntry[]) || []);
    const { data: slips } = await supabase.rpc('finance_pending_bank_slips', { p_service_id: service.id });
    setBankSlips(Array.isArray(slips) ? slips : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([loadServices(), loadPermissions()]);
    })();
  }, [loadServices, loadPermissions]);

  useEffect(() => {
    setSelectedSlug(initialSlug || null);
  }, [initialSlug]);

  useEffect(() => {
    if (selectedSlug && services.length > 0) {
      const svc = services.find((s) => s.slug === selectedSlug);
      if (svc) void loadLedger(svc);
      else setLoading(false);
    } else if (services.length > 0) {
      void loadHubTotals(services);
      setLoading(false);
    }
  }, [selectedSlug, services, loadLedger, loadHubTotals]);

  useEffect(() => {
    if (!selected) return;
    const channel = supabase
      .channel(`service-ledger-${selected.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_finance_entries', filter: `service_id=eq.${selected.id}` },
        () => { void loadLedger(selected); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selected, loadLedger]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
      if (channelFilter !== 'all' && (e.channel || 'unpaid') !== channelFilter) return false;
      if (settlementFilter !== 'all' && e.settlement !== settlementFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (e.description || '').toLowerCase().includes(q)
        || (e.reference || '').toLowerCase().includes(q)
        || (e.category || '').toLowerCase().includes(q)
        || (e.request_type || '').toLowerCase().includes(q)
        || (e.payment_method || '').toLowerCase().includes(q)
      );
    });
  }, [entries, kindFilter, channelFilter, settlementFilter, search]);

  const stats = useMemo(() => {
    const collected = entries.filter(isCollected).reduce((s, e) => s + Number(e.amount_sle), 0);
    const expense = entries.filter((e) => e.kind === 'expense' && e.settlement !== 'void').reduce((s, e) => s + Math.abs(Number(e.amount_sle)), 0);
    const adjust = entries.filter((e) => e.kind === 'adjustment' && e.settlement !== 'void').reduce((s, e) => s + Number(e.amount_sle), 0);
    const pending = entries.filter((e) => e.source === 'booking' && e.settlement === 'pending').reduce((s, e) => s + Number(e.amount_sle), 0);
    const online = entries.filter((e) => isCollected(e) && e.channel === 'online').reduce((s, e) => s + Number(e.amount_sle), 0);
    const offline = entries.filter((e) => isCollected(e) && e.channel === 'offline').reduce((s, e) => s + Number(e.amount_sle), 0);
    return { collected, expense, adjust, net: collected - expense + adjust, pending, online, offline };
  }, [entries]);

  const saveEntry = async (form: Partial<LedgerEntry>) => {
    if (!selected) return;
    const amt = Number(form.amount_sle);
    if (!form.kind || !Number.isFinite(amt) || amt === 0) {
      setError('Enter a kind and a non-zero amount.');
      return;
    }
    setBusyId('save');
    const payload = {
      service_id: selected.id,
      entry_date: form.entry_date || new Date().toISOString().slice(0, 10),
      kind: form.kind,
      category: form.category || 'other',
      amount_sle: form.kind === 'expense' ? -Math.abs(amt) : amt,
      description: form.description?.trim() || null,
      reference: form.reference?.trim() || null,
      notes: form.notes?.trim() || null,
      source: 'manual' as const,
      settlement: 'recorded' as const,
      channel: form.channel || null,
    };
    const { data: userRes } = await supabase.auth.getUser();
    const { error: err } = form.id
      ? await supabase.from('service_finance_entries').update({ ...payload, updated_by: userRes.user?.id || null }).eq('id', form.id).eq('source', 'manual')
      : await supabase.from('service_finance_entries').insert({ ...payload, created_by: userRes.user?.id || null });
    setBusyId(null);
    if (err) { setError(err.message); return; }
    setModal(null);
    await loadLedger(selected);
  };

  const deleteEntry = async (entry: LedgerEntry) => {
    if (!selected || entry.source === 'booking') return;
    if (!confirm('Delete this ledger entry?')) return;
    setBusyId(entry.id);
    const { error: err } = await supabase.from('service_finance_entries').delete().eq('id', entry.id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    await loadLedger(selected);
  };

  const setQuote = async (entry: LedgerEntry, amount: number, note: string, deposit: number | null) => {
    if (!selected || !entry.booking_id) return;
    setBusyId('quote');
    const { data, error: err } = await supabase.rpc('finance_set_booking_quote', {
      p_booking_id: entry.booking_id,
      p_amount: amount,
      p_note: note || null,
    });
    if (err) { setBusyId(null); setError(err.message); return; }
    const result = data as { success?: boolean; error?: string } | null;
    if (result && result.success === false) { setBusyId(null); setError(result.error || 'Could not set quote'); return; }
    const { data: depData, error: depErr } = await supabase.rpc('set_quote_deposit', {
      p_booking_id: entry.booking_id,
      p_deposit: deposit,
    });
    setBusyId(null);
    const depResult = depData as { success?: boolean; error?: string } | null;
    if (depErr || depResult?.success === false) {
      setError(depResult?.error || depErr?.message || 'Quote saved, but the deposit could not be set');
      return;
    }
    setQuoteEntry(null);
    await loadLedger(selected);
  };

  const settle = async (entry: LedgerEntry, method: string, amount: number, reference: string, notes: string, immediate: boolean) => {
    if (!selected || !entry.booking_id) return;
    setBusyId('settle');
    const { data, error: err } = await supabase.rpc('finance_request_ledger_settle', {
      p_booking_id: entry.booking_id,
      p_method: method,
      p_amount: amount,
      p_reference: reference || null,
      p_notes: notes || null,
      p_immediate: immediate,
    });
    setBusyId(null);
    if (err) { setError(err.message); return; }
    const result = data as { success?: boolean; error?: string; queued?: boolean } | null;
    if (result && result.success === false) { setError(result.error || 'Could not record payment'); return; }
    setSettleEntry(null);
    setNotice(result?.queued ? 'Payment submitted for dual-control approval.' : 'Payment recorded.');
    await loadLedger(selected);
  };

  const invoiceFromEntry = async (entry: LedgerEntry, note: string) => {
    if (!selected || !entry.booking_id) return;
    setBusyId('invoice');
    const { data, error: err } = await supabase.rpc('finance_invoice_from_booking', {
      p_booking_id: entry.booking_id,
      p_due_days: 14,
      p_note: note || null,
    });
    setBusyId(null);
    if (err) { setError(err.message); return; }
    const result = data as { success?: boolean; error?: string; queued?: boolean } | null;
    if (result && result.success === false) { setError(result.error || 'Could not create invoice'); return; }
    setInvoiceEntry(null);
    setNotice(result?.queued ? 'Invoice submitted for approval.' : 'Invoice issued to the client.');
    await loadLedger(selected);
  };

  const reviewSlip = async (id: string, approve: boolean, reason?: string) => {
    setBusyId(id);
    const { data, error: err } = await supabase.rpc('finance_review_bank_slip', {
      p_id: id,
      p_approve: approve,
      p_reason: reason || null,
    });
    setBusyId(null);
    if (err) { setError(err.message); return; }
    const result = data as { success?: boolean; error?: string } | null;
    if (result && result.success === false) { setError(result.error || 'Could not review slip'); return; }
    setRejectSlip(null);
    setNotice(approve ? 'Bank slip verified.' : 'Bank slip rejected.');
    if (selected) await loadLedger(selected);
  };

  const togglePrivacy = (next: boolean) => {
    setFinancePrivacy(next);
    setPrivacy(next);
  };

  if (!selectedSlug) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Service ledgers"
          description="Quote and hire requests post here automatically. Record online or offline payments per service."
          icon={Wallet}
        />
        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 animate-shakeX">{error}</div>}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {FINANCE_SERVICE_PAGES.map((meta, idx) => {
              const svc = services.find((s) => s.slug === meta.slug);
              const totals = svc ? totalsByService[svc.id] : null;
              return (
                <button
                  key={meta.page}
                  type="button"
                  onClick={() => onNavigate(meta.page)}
                  style={{ animationDelay: `${idx * 60}ms` }}
                  className="text-left bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-emerald-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 animate-[fadeInUp_0.35s_ease_both]"
                >
                  <p className="text-sm font-bold text-slate-900">{meta.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5 mb-4">Open ledger</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Collected</p>
                      <p className="text-sm font-bold text-emerald-700 mt-0.5">{fmtMoney(totals?.collected || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Pending</p>
                      <p className="text-sm font-bold text-amber-600 mt-0.5">{fmtMoney(totals?.pending || 0)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs font-semibold text-emerald-600">
                    Manage entries <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-[fadeInUp_0.3s_ease]">
      <PageHeader
        title={selected?.name || 'Service ledger'}
        description="Client quote and hire requests appear here. Set amounts, invoice, and record online or offline payments."
        icon={Banknote}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <PrivacyToggle on={privacy} onChange={togglePrivacy} />
            <button
              type="button"
              onClick={() => onNavigate('finance-services')}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 hover:-translate-y-px transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> All services
            </button>
            {canWrite && (
              <button
                type="button"
                onClick={() => setModal({
                  kind: 'revenue',
                  category: 'other',
                  entry_date: new Date().toISOString().slice(0, 10),
                  amount_sle: 0,
                })}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 hover:shadow-md transition-all"
              >
                <Plus className="w-4 h-4" /> Add entry
              </button>
            )}
          </div>
        }
      />

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 animate-shakeX">{error}</div>}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 animate-scaleIn flex items-center gap-2">
          <Shield className="w-4 h-4" /> {notice}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="animate-[fadeInUp_0.35s_ease_both]"><StatCard label="Collected" value={fmtMoney(stats.collected)} icon={TrendingUp} color="text-emerald-600" accent="bg-emerald-50" /></div>
        <div className="animate-[fadeInUp_0.35s_ease_both]" style={{ animationDelay: '60ms' }}><StatCard label="Online collected" value={fmtMoney(stats.online)} icon={Smartphone} color="text-blue-600" accent="bg-blue-50" /></div>
        <div className="animate-[fadeInUp_0.35s_ease_both]" style={{ animationDelay: '120ms' }}><StatCard label="Offline collected" value={fmtMoney(stats.offline)} icon={WifiOff} color="text-amber-600" accent="bg-amber-50" /></div>
        <div className="animate-[fadeInUp_0.35s_ease_both]" style={{ animationDelay: '180ms' }}><StatCard label="Pending requests" value={fmtMoney(stats.pending)} icon={Banknote} color="text-slate-700" accent="bg-slate-50" /></div>
      </div>
      <p className="text-xs text-slate-400 -mt-2 flex items-center gap-1.5">
        <Lock className="w-3 h-3" />
        Net collected {fmtMoney(stats.net)} after expenses {fmtMoney(stats.expense)}. Payment references stay masked until you reveal them.
      </p>

      {bankSlips.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm animate-scaleIn">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/70 flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-700" />
            <p className="text-sm font-semibold text-amber-900">Bank slips awaiting review</p>
          </div>
          <div className="divide-y divide-slate-100">
            {bankSlips.map((slip) => (
              <div key={slip.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{slip.contact_name}</p>
                  <p className="text-xs text-slate-500 capitalize">{slip.document_type.replace('_', ' ')} · {slip.document_name}</p>
                </div>
                <p className="text-sm font-bold text-slate-800">{fmtMoney(Number(slip.amount_sle) || 0)}</p>
                <a href={slip.document_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">Open slip</a>
                {canWrite && (
                  <div className="flex gap-1">
                    <button type="button" disabled={busyId === slip.id} onClick={() => void reviewSlip(slip.id, true)}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                      Verify
                    </button>
                    <button type="button" onClick={() => setRejectSlip({ id: slip.id })}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 hover:bg-red-100">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, reference, quote/hire…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none">
          <option value="all">All kinds</option>
          {ENTRY_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none">
          <option value="all">All channels</option>
          {PAYMENT_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={settlementFilter} onChange={(e) => setSettlementFilter(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none">
          <option value="all">All statuses</option>
          {SETTLEMENTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button type="button" onClick={() => selected && void loadLedger(selected)} className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => downloadCsv(`${selectedSlug}-ledger.csv`, filtered.map((e) => ({
            date: e.entry_date, type: e.request_type || e.category, channel: e.channel, settlement: e.settlement,
            kind: e.kind, amount_sle: e.amount_sle, description: e.description,
            reference: redactCsvValue(privacy, 'reference', e.reference),
            payment_method: e.payment_method, notes: e.notes,
          })))}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50"
        >
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Wallet className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No ledger entries yet for this service.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Request</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Channel</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((e) => {
                  const kind = KIND_META[e.kind] || KIND_META.adjustment;
                  const channel = CHANNEL_META[e.channel || 'unpaid'];
                  const settleMeta = SETTLEMENT_META[e.settlement] || SETTLEMENT_META.recorded;
                  const requestLabel = e.request_type === 'quote' ? 'Quote' : e.request_type === 'hire' ? 'Hire' : kind.label;
                  const pendingBooking = e.source === 'booking' && e.settlement === 'pending';
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(e.entry_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${e.request_type === 'quote' ? 'bg-violet-50 text-violet-700' : e.request_type === 'hire' ? 'bg-emerald-50 text-emerald-700' : kind.cls}`}>
                          {requestLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${channel.cls}`}>{channel.label}</span>
                        {e.payment_method && <p className="text-[11px] text-slate-400 mt-0.5 capitalize">{e.payment_method.replace('_', ' ')}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${settleMeta.cls}`}>{settleMeta.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-800">{e.description || '—'}</p>
                        {e.reference && (
                          <SensitiveValue privacy={privacy} masked={maskReference(e.reference)} full={e.reference} mono />
                        )}
                        {e.invoice_id && <p className="text-[11px] text-blue-600 font-medium mt-0.5">Invoiced</p>}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${Number(e.amount_sle) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {fmtMoney(Number(e.amount_sle))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {canWrite && pendingBooking && (
                            <>
                              <button type="button" title="Set quote amount" onClick={() => setQuoteEntry(e)}
                                className="px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                                Quote
                              </button>
                              <button type="button" title="Issue invoice" onClick={() => setInvoiceEntry(e)}
                                className="px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 rounded-lg transition-colors">
                                Invoice
                              </button>
                              <button type="button" title="Record payment" onClick={() => setSettleEntry(e)}
                                className="px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                                Pay
                              </button>
                            </>
                          )}
                          {canWrite && e.source === 'manual' && (
                            <button type="button" title="Edit" onClick={() => setModal({ ...e, amount_sle: Math.abs(Number(e.amount_sle)) })}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && e.source === 'manual' && (
                            <button type="button" title="Delete" disabled={busyId === e.id} onClick={() => void deleteEntry(e)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                              {busyId === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
        </div>
      )}

      {modal && (
        <EntryModal
          entry={modal}
          busy={busyId === 'save'}
          onClose={() => setModal(null)}
          onSave={(next) => void saveEntry(next)}
        />
      )}
      {quoteEntry && (
        <QuoteModal
          entry={quoteEntry}
          busy={busyId === 'quote'}
          onClose={() => setQuoteEntry(null)}
          onSave={(amount, note, deposit) => void setQuote(quoteEntry, amount, note, deposit)}
        />
      )}
      {settleEntry && (
        <SettleModal
          entry={settleEntry}
          busy={busyId === 'settle'}
          allowImmediate={isSuper}
          onClose={() => setSettleEntry(null)}
          onSave={(method, amount, reference, notes, immediate) => void settle(settleEntry, method, amount, reference, notes, immediate)}
        />
      )}
      {invoiceEntry && (
        <InvoiceModal
          entry={invoiceEntry}
          busy={busyId === 'invoice'}
          onClose={() => setInvoiceEntry(null)}
          onSave={(note) => void invoiceFromEntry(invoiceEntry, note)}
        />
      )}
      {rejectSlip && (
        <RejectSlipModal
          busy={busyId === rejectSlip.id}
          onClose={() => setRejectSlip(null)}
          onSave={(reason) => void reviewSlip(rejectSlip.id, false, reason)}
        />
      )}
    </div>
  );
}

function EntryModal({
  entry,
  busy,
  onClose,
  onSave,
}: {
  entry: Partial<LedgerEntry>;
  busy: boolean;
  onClose: () => void;
  onSave: (entry: Partial<LedgerEntry>) => void;
}) {
  const [form, setForm] = useState<Partial<LedgerEntry>>(entry);
  const set = (key: keyof LedgerEntry, value: string | number) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col animate-scaleIn">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{form.id ? 'Edit entry' : 'Add manual entry'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <form
          className="overflow-y-auto flex-1 px-5 py-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); onSave(form); }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Date</label>
              <input type="date" value={form.entry_date || ''} onChange={(e) => set('entry_date', e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Amount (SLE)</label>
              <input type="number" step="0.01" min="0.01" value={form.amount_sle || ''} onChange={(e) => set('amount_sle', parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Kind</label>
            <div className="grid grid-cols-3 gap-2">
              {ENTRY_KINDS.map((k) => (
                <button key={k.id} type="button" onClick={() => set('kind', k.id)}
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-semibold ${form.kind === k.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Category</label>
            <select value={form.category || 'other'} onChange={(e) => set('category', e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white outline-none">
              {ENTRY_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Channel</label>
            <select value={form.channel || ''} onChange={(e) => set('channel', e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white outline-none">
              <option value="">Not set</option>
              {PAYMENT_CHANNELS.filter((c) => c.id !== 'unpaid').map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Description</label>
            <input value={form.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="What is this for?"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Reference</label>
            <input value={form.reference || ''} onChange={(e) => set('reference', e.target.value)} placeholder="Invoice, receipt, or voucher no."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Notes</label>
            <textarea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={2}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none resize-none" />
          </div>
          <button type="submit" disabled={busy}
            className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {form.id ? 'Save changes' : 'Create entry'}
          </button>
        </form>
      </div>
    </div>
  );
}

function QuoteModal({
  entry,
  busy,
  onClose,
  onSave,
}: {
  entry: LedgerEntry;
  busy: boolean;
  onClose: () => void;
  onSave: (amount: number, note: string, deposit: number | null) => void;
}) {
  const [amount, setAmount] = useState(String(Number(entry.amount_sle) || ''));
  const [deposit, setDeposit] = useState('');
  const [note, setNote] = useState('');
  const amountNum = parseFloat(amount) || 0;
  const depositNum = parseFloat(deposit) || 0;
  const depositInvalid = depositNum > 0 && depositNum >= amountNum;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Set quote amount</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <form
          className="px-5 py-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (depositInvalid) return;
            onSave(amountNum, note, depositNum > 0 ? depositNum : null);
          }}
        >
          <p className="text-sm text-slate-500">{entry.description}</p>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Quoted amount (SLE)</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Deposit to start (SLE, optional)</label>
            <input type="number" step="0.01" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)}
              placeholder="Leave empty to require full payment"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
            {depositInvalid && <p className="mt-1 text-xs text-red-600">The deposit must be less than the quoted amount.</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none resize-none" />
          </div>
          <button type="submit" disabled={busy}
            className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            Save quote
          </button>
        </form>
      </div>
    </div>
  );
}

function SettleModal({
  entry,
  busy,
  allowImmediate,
  onClose,
  onSave,
}: {
  entry: LedgerEntry;
  busy: boolean;
  allowImmediate: boolean;
  onClose: () => void;
  onSave: (method: string, amount: number, reference: string, notes: string, immediate: boolean) => void;
}) {
  const [method, setMethod] = useState(entry.payment_method === 'bank' || entry.payment_method === 'cash' || entry.payment_method === 'wallet' || entry.payment_method === 'monime' ? entry.payment_method : 'cash');
  const [amount, setAmount] = useState(String(Number(entry.amount_sle) || ''));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [immediate, setImmediate] = useState(false);
  const selected = SETTLE_METHODS.find((m) => m.id === method);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md animate-scaleIn">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Record payment</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <form
          className="px-5 py-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); onSave(method, parseFloat(amount) || 0, reference, notes, immediate); }}
        >
          <p className="text-sm text-slate-500">{entry.description}</p>
          <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
            <Shield className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-600">Offline and online collections go through dual-control unless a super-admin records immediately.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Channel</label>
            <div className="grid grid-cols-2 gap-2">
              {SETTLE_METHODS.map((m) => (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-semibold text-left transition-all ${method === m.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700 scale-[1.02]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {m.label}
                  <span className="block text-[10px] font-medium opacity-70 capitalize">{m.channel}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Amount (SLE)</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Reference</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={selected?.channel === 'offline' ? 'Receipt or deposit slip' : 'Wallet / mobile money ref'}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none" autoComplete="off" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none resize-none" />
          </div>
          {allowImmediate && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} className="rounded border-slate-300" />
              Record now (skip approval)
            </label>
          )}
          <button type="submit" disabled={busy}
            className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Banknote className="w-5 h-5" />}
            {immediate ? 'Record now' : 'Submit for approval'}
          </button>
        </form>
      </div>
    </div>
  );
}

function InvoiceModal({
  entry,
  busy,
  onClose,
  onSave,
}: {
  entry: LedgerEntry;
  busy: boolean;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md animate-scaleIn">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Issue invoice</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <form className="px-5 py-5 space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(note); }}>
          <p className="text-sm text-slate-500">{entry.description}</p>
          <p className="text-sm font-bold text-slate-800">{fmtMoney(Number(entry.amount_sle))}</p>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Note to client</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none resize-none" />
          </div>
          <button type="submit" disabled={busy}
            className="w-full py-3.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            Create invoice
          </button>
        </form>
      </div>
    </div>
  );
}

function RejectSlipModal({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md animate-scaleIn">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Reject bank slip</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <form className="px-5 py-5 space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(reason); }}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required placeholder="Reason for the client…"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none resize-none" />
          <button type="submit" disabled={busy || !reason.trim()}
            className="w-full py-3.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Rejecting…' : 'Reject slip'}
          </button>
        </form>
      </div>
    </div>
  );
}

export { financePageForSlug };
