import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, Search, RefreshCw, X, Mail, Phone, Building2,
  Briefcase, AlertCircle, CheckCircle2, UserPlus, KeyRound,
  ImagePlus, Upload, RefreshCcw, Eye, EyeOff, Pencil, Trash2,
  AlertTriangle, Loader2, Calendar, FileText, MapPin, Contact,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import { type Employee, type HrRole, type Service, DIVISIONS, STATUS_META, fmtDate } from '../hr/types';

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1e293b] focus:border-[#1e293b] outline-none transition-colors bg-white placeholder-slate-400';
const sectionCls = 'border border-slate-200 rounded-xl bg-slate-50 p-5';
const sectionLabelCls = 'text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-4 block';
const fieldLabelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

function generatePassword(len = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join('');
}

export function HrEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<HrRole[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [viewEmp, setViewEmp] = useState<Employee | null>(null);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [deleteEmp, setDeleteEmp] = useState<Employee | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const [{ data: empData, error: empErr }, { data: roleData }, { data: svcData }] = await Promise.all([
      supabase.from('employees').select('*, services(id,name,slug), hr_roles(id,name)').order('created_at', { ascending: false }),
      supabase.from('hr_roles').select('*, services(id,name,slug)').order('name'),
      supabase.from('services').select('id,name,slug').order('name'),
    ]);
    if (empErr) setError(empErr.message);
    else setEmployees(empData as Employee[]);
    setRoles(roleData as HrRole[]);
    setServices(svcData as Service[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    onLeave: employees.filter(e => e.status === 'on_leave').length,
    withLogin: employees.filter(e => e.user_id !== null).length,
  }), [employees]);

  const filtered = useMemo(() => {
    let r = employees;
    if (statusFilter !== 'all') r = r.filter(e => e.status === statusFilter);
    if (divisionFilter !== 'all') r = r.filter(e => e.services?.slug === divisionFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(e =>
        e.full_name.toLowerCase().includes(s) ||
        e.email.toLowerCase().includes(s) ||
        e.employee_number.toLowerCase().includes(s) ||
        (e.phone || '').toLowerCase().includes(s),
      );
    }
    return r;
  }, [employees, statusFilter, divisionFilter, search]);

  const updateStatus = async (id: string, status: string) => {
    const emp = employees.find(e => e.id === id);
    const prev = emp?.status || 'active';
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, status: status as Employee['status'] } : e));
    await supabase.from('employees').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (prev !== status) {
      await supabase.from('employee_activity_logs').insert({
        employee_id: id,
        action: 'status_changed',
        description: `Status changed from "${prev}" to "${status}"`,
        metadata: { from: prev, to: status },
      });
    }
  };

  const assignRole = async (employeeId: string, roleId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    const prevRoleId = emp?.role_id || null;
    const prevRoleName = emp?.hr_roles?.name || 'None';
    const newRole = roles.find(r => r.id === roleId);
    const newRoleName = newRole?.name || 'None';
    setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, role_id: roleId || null, hr_roles: newRole || null } : e));
    await supabase.from('employees').update({ role_id: roleId || null, updated_at: new Date().toISOString() }).eq('id', employeeId);
    await supabase.from('employee_activity_logs').insert({
      employee_id: employeeId,
      action: 'role_assigned',
      description: `Role assigned: ${prevRoleName} → ${newRoleName}`,
      metadata: { from_role: prevRoleId, to_role: roleId, from_name: prevRoleName, to_name: newRoleName },
    });
  };

  const unassignRole = async (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    const prevRoleName = emp?.hr_roles?.name || 'None';
    setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, role_id: null, hr_roles: null } : e));
    await supabase.from('employees').update({ role_id: null, updated_at: new Date().toISOString() }).eq('id', employeeId);
    await supabase.from('employee_activity_logs').insert({
      employee_id: employeeId,
      action: 'role_unassigned',
      description: `Role unassigned: ${prevRoleName}`,
      metadata: { from_name: prevRoleName },
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employees"
        description="Manage staff records, roles, and portal access"
        icon={Users}
        actions={
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Add Employee
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Staff" value={stats.total} icon={Users} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Active" value={stats.active} icon={CheckCircle2} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="On Leave" value={stats.onLeave} icon={AlertCircle} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="With Portal Login" value={stats.withLogin} icon={KeyRound} color="text-blue-600" accent="bg-blue-50" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, employee no…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <select value={divisionFilter} onChange={e => setDivisionFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none">
            <option value="all">All Divisions</option>
            {DIVISIONS.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="on_leave">On Leave</option>
            <option value="inactive">Inactive</option>
          </select>
          <button onClick={load} className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No employees found" description="Add your first employee to get started." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(e => {
            const sm = STATUS_META[e.status] ?? STATUS_META.active;
            return (
              <div key={e.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start gap-3 mb-3">
                  {e.photo_url ? (
                    <img src={e.photo_url} className="w-11 h-11 rounded-full object-cover flex-shrink-0" alt={e.full_name} />
                  ) : (
                    <div className="w-11 h-11 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-emerald-700 font-semibold">{e.full_name[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">{e.full_name}</h3>
                      {e.user_id && <KeyRound className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-400">{e.employee_number}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${sm.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                    {sm.label}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm text-slate-600 mb-3">
                  <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-slate-400" /> {e.email}</p>
                  {e.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" /> {e.phone}</p>}
                  <p className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-slate-400" /> {e.services?.name || 'Unassigned'}</p>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <select
                      value={e.role_id || ''} onChange={ev => ev.target.value ? assignRole(e.id, ev.target.value) : unassignRole(e.id)}
                      className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none flex-1 min-w-0"
                    >
                      <option value="">No role</option>
                      <optgroup label={e.services ? e.services.name : 'General'}>
                        {roles
                          .filter(r => !r.service_id || r.service_id === e.service_id)
                          .map(r => (
                            <option key={r.id} value={r.id}>
                              {r.name}{r.is_default ? ' (default)' : ''}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2.5">
                  <span>Hired: {fmtDate(e.hire_date)}</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={e.status} onChange={ev => updateStatus(e.id, ev.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="on_leave">On Leave</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <button onClick={() => setViewEmp(e)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="View details">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditEmp(e)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteEmp(e)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddEmployeeModal
          roles={roles}
          services={services}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
        />
      )}

      {viewEmp && (
        <ViewEmployeeModal employee={viewEmp} roles={roles} onClose={() => setViewEmp(null)} />
      )}

      {editEmp && (
        <EditEmployeeModal
          employee={editEmp}
          roles={roles}
          services={services}
          onClose={() => setEditEmp(null)}
          onSaved={() => { setEditEmp(null); load(); }}
        />
      )}

      {deleteEmp && (
        <DeleteEmployeeModal
          employee={deleteEmp}
          onClose={() => setDeleteEmp(null)}
          onDeleted={() => { setDeleteEmp(null); load(); }}
        />
      )}
    </div>
  );
}

// ── View Employee Modal ─────────────────────────────────────────────────────

function ViewEmployeeModal({ employee: e, roles, onClose }: {
  employee: Employee;
  roles: HrRole[];
  onClose: () => void;
}) {
  const [activity, setActivity] = useState<any[]>([]);
  const [loadingAct, setLoadingAct] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('employee_activity_logs')
        .select('id, action, description, metadata, created_at')
        .eq('employee_id', e.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setActivity(data || []);
      setLoadingAct(false);
    })();
  }, [e.id]);

  const sm = STATUS_META[e.status] ?? STATUS_META.active;
  const roleName = e.hr_roles?.name || roles.find(r => r.id === e.role_id)?.name || 'None';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]" onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center gap-3.5 px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Eye className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">Employee Details</h2>
            <p className="text-sm text-slate-500 mt-0.5">Full profile and recent activity</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Profile header */}
          <div className="flex items-center gap-4">
            {e.photo_url ? (
              <img src={e.photo_url} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" alt={e.full_name} />
            ) : (
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-emerald-700">{e.full_name[0]?.toUpperCase()}</span>
              </div>
            )}
            <div>
              <h3 className="text-base font-bold text-slate-900">{e.full_name}</h3>
              <p className="text-xs text-slate-400 font-mono">{e.employee_number}</p>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 mt-1 rounded-full text-xs font-medium border ${sm.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                {sm.label}
              </span>
            </div>
          </div>

          {/* Contact */}
          <div className={sectionCls}>
            <span className={sectionLabelCls}>Contact</span>
            <div className="space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-slate-400" /> {e.email}</p>
              {e.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" /> {e.phone}</p>}
              {(e as any).address && <p className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5" /> {(e as any).address}</p>}
              {(e as any).emergency_contact && <p className="flex items-center gap-2"><Contact className="w-3.5 h-3.5 text-slate-400" /> {(e as any).emergency_contact}</p>}
            </div>
          </div>

          {/* Work */}
          <div className={sectionCls}>
            <span className={sectionLabelCls}>Work</span>
            <div className="space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-slate-400" /> {e.services?.name || 'Unassigned'}</p>
              <p className="flex items-center gap-2"><Briefcase className="w-3.5 h-3.5 text-slate-400" /> {roleName}</p>
              {(e as any).position && <p className="flex items-center gap-2"><Briefcase className="w-3.5 h-3.5 text-slate-400" /> {(e as any).position}</p>}
              {e.hire_date && <p className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-slate-400" /> Hired {fmtDate(e.hire_date)}</p>}
              {(e as any).date_of_birth && <p className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-slate-400" /> DOB {fmtDate((e as any).date_of_birth)}</p>}
            </div>
          </div>

          {/* Portal access */}
          <div className={sectionCls}>
            <span className={sectionLabelCls}>Portal Access</span>
            <div className="flex items-center gap-2 text-sm">
              {e.user_id ? (
                <><KeyRound className="w-3.5 h-3.5 text-blue-500" /><span className="text-slate-600">Has portal login (linked to auth user)</span></>
              ) : (
                <><AlertCircle className="w-3.5 h-3.5 text-slate-400" /><span className="text-slate-400">No portal login</span></>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className={sectionCls}>
            <span className={sectionLabelCls}>Recent Activity</span>
            {loadingAct ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
            ) : activity.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-3">No activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-slate-700 font-medium capitalize">{(a.action || '').replace(/_/g, ' ')}</p>
                      {a.description && <p className="text-xs text-slate-400">{a.description}</p>}
                      <p className="text-xs text-slate-300 mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Employee Modal ────────────────────────────────────────────────────

function EditEmployeeModal({ employee: e, roles, services, onClose, onSaved }: {
  employee: Employee;
  roles: HrRole[];
  services: Service[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(e.full_name);
  const [email, setEmail] = useState(e.email);
  const [phone, setPhone] = useState(e.phone || '');
  const [position, setPosition] = useState((e as any).position || '');
  const [serviceId, setServiceId] = useState(e.service_id || '');
  const [roleId, setRoleId] = useState(e.role_id || '');
  const [hireDate, setHireDate] = useState(e.hire_date || '');
  const [dob, setDob] = useState((e as any).date_of_birth || '');
  const [emergencyContact, setEmergencyContact] = useState((e as any).emergency_contact || '');
  const [address, setAddress] = useState((e as any).address || '');
  const [status, setStatus] = useState(e.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filteredRoles = serviceId
    ? roles.filter(r => !r.service_id || r.service_id === serviceId)
    : roles;

  const handleSave = async () => {
    setError('');
    if (!fullName.trim()) { setError('Full name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    setLoading(true);

    const updates: Record<string, any> = {
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone || null,
      position: position || null,
      service_id: serviceId || null,
      role_id: roleId || null,
      hire_date: hireDate || null,
      date_of_birth: dob || null,
      emergency_contact: emergencyContact || null,
      address: address || null,
      status,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase.from('employees').update(updates).eq('id', e.id);
    if (updateErr) { setError(updateErr.message); setLoading(false); return; }

    await supabase.from('employee_activity_logs').insert({
      employee_id: e.id,
      action: 'profile_updated',
      description: 'Employee profile updated by admin',
      metadata: { fields: Object.keys(updates) },
    });

    setLoading(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[92vh]" onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center gap-3.5 px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Pencil className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">Edit Employee</h2>
            <p className="text-sm text-slate-500 mt-0.5">Update profile, role, and work details</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && <ErrorBanner message={error} />}

          <div className={sectionCls}>
            <span className={sectionLabelCls}>Personal</span>
            <div className="space-y-3">
              <div>
                <label className={fieldLabelCls}>Full Name <span className="text-red-500">*</span></label>
                <input value={fullName} onChange={ev => setFullName(ev.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabelCls}>Email <span className="text-red-500">*</span></label>
                  <input type="email" value={email} onChange={ev => setEmail(ev.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={fieldLabelCls}>Phone</label>
                  <input value={phone} onChange={ev => setPhone(ev.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabelCls}>Date of Birth</label>
                  <input type="date" value={dob} onChange={ev => setDob(ev.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={fieldLabelCls}>Emergency Contact</label>
                  <input value={emergencyContact} onChange={ev => setEmergencyContact(ev.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={fieldLabelCls}>Address</label>
                <textarea value={address} onChange={ev => setAddress(ev.target.value)} rows={2} className={inputCls + ' resize-none'} />
              </div>
            </div>
          </div>

          <div className={sectionCls}>
            <span className={sectionLabelCls}>Work</span>
            <div className="space-y-3">
              <div>
                <label className={fieldLabelCls}>Position</label>
                <input value={position} onChange={ev => setPosition(ev.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabelCls}>Division</label>
                  <select value={serviceId} onChange={ev => { setServiceId(ev.target.value); setRoleId(''); }} className={inputCls}>
                    <option value="">Select division</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fieldLabelCls}>Role</label>
                  <select value={roleId} onChange={ev => setRoleId(ev.target.value)} className={inputCls}>
                    <option value="">Division Staff</option>
                    {filteredRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabelCls}>Hire Date</label>
                  <input type="date" value={hireDate} onChange={ev => setHireDate(ev.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={fieldLabelCls}>Status</label>
                  <select value={status} onChange={ev => setStatus(ev.target.value as Employee['status'])} className={inputCls}>
                    <option value="active">Active</option>
                    <option value="on_leave">On Leave</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] transition-colors disabled:opacity-60">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Employee Modal ───────────────────────────────────────────────────

function DeleteEmployeeModal({ employee: e, onClose, onDeleted }: {
  employee: Employee;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const handleDelete = async () => {
    setError('');
    setLoading(true);

    // If employee has a linked auth user, call admin-delete-user edge function
    if (e.user_id) {
      const { data: { session } } = await supabase.auth.getSession();
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ targetUserId: e.user_id }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Failed to delete user'); setLoading(false); return; }
      } catch (err: any) {
        setError(err.message || 'Network error');
        setLoading(false); return;
      }
    } else {
      // No linked auth user — just delete the employee record + related data
      try {
        if (e.photo_url) {
          const photoPath = e.photo_url.split('/').pop();
          if (photoPath) await supabase.storage.from('employee-photos').remove([photoPath]);
        }
        if ((e as any).resume_url) {
          await supabase.storage.from('employee-resumes').remove([(e as any).resume_url]);
        }
        await supabase.from('employee_activity_logs').delete().eq('employee_id', e.id);
        await supabase.from('employee_id_cards').delete().eq('employee_id', e.id);
        const { error: delErr } = await supabase.from('employees').delete().eq('id', e.id);
        if (delErr) { setError(delErr.message); setLoading(false); return; }
      } catch (err: any) {
        setError(err.message || 'Failed to delete employee');
        setLoading(false); return;
      }
    }

    setLoading(false);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Delete Employee</h2>
            <p className="text-sm text-slate-500">This cannot be undone.</p>
          </div>
        </div>

        <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
          <p className="text-sm text-red-700">
            {e.user_id ? (
              <>This will permanently delete <strong>{e.full_name}</strong>'s employee record, their portal login, ID cards, and all associated data.</>
            ) : (
              <>This will permanently delete <strong>{e.full_name}</strong>'s employee record, ID cards, and activity logs. No portal login is linked.</>
            )}
          </p>
        </div>

        {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Type <span className="font-mono text-red-600">{e.employee_number}</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={ev => setConfirmText(ev.target.value)}
            className={inputCls}
            placeholder={e.employee_number}
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 text-sm">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || confirmText !== e.employee_number}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Employee Modal ─────────────────────────────────────────────────────

function AddEmployeeModal({ roles, services, onClose, onCreated }: {
  roles: HrRole[];
  services: Service[];
  onClose: () => void;
  onCreated: () => void;
}) {
  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Personal
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [address, setAddress] = useState('');

  // Work
  const [position, setPosition] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0]);

  // Resume
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // Credentials
  const [password, setPassword] = useState(() => generatePassword());
  const [showPwd, setShowPwd] = useState(false);

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [employeeNumber, setEmployeeNumber] = useState('');

  const filteredRoles = serviceId
    ? roles.filter(r => !r.service_id || r.service_id === serviceId)
    : roles;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setResumeFile(file);
  };

  const handleSubmit = async () => {
    setError('');
    if (!fullName.trim()) { setError('Full name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!password.trim()) { setError('Temporary password is required.'); return; }
    setLoading(true);

    try {
      // Upload photo if provided
      let photo_url: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop();
        const path = `${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('employee-photos')
          .upload(path, photoFile, { upsert: true });
        if (uploadErr) { setError(`Photo upload failed: ${uploadErr.message}`); setLoading(false); return; }
        const { data: urlData } = supabase.storage.from('employee-photos').getPublicUrl(uploadData.path);
        photo_url = urlData.publicUrl;
      }

      // Upload resume if provided
      let resume_url: string | null = null;
      if (resumeFile) {
        const ext = resumeFile.name.split('.').pop();
        const path = `${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('employee-resumes')
          .upload(path, resumeFile, { upsert: true });
        if (uploadErr) { setError(`Resume upload failed: ${uploadErr.message}`); setLoading(false); return; }
        resume_url = uploadData.path;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-employee-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone: phone || null,
          service_id: serviceId || null,
          role_id: roleId || null,
          position: position || null,
          hire_date: hireDate || null,
          date_of_birth: dob || null,
          emergency_contact: emergencyContact || null,
          address: address || null,
          photo_url,
          resume_url,
          password,
          dashboard_url: window.location.origin + '/employee.html',
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create employee'); setLoading(false); return; }
      setEmailSent(data.email_sent === true);
      setEmployeeNumber(data.employee?.employee_number || '');
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
    setLoading(false);
  };

  // Success screen
  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Employee Created</h2>
            <p className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">{fullName}</span> has been added. Their ID card has been auto-generated.
            </p>
          </div>
          <div className={`w-full border rounded-xl p-4 text-left ${emailSent ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`text-sm font-medium ${emailSent ? 'text-emerald-700' : 'text-amber-700'}`}>
              {emailSent ? 'Welcome email sent with login credentials.' : 'Welcome email could not be sent. Share credentials manually.'}
            </p>
            <p className="text-xs text-slate-500 mb-1">Employee ID (login username)</p>
            <p className="text-sm font-mono font-semibold text-slate-900 tracking-wide">{employeeNumber || '—'}</p>
            <p className="text-xs text-slate-500 mt-2 mb-1">Login email</p>
            <p className="text-sm font-medium text-slate-800">{email}</p>
            <p className="text-xs text-slate-500 mt-2 mb-1">Temporary password</p>
            <p className="text-sm font-mono text-slate-800">{password}</p>
            <p className="text-xs text-amber-600 mt-2">Share securely — not stored after this screen.</p>
          </div>
          <button
            onClick={onCreated}
            className="w-full py-3 bg-[#1e293b] text-white font-semibold rounded-xl hover:bg-[#0f172a] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center gap-3.5 px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">Add Employee</h2>
            <p className="text-sm text-slate-500 mt-0.5">Creates an employee record + login. ID card is auto-generated.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && <ErrorBanner message={error} />}

          {/* PHOTO */}
          <div className={sectionCls}>
            <span className={sectionLabelCls}>Photo</span>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-300">
                {photoPreview
                  ? <img src={photoPreview} className="w-full h-full object-cover" alt="Preview" />
                  : <ImagePlus className="w-7 h-7 text-slate-400" />}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                >
                  <Upload className="w-4 h-4" /> Upload Photo
                </button>
                <p className="text-xs text-slate-400 mt-1.5">JPG / PNG, max 5MB. Used on the ID card.</p>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
            </div>
          </div>

          {/* PERSONAL */}
          <div className={sectionCls}>
            <span className={sectionLabelCls}>Personal</span>
            <div className="space-y-3">
              <div>
                <label className={fieldLabelCls}>Full Name <span className="text-red-500">*</span></label>
                <input
                  value={fullName} onChange={e => setFullName(e.target.value)}
                  className={inputCls} placeholder="John Doe"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabelCls}>Email <span className="text-red-500">*</span></label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className={inputCls} placeholder="john@alphatek.com"
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Phone</label>
                  <input
                    value={phone} onChange={e => setPhone(e.target.value)}
                    className={inputCls} placeholder="+232 ..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabelCls}>Date of Birth</label>
                  <input
                    type="date" value={dob} onChange={e => setDob(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Emergency Contact</label>
                  <input
                    value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)}
                    className={inputCls} placeholder="Name +232 ..."
                  />
                </div>
              </div>
              <div>
                <label className={fieldLabelCls}>Address</label>
                <textarea
                  value={address} onChange={e => setAddress(e.target.value)}
                  rows={3} className={inputCls + ' resize-none'}
                  placeholder="Residential address"
                />
              </div>
            </div>
          </div>

          {/* WORK */}
          <div className={sectionCls}>
            <span className={sectionLabelCls}>Work</span>
            <div className="space-y-3">
              <div>
                <label className={fieldLabelCls}>Position</label>
                <input
                  value={position} onChange={e => setPosition(e.target.value)}
                  className={inputCls} placeholder="Security Guard, Driver, Accountant..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabelCls}>Division <span className="text-red-500">*</span></label>
                  <select
                    value={serviceId} onChange={e => { setServiceId(e.target.value); setRoleId(''); }}
                    className={inputCls}
                  >
                    <option value="">Select division</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fieldLabelCls}>Role <span className="text-red-500">*</span></label>
                  <select
                    value={roleId} onChange={e => setRoleId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Division Staff</option>
                    {filteredRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={fieldLabelCls}>Hire Date</label>
                <input
                  type="date" value={hireDate} onChange={e => setHireDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* RESUME / CV */}
          <div className={sectionCls}>
            <span className={sectionLabelCls}>Resume / CV</span>
            <button
              type="button"
              onClick={() => resumeInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {resumeFile ? resumeFile.name : 'Upload Resume'}
            </button>
            <p className="text-xs text-slate-400 mt-1.5">PDF / DOC / DOCX, max 10MB.</p>
            <input
              ref={resumeInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleResumeChange}
            />
          </div>

          {/* CREDENTIALS */}
          <div className={sectionCls}>
            <span className={sectionLabelCls}>Credentials</span>
            <label className={fieldLabelCls}>
              Temporary Password <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={inputCls + ' pr-10 font-mono'}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors flex-shrink-0"
              >
                <RefreshCcw className="w-4 h-4" /> Generate
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Employee must change this on first login.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-xl hover:bg-[#0f172a] transition-colors disabled:opacity-60"
          >
            {loading ? (
              'Creating…'
            ) : (
              <><UserPlus className="w-4 h-4" /> Review &amp; Create</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
