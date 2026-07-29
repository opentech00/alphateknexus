import { useEffect, useState, useCallback } from 'react';
import {
  ClipboardList, Plus, Trash2, Loader2, Search, Power, PowerOff,
  Building2, Briefcase, Globe, Save, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import type { HrRole } from '../hr/types';

interface RoleActivity {
  id: string;
  role_id: string | null;
  service_id: string | null;
  activity_key: string;
  activity_label: string;
  activity_description: string | null;
  activity_type: 'page' | 'action' | 'report';
  display_order: number;
  is_active: boolean;
}

interface Service {
  id: string;
  name: string;
  slug: string;
}

const ACTIVITY_TYPES = [
  { value: 'page', label: 'Page' },
  { value: 'action', label: 'Action' },
  { value: 'report', label: 'Report' },
];

export function ActivitiesManagementPage() {
  const [activities, setActivities] = useState<RoleActivity[]>([]);
  const [roles, setRoles] = useState<HrRole[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | 'global' | 'division' | 'role'>('all');
  const [updating, setUpdating] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [actRes, rolesRes, svcRes] = await Promise.all([
      supabase.from('role_activities').select('*').order('display_order'),
      supabase.from('hr_roles').select('*').order('name'),
      supabase.from('services').select('id,name,slug').order('name'),
    ]);
    if (actRes.error) setError(actRes.error.message);
    else setActivities(actRes.data as RoleActivity[] || []);
    setRoles((rolesRes.data as HrRole[]) || []);
    setServices((svcRes.data as Service[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (act: RoleActivity) => {
    setUpdating(act.id);
    await supabase.from('role_activities').update({ is_active: !act.is_active }).eq('id', act.id);
    setUpdating(null);
    load();
  };

  const deleteActivity = async (act: RoleActivity) => {
    setUpdating(act.id);
    await supabase.from('role_activities').delete().eq('id', act.id);
    setUpdating(null);
    load();
  };

  const filtered = activities.filter((a) => {
    if (filterScope === 'global' && (a.role_id || a.service_id)) return false;
    if (filterScope === 'division' && (!a.service_id || a.role_id)) return false;
    if (filterScope === 'role' && !a.role_id) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.activity_label.toLowerCase().includes(q) ||
             a.activity_key.toLowerCase().includes(q) ||
             (a.activity_description || '').toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: activities.length,
    active: activities.filter(a => a.is_active).length,
    global: activities.filter(a => !a.role_id && !a.service_id).length,
    division: activities.filter(a => a.service_id && !a.role_id).length,
    role: activities.filter(a => a.role_id).length,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activities Management"
        description="Assign activities, pages, and tasks to roles and divisions"
        icon={ClipboardList}
        actions={
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Activity
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} icon={ClipboardList} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Active" value={stats.active} icon={Power} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Division-scoped" value={stats.division} icon={Building2} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Role-scoped" value={stats.role} icon={Briefcase} color="text-violet-600" accent="bg-violet-50" />
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activities…"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'global', 'division', 'role'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterScope(s)}
              className={`px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors capitalize ${
                filterScope === s
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No activities found"
          description="Add activities to assign pages and tasks to roles or divisions."
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map((act) => {
              const scopeRole = roles.find(r => r.id === act.role_id);
              const scopeService = services.find(s => s.id === act.service_id);
              const scopeLabel = scopeRole?.name || scopeService?.name || 'Global';
              const ScopeIcon = act.role_id ? Briefcase : act.service_id ? Building2 : Globe;
              return (
                <div key={act.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    act.activity_type === 'page' ? 'bg-blue-50' :
                    act.activity_type === 'action' ? 'bg-emerald-50' : 'bg-amber-50'
                  }`}>
                    <ClipboardList className={`w-5 h-5 ${
                      act.activity_type === 'page' ? 'text-blue-500' :
                      act.activity_type === 'action' ? 'text-emerald-500' : 'text-amber-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800 text-sm">{act.activity_label}</p>
                      {!act.is_active && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold text-red-600 bg-red-50 rounded">DISABLED</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{act.activity_key}</span>
                      <span className="text-slate-300">·</span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <ScopeIcon className="w-3 h-3" /> {scopeLabel}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-400 capitalize">{act.activity_type}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleActive(act)}
                    disabled={updating === act.id}
                    className={`p-2 rounded-lg transition-colors ${
                      act.is_active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {updating === act.id ? <Loader2 className="w-4 h-4 animate-spin" /> :
                      act.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => deleteActivity(act)}
                    disabled={updating === act.id}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAdd && <AddActivityModal roles={roles} services={services} onClose={() => setShowAdd(false)} onSaved={load} />}
    </div>
  );
}

function AddActivityModal({
  roles, services, onClose, onSaved,
}: {
  roles: HrRole[];
  services: Service[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<'global' | 'division' | 'role'>('global');
  const [roleId, setRoleId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'page' | 'action' | 'report'>('page');
  const [order, setOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!key.trim() || !label.trim()) {
      setError('Activity key and label are required');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload: Record<string, unknown> = {
      activity_key: key.trim().toLowerCase().replace(/\s+/g, '-'),
      activity_label: label.trim(),
      activity_description: description.trim() || null,
      activity_type: type,
      display_order: order,
      is_active: true,
    };
    if (scope === 'role') payload.role_id = roleId;
    if (scope === 'division') payload.service_id = serviceId;

    const { error: upsertErr } = await supabase.from('role_activities').upsert(payload, {
      onConflict: 'role_id,activity_key',
    });
    setSaving(false);
    if (upsertErr) {
      setError(upsertErr.message);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Add Activity</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        {/* Scope selector */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scope</label>
          <div className="flex gap-1.5 mt-1.5">
            {(['global', 'division', 'role'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border capitalize transition-colors ${
                  scope === s
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {s === 'global' ? <Globe className="w-3.5 h-3.5 inline mr-1" /> :
                 s === 'division' ? <Building2 className="w-3.5 h-3.5 inline mr-1" /> :
                 <Briefcase className="w-3.5 h-3.5 inline mr-1" />}
                {s}
              </button>
            ))}
          </div>
        </div>

        {scope === 'division' && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Division</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Select division…</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {scope === 'role' && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Select role…</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Key</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. my-schedule"
              className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. My Schedule"
              className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order</label>
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
              className="w-full mt-1.5 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Activity'}
        </button>
      </div>
    </div>
  );
}
