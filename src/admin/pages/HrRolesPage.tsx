import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase, Plus, X, Search, RefreshCw, Trash2, Edit3,
  Building2, Star, Crown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import { type HrRole, type Service, fmtDate } from '../hr/types';

const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white';

const DIVISION_COLORS: Record<string, string> = {
  'clearing-forwarding': 'from-blue-500 to-blue-600',
  'waste-management':    'from-emerald-500 to-emerald-600',
  'cleaning-janitorial':  'from-cyan-500 to-cyan-600',
  'private-security':    'from-red-500 to-red-600',
  'procurement':          'from-amber-500 to-amber-600',
};

export function HrRolesPage() {
  const [roles, setRoles] = useState<HrRole[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HrRole | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const [{ data: roleData, error: roleErr }, { data: svcData }] = await Promise.all([
      supabase.from('hr_roles').select('*, services(id,name,slug)').order('display_order', { ascending: true }),
      supabase.from('services').select('id,name,slug').order('name'),
    ]);
    if (roleErr) setError(roleErr.message);
    else setRoles(roleData as HrRole[]);
    setServices(svcData as Service[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Group roles by division
  const grouped = useMemo(() => {
    const byDivision: Record<string, HrRole[]> = {};
    const unassigned: HrRole[] = [];

    for (const role of roles) {
      if (!role.service_id) {
        unassigned.push(role);
      } else {
        const key = role.service_id;
        if (!byDivision[key]) byDivision[key] = [];
        byDivision[key].push(role);
      }
    }

    // Sort each group by display_order
    for (const key in byDivision) {
      byDivision[key].sort((a, b) => a.display_order - b.display_order);
    }
    unassigned.sort((a, b) => a.name.localeCompare(b.name));

    return { byDivision, unassigned };
  }, [roles]);

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const s = search.toLowerCase();
    const match = (r: HrRole) =>
      r.name.toLowerCase().includes(s) || (r.description || '').toLowerCase().includes(s);

    const byDivision: Record<string, HrRole[]> = {};
    for (const key in grouped.byDivision) {
      byDivision[key] = grouped.byDivision[key].filter(match);
    }
    return { byDivision, unassigned: grouped.unassigned.filter(match) };
  }, [grouped, search]);

  const stats = useMemo(() => ({
    total: roles.length,
    active: roles.filter(r => r.is_active).length,
    divisionScoped: roles.filter(r => r.service_id !== null).length,
    defaults: roles.filter(r => r.is_default).length,
  }), [roles]);

  const deleteRole = async (id: string) => {
    if (!confirm('Delete this role? Employees assigned to it will lose the assignment.')) return;
    setRoles(prev => prev.filter(r => r.id !== id));
    await supabase.from('hr_roles').delete().eq('id', id);
  };

  const setDefault = async (roleId: string, serviceId: string) => {
    // Optimistic: clear other defaults in same division, set this one
    setRoles(prev => prev.map(r => {
      if (r.service_id === serviceId && r.id !== roleId) return { ...r, is_default: false };
      if (r.id === roleId) return { ...r, is_default: true };
      return r;
    }));
    await supabase.from('hr_roles').update({ is_default: false }).eq('service_id', serviceId).neq('id', roleId);
    await supabase.from('hr_roles').update({ is_default: true }).eq('id', roleId);
  };

  const divisionName = (serviceId: string) => services.find(s => s.id === serviceId)?.name || 'Unknown';
  const divisionSlug = (serviceId: string) => services.find(s => s.id === serviceId)?.slug || '';
  const divisionEntries = Object.entries(filtered.byDivision).filter(([, rs]) => rs.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roles"
        description="Positions organized by division. Each division has its own role set."
        icon={Briefcase}
        actions={
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Role
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Roles" value={stats.total} icon={Briefcase} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Active" value={stats.active} icon={Briefcase} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Division-Scoped" value={stats.divisionScoped} icon={Building2} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Default Roles" value={stats.defaults} icon={Star} color="text-amber-600" accent="bg-amber-50" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search roles…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <button onClick={load} className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <Spinner /> : (
        <>
          {/* Division sections */}
          {divisionEntries.length === 0 && filtered.unassigned.length === 0 ? (
            <EmptyState icon={Briefcase} title="No roles yet" description="Create roles and assign them to divisions. Each division should have its own set of positions." />
          ) : (
            <div className="space-y-6">
              {divisionEntries.map(([serviceId, divRoles]) => {
                const slug = divisionSlug(serviceId);
                const gradient = DIVISION_COLORS[slug] || 'from-slate-500 to-slate-600';
                return (
                  <div key={serviceId}>
                    {/* Division header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-9 h-9 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <Building2 className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h2 className="font-bold text-slate-900">{divisionName(serviceId)}</h2>
                        <p className="text-xs text-slate-400">{divRoles.length} role{divRoles.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>

                    {/* Role cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-1">
                      {divRoles.map(r => (
                        <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                                <Briefcase className="w-4 h-4 text-slate-600" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-slate-900 flex items-center gap-1.5">
                                  {r.name}
                                  {r.is_default && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                                      <Star className="w-2.5 h-2.5 fill-amber-500" /> Default
                                    </span>
                                  )}
                                </h3>
                                <p className="text-xs text-slate-400">Order #{r.display_order}</p>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${r.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                              {r.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          {r.description && <p className="text-sm text-slate-500 mt-2 mb-3">{r.description}</p>}
                          <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2.5">
                            <span>Created {fmtDate(r.created_at)}</span>
                            <div className="flex gap-1">
                              {!r.is_default && (
                                <button
                                  onClick={() => setDefault(r.id, serviceId)}
                                  title="Set as default role for this division"
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                >
                                  <Crown className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={() => { setEditing(r); setShowModal(true); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteRole(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Unassigned roles */}
              {filtered.unassigned.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 bg-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900">General Roles</h2>
                      <p className="text-xs text-slate-400">Not tied to a specific division</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-1">
                    {filtered.unassigned.map(r => (
                      <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                              <Briefcase className="w-4 h-4 text-slate-600" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-slate-900">{r.name}</h3>
                              <p className="text-xs text-slate-400">All divisions</p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${r.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {r.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {r.description && <p className="text-sm text-slate-500 mt-2 mb-3">{r.description}</p>}
                        <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2.5">
                          <span>Created {fmtDate(r.created_at)}</span>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditing(r); setShowModal(true); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteRole(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showModal && (
        <RoleModal
          role={editing}
          services={services}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function RoleModal({ role, services, onClose, onSaved }: {
  role: HrRole | null;
  services: Service[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [serviceId, setServiceId] = useState(role?.service_id || '');
  const [isActive, setIsActive] = useState(role?.is_active ?? true);
  const [displayOrder, setDisplayOrder] = useState(role?.display_order ?? 1);
  const [isDefault, setIsDefault] = useState(role?.is_default ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('Role name is required.'); return; }
    // General roles (no division) are allowed for cross-division positions like Finance Manager
    setLoading(true);

    const payload = {
      name: name.trim(),
      description: description || null,
      service_id: serviceId || null,
      is_active: isActive,
      display_order: displayOrder,
      is_default: isDefault,
    };

    let err: any = null;
    if (role) {
      const res = await supabase.from('hr_roles').update(payload).eq('id', role.id);
      err = res.error;
    } else {
      const res = await supabase.from('hr_roles').insert(payload);
      err = res.error;
    }

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // If setting as default, clear other defaults in same division
    if (isDefault && serviceId) {
      const clearId = role?.id;
      if (clearId) {
        await supabase.from('hr_roles').update({ is_default: false }).eq('service_id', serviceId).neq('id', clearId);
      } else {
        // For new role, clear all others then set this one
        await supabase.from('hr_roles').update({ is_default: false }).eq('service_id', serviceId);
      }
    }

    onSaved();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-bold text-slate-900">{role ? 'Edit Role' : 'New Role'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {error && <ErrorBanner message={error} />}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role Name <span className="text-red-500">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. Driver, Guard, Sorter" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Division</label>
            <select value={serviceId} onChange={e => setServiceId(e.target.value)} className={inputCls}>
              <option value="">General (All Divisions)</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1">Select a division for division-specific roles, or choose General for cross-division positions like Finance Manager.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} className={inputCls + ' resize-none'} placeholder="What does this role do?" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Display Order</label>
            <input
              type="number" min={1} max={99}
              value={displayOrder}
              onChange={e => setDisplayOrder(parseInt(e.target.value) || 1)}
              className={inputCls}
            />
            <p className="text-xs text-slate-400 mt-1">Controls sort order within the division (1 = first).</p>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm text-slate-700">Active</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500" />
              <span className="text-sm text-slate-700">Default role for division</span>
            </label>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="px-5 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] transition-colors disabled:opacity-60">
            {loading ? 'Saving…' : role ? 'Save Changes' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}
