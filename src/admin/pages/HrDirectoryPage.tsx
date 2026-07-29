import { useEffect, useMemo, useState } from 'react';
import {
  Users, Search, RefreshCw, X, Mail, Phone, Building2,
  Briefcase, MapPin, Calendar, Activity,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import { type Employee, type ActivityLog, STATUS_META, fmtDate, ACTION_META } from '../hr/types';

const fmtDateTime = (ts: string) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function HrDirectoryPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Employee | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('employees')
      .select('*, services(id,name,slug), hr_roles(id,name)')
      .order('full_name');
    if (err) setError(err.message);
    else setEmployees(data as Employee[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const divisions = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(e => { if (e.services) map.set(e.services.slug, e.services.name); });
    return Array.from(map.entries()).map(([slug, name]) => ({ slug, name }));
  }, [employees]);

  const roles = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(e => { if (e.hr_roles) map.set(e.hr_roles.id, e.hr_roles.name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [employees]);

  const filtered = useMemo(() => {
    let r = employees;
    if (divisionFilter !== 'all') r = r.filter(e => e.services?.slug === divisionFilter);
    if (roleFilter !== 'all') r = r.filter(e => e.hr_roles?.id === roleFilter);
    if (statusFilter !== 'all') r = r.filter(e => e.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(e =>
        e.full_name.toLowerCase().includes(s) ||
        e.email.toLowerCase().includes(s) ||
        e.employee_number.toLowerCase().includes(s) ||
        (e.phone || '').toLowerCase().includes(s)
      );
    }
    return r;
  }, [employees, search, divisionFilter, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    onLeave: employees.filter(e => e.status === 'on_leave').length,
    withPhotos: employees.filter(e => e.photo_url).length,
  }), [employees]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff Directory"
        description="Browse and search all employees across divisions"
        icon={Users}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Staff" value={stats.total} icon={Users} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Active" value={stats.active} icon={Users} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="On Leave" value={stats.onLeave} icon={Users} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="With Photo" value={stats.withPhotos} icon={Users} color="text-blue-600" accent="bg-blue-50" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, employee no, phone…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <select value={divisionFilter} onChange={e => setDivisionFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none">
              <option value="all">All Divisions</option>
              {divisions.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
            </select>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none">
              <option value="all">All Roles</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
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
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No employees found" description="Try adjusting your filters." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(e => {
            const sm = STATUS_META[e.status] ?? STATUS_META.active;
            return (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all text-left group"
              >
                <div className="flex flex-col items-center text-center">
                  {e.photo_url ? (
                    <img src={e.photo_url} className="w-16 h-16 rounded-full object-cover border-2 border-slate-100" alt={e.full_name} />
                  ) : (
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border-2 border-emerald-100">
                      <span className="text-xl font-bold text-emerald-700">{e.full_name[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <h3 className="font-semibold text-slate-900 mt-3 truncate w-full">{e.full_name}</h3>
                  <p className="text-xs text-slate-400">{e.employee_number}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sm.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                      {sm.label}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-500 w-full">
                    <p className="flex items-center justify-center gap-1.5"><Briefcase className="w-3 h-3 text-slate-400" /> {e.hr_roles?.name || 'No role'}</p>
                    <p className="flex items-center justify-center gap-1.5"><Building2 className="w-3 h-3 text-slate-400" /> {e.services?.name || 'Unassigned'}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <EmployeeDetailDrawer
          employee={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function EmployeeDetailDrawer({ employee, onClose }: {
  employee: Employee;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const sm = STATUS_META[employee.status] ?? STATUS_META.active;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('employee_activity_logs')
        .select('*')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setLogs((data as ActivityLog[]) || []);
      setLoadingLogs(false);
    })();
  }, [employee.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl animate-[slideInRight_0.25s_ease]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 p-6 text-white">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-slate-300" />
          </button>
          <div className="flex flex-col items-center text-center">
            {employee.photo_url ? (
              <img src={employee.photo_url} className="w-20 h-20 rounded-full object-cover border-2 border-white/20" alt={employee.full_name} />
            ) : (
              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center border-2 border-white/20">
                <span className="text-2xl font-bold text-white">{employee.full_name[0]?.toUpperCase()}</span>
              </div>
            )}
            <h2 className="text-lg font-bold mt-3">{employee.full_name}</h2>
            <p className="text-sm text-slate-400">{employee.employee_number}</p>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border mt-2 ${sm.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
              {sm.label}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3">Contact</h3>
            <div className="space-y-2.5 text-sm">
              <p className="flex items-center gap-2.5 text-slate-700"><Mail className="w-4 h-4 text-slate-400" /> {employee.email}</p>
              {employee.phone && <p className="flex items-center gap-2.5 text-slate-700"><Phone className="w-4 h-4 text-slate-400" /> {employee.phone}</p>}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3">Assignment</h3>
            <div className="space-y-2.5 text-sm">
              <p className="flex items-center gap-2.5 text-slate-700"><Briefcase className="w-4 h-4 text-slate-400" /> {employee.hr_roles?.name || 'No role assigned'}</p>
              <p className="flex items-center gap-2.5 text-slate-700"><Building2 className="w-4 h-4 text-slate-400" /> {employee.services?.name || 'Unassigned'}</p>
              <p className="flex items-center gap-2.5 text-slate-700"><Calendar className="w-4 h-4 text-slate-400" /> Hired {fmtDate(employee.hire_date)}</p>
            </div>
          </div>

          {/* Activity Timeline */}
          <div>
            <h3 className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Recent Activity
            </h3>
            {loadingLogs ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No activity recorded yet.</p>
            ) : (
              <div className="space-y-0">
                {logs.map((log, idx) => {
                  const meta = ACTION_META[log.action] || { label: log.action, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                  return (
                    <div key={log.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5" />
                        {idx < logs.length - 1 && <div className="w-px flex-1 bg-slate-200" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${meta.cls}`}>{meta.label}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{log.description || log.action}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(log.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
