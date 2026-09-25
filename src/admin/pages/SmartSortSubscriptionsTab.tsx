import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Pause, Play, X, TrendingUp, Users, CalendarCheck, Recycle,
  Search, ChevronDown, ChevronUp, SlidersHorizontal, Mail, Phone,
  CreditCard, AlertCircle, Download, RefreshCw, CalendarOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Sub {
  id: string;
  user_id: string;
  waste_type: string;
  bin_size_liters: number;
  frequency: string;
  time_slot: string;
  address: string;
  landmark: string | null;
  contact_phone: string;
  special_instructions: string | null;
  plan_name: string | null;
  plan_price_sle: number | null;
  status: string;
  auto_pay: boolean;
  paused_until: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

const WASTE_LABELS: Record<string, string> = {
  general: 'General Waste', recyclables: 'Recyclables', organic: 'Organic / Green',
  construction: 'Construction', ewaste: 'E-Waste', bulk: 'Bulk Items',
};

type StatusFilter = 'all' | 'active' | 'paused' | 'cancelled';
type SortKey = 'created_at' | 'client' | 'price' | 'status';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
};

function SubStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function fmtDate(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return '—';
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00')).toLocaleDateString('en-GB', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number | null) {
  if (n == null) return '—';
  return `SLE ${n.toLocaleString()}`;
}

export function SmartSortSubscriptionsTab() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Sub | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [plans, setPlans] = useState<{ id: string; name: string; price_sle: number; bin_size_liters: number; frequency: string }[]>([]);
  const [editPlanName, setEditPlanName] = useState('');
  const [editFrequency, setEditFrequency] = useState('weekly');
  const [editSlot, setEditSlot] = useState('morning');
  const [editAddress, setEditAddress] = useState('');
  const [editLandmark, setEditLandmark] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [pauseUntil, setPauseUntil] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const q = supabase.from('smart_sort_subscriptions')
      .select('*, profiles(full_name, email)')
      .order('created_at', { ascending: false });
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setSubs([]);
    } else {
      setSubs((data as Sub[]) || []);
    }
    const plansRes = await supabase.from('smart_sort_plans').select('id, name, price_sle, bin_size_liters, frequency').eq('is_active', true).order('sort_order');
    if (plansRes.data) setPlans(plansRes.data as typeof plans);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const planNames = useMemo(() => {
    const set = new Set<string>();
    subs.forEach(s => { if (s.plan_name) set.add(s.plan_name); });
    return Array.from(set).sort();
  }, [subs]);

  const filtered = useMemo(() => {
    let result = subs;
    if (statusFilter !== 'all') result = result.filter(s => s.status === statusFilter);
    if (planFilter !== 'all') result = result.filter(s => (s.plan_name || '—') === planFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        (s.profiles?.full_name || '').toLowerCase().includes(q) ||
        (s.profiles?.email || '').toLowerCase().includes(q) ||
        s.contact_phone.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'created_at') cmp = a.created_at.localeCompare(b.created_at);
      else if (sortKey === 'client') cmp = (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || '');
      else if (sortKey === 'price') cmp = (a.plan_price_sle || 0) - (b.plan_price_sle || 0);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      return cmp * dir;
    });
    return result;
  }, [subs, statusFilter, planFilter, search, sortKey, sortDir]);

  const stats = useMemo(() => {
    const active = subs.filter(s => s.status === 'active');
    const paused = subs.filter(s => s.status === 'paused');
    const cancelled = subs.filter(s => s.status === 'cancelled');
    const mrr = active.reduce((sum, s) => sum + (s.plan_price_sle || 0), 0);
    const arr = mrr * 12;
    const uniqueClients = new Set(subs.map(s => s.user_id)).size;
    const churnRate = subs.length > 0 ? (cancelled.length / subs.length) * 100 : 0;
    return { active: active.length, paused: paused.length, cancelled: cancelled.length, mrr, arr, uniqueClients, churnRate };
  }, [subs]);

  const updateSub = async (id: string, patch: Partial<Sub>) => {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, ...patch } as Sub : s));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, ...patch } as Sub : prev);
    await supabase.from('smart_sort_subscriptions').update(patch).eq('id', id);
  };

  const cancelSub = async (id: string) => {
    if (!confirm('Cancel this subscription? The client will stop receiving pickups.')) return;
    await updateSub(id, { status: 'cancelled' });
  };

  const resumeSub = async (id: string) => {
    const { error: err } = await supabase.rpc('resume_smart_sort_subscription', { p_subscription_id: id });
    if (err) { setError(err.message); return; }
    await load();
  };

  const pauseSub = async (id: string, until?: string) => {
    const pausedUntil = until || pauseUntil;
    if (!pausedUntil) {
      const days = prompt('Pause until date (YYYY-MM-DD)', new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
      if (!days) return;
      const { error: err } = await supabase.rpc('pause_smart_sort_subscription', {
        p_subscription_id: id,
        p_paused_until: days,
      });
      if (err) { setError(err.message); return; }
      await load();
      return;
    }
    const { error: err } = await supabase.rpc('pause_smart_sort_subscription', {
      p_subscription_id: id,
      p_paused_until: pausedUntil,
    });
    if (err) { setError(err.message); return; }
    await load();
  };

  const openDetail = (sub: Sub) => {
    setSelected(sub);
    setEditNote(sub.special_instructions || '');
    setEditPrice(sub.plan_price_sle != null ? String(sub.plan_price_sle) : '');
    setEditPlanName(sub.plan_name || '');
    setEditFrequency(sub.frequency);
    setEditSlot(sub.time_slot);
    setEditAddress(sub.address);
    setEditLandmark(sub.landmark || '');
    setEditPhone(sub.contact_phone);
    setPauseUntil(sub.paused_until || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  };

  const applyCatalogPlan = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    setEditPlanName(plan.name);
    setEditPrice(String(plan.price_sle));
    setEditFrequency(plan.frequency);
  };

  const saveDetail = async () => {
    if (!selected) return;
    setSavingNote(true);
    const patch: Partial<Sub> = {
      special_instructions: editNote.trim() || null,
      plan_name: editPlanName.trim() || null,
      frequency: editFrequency,
      time_slot: editSlot,
      address: editAddress.trim(),
      landmark: editLandmark.trim() || null,
      contact_phone: editPhone.trim(),
    };
    if (editPrice.trim() !== '') {
      const p = parseInt(editPrice, 10);
      if (!isNaN(p) && p >= 0) patch.plan_price_sle = p;
    }
    const catalog = plans.find(p => p.name === editPlanName);
    if (catalog) patch.bin_size_liters = catalog.bin_size_liters;
    const scheduleChanged = editFrequency !== selected.frequency || editSlot !== selected.time_slot;
    await updateSub(selected.id, patch);
    if (scheduleChanged) {
      await supabase.rpc('refresh_smart_sort_schedule', { p_subscription_id: selected.id });
    }
    setSavingNote(false);
  };

  const exportCsv = () => {
    const headers = ['Client', 'Email', 'Phone', 'Waste Type', 'Bin Size (L)', 'Frequency', 'Time Slot', 'Address', 'Plan', 'Price (SLE)', 'Status', 'Auto-Pay', 'Paused Until', 'Created At'];
    const rows = filtered.map(s => [
      s.profiles?.full_name || '',
      s.profiles?.email || '',
      s.contact_phone,
      WASTE_LABELS[s.waste_type] ?? s.waste_type,
      s.bin_size_liters,
      s.frequency,
      s.time_slot,
      s.address,
      s.plan_name || '',
      s.plan_price_sle ?? '',
      s.status,
      s.auto_pay ? 'Yes' : 'No',
      s.paused_until || '',
      s.created_at,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-sort-subscriptions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Active Subs', value: stats.active, icon: Recycle, color: 'text-emerald-600' },
          { label: 'Paused', value: stats.paused, icon: Pause, color: 'text-amber-600' },
          { label: 'MRR', value: fmtMoney(stats.mrr), icon: Wallet, color: 'text-blue-600' },
          { label: 'Subscribers', value: stats.uniqueClients, icon: Users, color: 'text-slate-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Annual Run Rate', value: fmtMoney(stats.arr), icon: TrendingUp },
          { label: 'Cancelled', value: stats.cancelled, icon: X },
          { label: 'Churn Rate', value: `${stats.churnRate.toFixed(1)}%`, icon: AlertCircle },
          { label: 'Total Records', value: subs.length, icon: CalendarCheck },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-slate-50 rounded-xl border border-slate-100 p-3 flex items-center gap-3">
            <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-slate-800">{value}</p>
              <p className="text-[11px] text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, phone, address…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                showFilters || planFilter !== 'all' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" /> Filters
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors"
            >
              <Download className="w-4 h-4" /> Export
            </button>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'active', 'paused', 'cancelled'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === f ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {f === 'all' ? 'All Status' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className="ml-1.5 opacity-70">({stats[f as keyof typeof stats] as number})</span>
              )}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Plan</label>
              <select
                value={planFilter}
                onChange={e => setPlanFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="all">All Plans</option>
                {planNames.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Sort By</label>
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="created_at">Date Created</option>
                <option value="client">Client Name</option>
                <option value="price">Plan Price</option>
                <option value="status">Status</option>
              </select>
            </div>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white hover:bg-slate-50 transition-colors self-end"
            >
              {sortDir === 'asc' ? 'Ascending' : 'Descending'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No subscriptions found</p>
          <p className="text-sm text-slate-400 mt-1">Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('client')}>
                    <span className="inline-flex items-center gap-1">Client <SortIcon k="client" /></span>
                  </th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('price')}>
                    <span className="inline-flex items-center gap-1">Price <SortIcon k="price" /></span>
                  </th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('status')}>
                    <span className="inline-flex items-center gap-1">Status <SortIcon k="status" /></span>
                  </th>
                  <th className="px-4 py-3 hidden md:table-cell">Schedule</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Auto-Pay</th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('created_at')}>
                    <span className="inline-flex items-center gap-1">Created <SortIcon k="created_at" /></span>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(sub => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openDetail(sub)}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 truncate">{sub.profiles?.full_name || 'Unknown client'}</div>
                      <div className="text-xs text-slate-400 truncate">{sub.profiles?.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {sub.plan_name ? (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-teal-50 text-teal-700 border border-teal-200">{sub.plan_name}</span>
                      ) : <span className="text-xs text-slate-400">Custom</span>}
                      <div className="text-xs text-slate-400 mt-0.5">{WASTE_LABELS[sub.waste_type] ?? sub.waste_type} · {sub.bin_size_liters}L</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{fmtMoney(sub.plan_price_sle)}</td>
                    <td className="px-4 py-3"><SubStatusBadge status={sub.status} /></td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600">
                      <span className="capitalize">{sub.frequency}</span>
                      <div className="text-xs text-slate-400">{sub.time_slot}</div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`inline-flex items-center gap-1 text-xs ${sub.auto_pay ? 'text-blue-600' : 'text-slate-400'}`}>
                        <CreditCard className="w-3 h-3" /> {sub.auto_pay ? 'On' : 'Off'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden text-xs text-slate-500">{fmtDate(sub.created_at)}</td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {sub.status === 'active' && (
                          <button onClick={() => pauseSub(sub.id)} title="Pause" className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {sub.status === 'paused' && (
                          <button onClick={() => resumeSub(sub.id)} title="Resume" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {sub.status !== 'cancelled' && (
                          <button onClick={() => cancelSub(sub.id)} title="Cancel" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            Showing {filtered.length} of {subs.length} subscriptions
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="font-bold text-slate-900">Subscription Details</h3>
                <p className="text-xs text-slate-400">{selected.id.slice(0, 8)}…</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Client */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Client</h4>
                <div className="space-y-1.5">
                  <p className="font-semibold text-slate-900">{selected.profiles?.full_name || 'Unknown client'}</p>
                  {selected.profiles?.email && (
                    <p className="flex items-center gap-2 text-sm text-slate-600"><Mail className="w-3.5 h-3.5 text-slate-400" /> {selected.profiles.email}</p>
                  )}
                  <p className="flex items-center gap-2 text-sm text-slate-600"><Phone className="w-3.5 h-3.5 text-slate-400" /> {selected.contact_phone}</p>
                </div>
              </div>

              {/* Status */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Status</h4>
                <div className="flex items-center gap-2 mb-2">
                  <SubStatusBadge status={selected.status} />
                  <span className="text-xs text-slate-400">Since {fmtDate(selected.created_at)}</span>
                </div>
                {selected.paused_until && (
                  <p className="flex items-center gap-2 text-sm text-amber-600">
                    <CalendarOff className="w-3.5 h-3.5" /> Paused until {fmtDate(selected.paused_until, { day: 'numeric', month: 'short' })}
                  </p>
                )}
              </div>

              {/* Plan */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Plan</h4>
                <div className="space-y-2">
                  <select
                    value={plans.find(p => p.name === editPlanName)?.id || ''}
                    onChange={e => applyCatalogPlan(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">Custom / snapshot</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} · SLE {p.price_sle}</option>)}
                  </select>
                  <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{editPlanName || 'Custom plan'}</span>
                      <span className="font-bold text-slate-900">{fmtMoney(editPrice ? parseInt(editPrice, 10) : selected.plan_price_sle)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-white border border-slate-200 text-slate-600">{WASTE_LABELS[selected.waste_type] ?? selected.waste_type}</span>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-white border border-slate-200 text-slate-600">{selected.bin_size_liters}L bin</span>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-white border border-slate-200 text-slate-600 capitalize">{editFrequency}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pickup Schedule</h4>
                <div className="space-y-2">
                  <select value={editFrequency} onChange={e => setEditFrequency(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                    {['daily', 'twice-weekly', 'weekly', 'bi-weekly', 'three-weeks', 'monthly'].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <select value={editSlot} onChange={e => setEditSlot(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                    {['morning', 'afternoon', 'evening'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="text" value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Address" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                  <input type="text" value={editLandmark} onChange={e => setEditLandmark(e.target.value)} placeholder="Landmark" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                  <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
              </div>

              {/* Billing */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billing</h4>
                <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                  <span className="text-sm text-slate-600 flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Auto-pay
                  </span>
                  <button
                    onClick={() => updateSub(selected.id, { auto_pay: !selected.auto_pay })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${selected.auto_pay ? 'bg-emerald-600' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${selected.auto_pay ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              {/* Admin notes / price override */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Admin Controls</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Custom Price (SLE/mo)</label>
                    <input
                      type="number"
                      min={0}
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                      placeholder={selected.plan_price_sle != null ? String(selected.plan_price_sle) : '—'}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Special Instructions</label>
                    <textarea
                      value={editNote}
                      onChange={e => setEditNote(e.target.value)}
                      rows={3}
                      placeholder="Add internal notes or delivery instructions…"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                    />
                  </div>
                  <button
                    onClick={saveDetail}
                    disabled={savingNote}
                    className="w-full py-2.5 bg-emerald-600 text-white font-semibold rounded-lg text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {savingNote ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>

              {/* Lifecycle actions */}
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                {selected.status === 'active' && (
                  <div className="flex gap-2">
                    <input type="date" value={pauseUntil} onChange={e => setPauseUntil(e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                    <button onClick={() => pauseSub(selected.id, pauseUntil)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                      <Pause className="w-4 h-4" /> Pause
                    </button>
                  </div>
                )}
                {selected.status === 'paused' && (
                  <button onClick={() => resumeSub(selected.id)} className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                    <Play className="w-4 h-4" /> Resume
                  </button>
                )}
                {selected.status !== 'cancelled' && (
                  <button onClick={() => cancelSub(selected.id)} className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                    <X className="w-4 h-4" /> Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
