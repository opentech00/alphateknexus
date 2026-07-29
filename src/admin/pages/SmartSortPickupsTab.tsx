import { useEffect, useMemo, useState } from 'react';
import {
  Truck, CalendarDays, MapPin, Clock, User, ChevronLeft, ChevronRight,
  Search, RefreshCw, CheckCircle2, X, AlertCircle, Route, Plus, XCircle,
  CircleDashed, PlayCircle, Download,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Pickup {
  id: string;
  subscription_id: string;
  user_id: string;
  scheduled_date: string;
  time_slot: string;
  driver_name: string | null;
  route_order: number;
  status: string;
  completed_at: string | null;
  notes: string | null;
  waste_kg: number | null;
  diverted_kg: number | null;
  created_at: string;
  updated_at: string;
  smart_sort_subscriptions: {
    waste_type: string;
    bin_size_liters: number;
    address: string;
    landmark: string | null;
    contact_phone: string;
    plan_name: string | null;
    profiles: { full_name: string | null; email: string | null } | null;
  } | null;
}

const WASTE_LABELS: Record<string, string> = {
  general: 'General Waste', recyclables: 'Recyclables', organic: 'Organic / Green',
  construction: 'Construction', ewaste: 'E-Waste', bulk: 'Bulk Items',
};

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof CircleDashed }> = {
  scheduled: { label: 'Scheduled', cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: CircleDashed },
  assigned: { label: 'Assigned', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: User },
  in_progress: { label: 'In Progress', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: PlayCircle },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  missed: { label: 'Missed', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-600 border-red-200', icon: XCircle },
};

const TIME_SLOTS = ['morning', 'afternoon', 'evening'];

function fmtDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function parseDate(iso: string) {
  return new Date(iso + 'T12:00');
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function SmartSortPickupsTab() {
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentWeek, setCurrentWeek] = useState(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return monday;
  });
  const [view, setView] = useState<'board' | 'routes'>('board');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Pickup | null>(null);
  const [editDriver, setEditDriver] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('scheduled');
  const [editWasteKg, setEditWasteKg] = useState('');
  const [editDivertedKg, setEditDivertedKg] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    const weekStart = fmtDate(currentWeek);
    const weekEnd = fmtDate(addDays(currentWeek, 6));
    const { data, error: err } = await supabase
      .from('smart_sort_pickups')
      .select('*, smart_sort_subscriptions(waste_type, bin_size_liters, address, landmark, contact_phone, plan_name, profiles(full_name, email))')
      .gte('scheduled_date', weekStart)
      .lte('scheduled_date', weekEnd)
      .order('scheduled_date', { ascending: true })
      .order('route_order', { ascending: true });
    if (err) {
      setError(err.message);
      setPickups([]);
    } else {
      setPickups((data as Pickup[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentWeek]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));
  }, [currentWeek]);

  const pickupsByDay = useMemo(() => {
    const map: Record<string, Pickup[]> = {};
    weekDays.forEach(d => { map[fmtDate(d)] = []; });
    pickups.forEach(p => {
      if (map[p.scheduled_date]) map[p.scheduled_date].push(p);
    });
    return map;
  }, [pickups, weekDays]);

  const filteredPickups = useMemo(() => {
    let result = pickups;
    if (statusFilter !== 'all') result = result.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.smart_sort_subscriptions?.profiles?.full_name || '').toLowerCase().includes(q) ||
        (p.smart_sort_subscriptions?.address || '').toLowerCase().includes(q) ||
        (p.driver_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [pickups, statusFilter, search]);

  const stats = useMemo(() => {
    const total = pickups.length;
    const completed = pickups.filter(p => p.status === 'completed').length;
    const scheduled = pickups.filter(p => p.status === 'scheduled').length;
    const assigned = pickups.filter(p => p.status === 'assigned').length;
    const inProgress = pickups.filter(p => p.status === 'in_progress').length;
    const missed = pickups.filter(p => p.status === 'missed').length;
    return { total, completed, scheduled, assigned, inProgress, missed };
  }, [pickups]);

  const routes = useMemo(() => {
    const byDriver: Record<string, Pickup[]> = {};
    filteredPickups.forEach(p => {
      const d = p.driver_name || 'Unassigned';
      if (!byDriver[d]) byDriver[d] = [];
      byDriver[d].push(p);
    });
    Object.values(byDriver).forEach(arr => arr.sort((a, b) => a.route_order - b.route_order));
    return byDriver;
  }, [filteredPickups]);

  const updatePickup = async (id: string, patch: Partial<Pickup>) => {
    setPickups(prev => prev.map(p => p.id === id ? { ...p, ...patch } as Pickup : p));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, ...patch } as Pickup : prev);
    const payload: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.status === 'completed' && !selected?.completed_at) {
      payload.completed_at = new Date().toISOString();
    }
    if (patch.status && patch.status !== 'completed') {
      payload.completed_at = null;
    }
    await supabase.from('smart_sort_pickups').update(payload).eq('id', id);
  };

  const openDetail = (p: Pickup) => {
    setSelected(p);
    setEditDriver(p.driver_name || '');
    setEditNotes(p.notes || '');
    setEditStatus(p.status);
    setEditWasteKg(p.waste_kg != null ? String(p.waste_kg) : '');
    setEditDivertedKg(p.diverted_kg != null ? String(p.diverted_kg) : '');
  };

  const saveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    await updatePickup(selected.id, {
      driver_name: editDriver.trim() || null,
      notes: editNotes.trim() || null,
      status: editStatus,
      waste_kg: editWasteKg ? parseFloat(editWasteKg) : null,
      diverted_kg: editDivertedKg ? parseFloat(editDivertedKg) : null,
    } as any);
    setSaving(false);
    setSelected(null);
  };

  const advanceStatus = async (p: Pickup) => {
    const flow: Record<string, string> = {
      scheduled: 'assigned', assigned: 'in_progress', in_progress: 'completed',
    };
    const next = flow[p.status];
    if (next) await updatePickup(p.id, { status: next } as any);
  };

  const markMissed = async (p: Pickup) => {
    if (!confirm('Mark this pickup as missed?')) return;
    await updatePickup(p.id, { status: 'missed' } as any);
  };

  const cancelPickup = async (p: Pickup) => {
    if (!confirm('Cancel this pickup?')) return;
    await updatePickup(p.id, { status: 'cancelled' } as any);
  };

  const reorderRoute = async (driver: string, pickups: Pickup[], idx: number, dir: -1 | 1) => {
    const swap = pickups[idx + dir];
    if (!swap) return;
    const a = pickups[idx];
    await Promise.all([
      supabase.from('smart_sort_pickups').update({ route_order: swap.route_order, updated_at: new Date().toISOString() }).eq('id', a.id),
      supabase.from('smart_sort_pickups').update({ route_order: a.route_order, updated_at: new Date().toISOString() }).eq('id', swap.id),
    ]);
    load();
  };

  const exportCsv = () => {
    const headers = ['Date', 'Time Slot', 'Client', 'Address', 'Waste Type', 'Bin (L)', 'Driver', 'Route #', 'Status', 'Completed At', 'Notes'];
    const rows = filteredPickups.map(p => [
      p.scheduled_date, p.time_slot,
      p.smart_sort_subscriptions?.profiles?.full_name || '',
      p.smart_sort_subscriptions?.address || '',
      WASTE_LABELS[p.smart_sort_subscriptions?.waste_type ?? ''] ?? p.smart_sort_subscriptions?.waste_type,
      p.smart_sort_subscriptions?.bin_size_liters,
      p.driver_name || '',
      p.route_order,
      p.status,
      p.completed_at || '',
      p.notes || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-sort-pickups-${fmtDate(currentWeek)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const weekLabel = `${weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const StatusBadge = ({ status }: { status: string }) => {
    const m = STATUS_META[status] ?? STATUS_META.scheduled;
    const Icon = m.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>
        <Icon className="w-3 h-3" /> {m.label}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: Truck, color: 'text-slate-600' },
          { label: 'Scheduled', value: stats.scheduled, icon: CircleDashed, color: 'text-slate-500' },
          { label: 'Assigned', value: stats.assigned, icon: User, color: 'text-blue-600' },
          { label: 'In Progress', value: stats.inProgress, icon: PlayCircle, color: 'text-indigo-600' },
          { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Missed', value: stats.missed, icon: AlertCircle, color: 'text-amber-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
            <Icon className={`w-4 h-4 ${color} mb-1.5`} />
            <p className="text-xl font-bold text-slate-900">{value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentWeek(w => addDays(w, -7))} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="font-semibold text-slate-800 text-sm min-w-[160px] text-center">{weekLabel}</span>
            <button onClick={() => setCurrentWeek(w => addDays(w, 7))} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={() => { const today = new Date(); const m = new Date(today); m.setDate(today.getDate() - ((today.getDay() + 6) % 7)); setCurrentWeek(m); }}
              className="ml-1 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 lg:justify-end">
            <div className="relative flex-1 lg:max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search client, address, driver…"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="all">All Status</option>
              {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('board')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${view === 'board' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >Board</button>
              <button
                onClick={() => setView('routes')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${view === 'routes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >Routes</button>
            </div>
            <button onClick={exportCsv} className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors" title="Export CSV">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={load} className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : view === 'board' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {weekDays.map((day, i) => {
            const dateKey = fmtDate(day);
            const dayPickups = pickupsByDay[dateKey]?.filter(p =>
              (statusFilter === 'all' || p.status === statusFilter) &&
              (!search.trim() ||
                (p.smart_sort_subscriptions?.profiles?.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
                (p.smart_sort_subscriptions?.address || '').toLowerCase().includes(search.toLowerCase()))
            ) || [];
            const isToday = fmtDate(new Date()) === dateKey;
            return (
              <div key={dateKey} className={`bg-white rounded-xl border ${isToday ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200'} shadow-sm flex flex-col`}>
                <div className={`px-3 py-2.5 border-b ${isToday ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100'} rounded-t-xl`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {day.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </span>
                    <span className={`text-lg font-bold ${isToday ? 'text-emerald-700' : 'text-slate-800'}`}>{day.getDate()}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">{dayPickups.length} pickup{dayPickups.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="p-2 space-y-2 flex-1 min-h-[80px]">
                  {dayPickups.length === 0 ? (
                    <div className="h-full flex items-center justify-center py-4">
                      <span className="text-xs text-slate-300">No pickups</span>
                    </div>
                  ) : dayPickups.map(p => (
                    <button
                      key={p.id}
                      onClick={() => openDetail(p)}
                      className="w-full text-left p-2.5 rounded-lg border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-800 truncate">{p.smart_sort_subscriptions?.profiles?.full_name || 'Client'}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mb-1">
                        <Clock className="w-3 h-3" /> {p.time_slot}
                        {p.driver_name && <span className="text-blue-600">· {p.driver_name}</span>}
                      </p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 flex-shrink-0" /> {p.smart_sort_subscriptions?.address}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.keys(routes).length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Route className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">No pickups match your filters</p>
            </div>
          ) : (
            Object.entries(routes).sort(([a], [b]) => a.localeCompare(b)).map(([driver, driverPickups]) => (
              <div key={driver} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${driver === 'Unassigned' ? 'bg-slate-200' : 'bg-blue-100'}`}>
                      <User className={`w-4 h-4 ${driver === 'Unassigned' ? 'text-slate-500' : 'text-blue-600'}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{driver}</h3>
                      <p className="text-xs text-slate-400">{driverPickups.length} stop{driverPickups.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {driverPickups.map((p, idx) => (
                    <div key={p.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          onClick={() => reorderRoute(driver, driverPickups, idx, -1)}
                          disabled={idx === 0}
                          className="text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors text-xs"
                        >▲</button>
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                        <button
                          onClick={() => reorderRoute(driver, driverPickups, idx, 1)}
                          disabled={idx === driverPickups.length - 1}
                          className="text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors text-xs"
                        >▼</button>
                      </div>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDetail(p)}>
                        <p className="font-semibold text-slate-900 text-sm truncate">{p.smart_sort_subscriptions?.profiles?.full_name || 'Client'}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" /> {p.smart_sort_subscriptions?.address}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {p.scheduled_date} · {p.time_slot} · {WASTE_LABELS[p.smart_sort_subscriptions?.waste_type ?? ''] ?? p.smart_sort_subscriptions?.waste_type} · {p.smart_sort_subscriptions?.bin_size_liters}L
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.status} />
                        {p.status !== 'completed' && p.status !== 'cancelled' && p.status !== 'missed' && (
                          <button
                            onClick={() => advanceStatus(p)}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap"
                          >
                            Advance →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="font-bold text-slate-900">Pickup Details</h3>
                <p className="text-xs text-slate-400">{selected.id.slice(0, 8)}… · {selected.scheduled_date}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Client</h4>
                <p className="font-semibold text-slate-900">{selected.smart_sort_subscriptions?.profiles?.full_name || 'Unknown'}</p>
                {selected.smart_sort_subscriptions?.profiles?.email && (
                  <p className="text-sm text-slate-500">{selected.smart_sort_subscriptions.profiles.email}</p>
                )}
                <p className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> {selected.smart_sort_subscriptions?.address}
                </p>
                {selected.smart_sort_subscriptions?.landmark && (
                  <p className="text-xs text-slate-400 ml-5">Landmark: {selected.smart_sort_subscriptions.landmark}</p>
                )}
                <p className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> {selected.time_slot}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Waste</h4>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                    {WASTE_LABELS[selected.smart_sort_subscriptions?.waste_type ?? ''] ?? selected.smart_sort_subscriptions?.waste_type}
                  </span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                    {selected.smart_sort_subscriptions?.bin_size_liters}L bin
                  </span>
                  {selected.smart_sort_subscriptions?.plan_name && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                      {selected.smart_sort_subscriptions.plan_name}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Current Status</h4>
                <StatusBadge status={selected.status} />
                {selected.completed_at && (
                  <p className="text-xs text-slate-400 mt-1.5">Completed {new Date(selected.completed_at).toLocaleString('en-GB')}</p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Manage</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Assigned Driver</label>
                    <input
                      type="text"
                      value={editDriver}
                      onChange={e => setEditDriver(e.target.value)}
                      placeholder="e.g. John Driver"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Notes</label>
                    <textarea
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      rows={3}
                      placeholder="Driver / admin notes…"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Waste Collected (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editWasteKg}
                        onChange={e => setEditWasteKg(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Diverted (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editDivertedKg}
                        onChange={e => setEditDivertedKg(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                  <button
                    onClick={saveDetail}
                    disabled={saving}
                    className="w-full py-2.5 bg-emerald-600 text-white font-semibold rounded-lg text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                {selected.status !== 'completed' && selected.status !== 'cancelled' && selected.status !== 'missed' && (
                  <button onClick={() => advanceStatus(selected)} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                    <PlayCircle className="w-4 h-4" /> Advance
                  </button>
                )}
                {selected.status !== 'missed' && selected.status !== 'cancelled' && selected.status !== 'completed' && (
                  <button onClick={() => markMissed(selected)} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                    <AlertCircle className="w-4 h-4" /> Missed
                  </button>
                )}
                {selected.status !== 'cancelled' && selected.status !== 'completed' && (
                  <button onClick={() => cancelPickup(selected)} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                    <XCircle className="w-4 h-4" /> Cancel
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
