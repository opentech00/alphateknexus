import { useEffect, useMemo, useState } from 'react';
import {
  History, Search, RefreshCw, Filter, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import { type ActivityLog, type Employee, ACTION_META } from '../hr/types';

const fmtDateTime = (ts: string) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function HrActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const [logsRes, empRes] = await Promise.all([
      supabase.from('employee_activity_logs')
        .select('*, employees(id,full_name,employee_number,photo_url)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('employees').select('id,full_name,employee_number').order('full_name'),
    ]);
    if (logsRes.error) setError(logsRes.error.message);
    else setLogs(logsRes.data as ActivityLog[]);
    setEmployees(empRes.data as Employee[] || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let result = logs;
    if (filterEmployee) result = result.filter(l => l.employee_id === filterEmployee);
    if (filterAction) result = result.filter(l => l.action === filterAction);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        (l.description || '').toLowerCase().includes(s) ||
        (l.employees?.full_name || '').toLowerCase().includes(s) ||
        (l.employees?.employee_number || '').toLowerCase().includes(s)
      );
    }
    return result;
  }, [logs, search, filterEmployee, filterAction]);

  const stats = useMemo(() => ({
    total: logs.length,
    roleChanges: logs.filter(l => l.action === 'role_assigned' || l.action === 'role_unassigned').length,
    statusChanges: logs.filter(l => l.action === 'status_changed').length,
    logins: logs.filter(l => l.action === 'login').length,
  }), [logs]);

  const actionTypes = [...new Set(logs.map(l => l.action))];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity Logs"
        description="Audit trail of employee role changes, status updates, and logins"
        icon={History}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Events" value={stats.total} icon={History} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Role Changes" value={stats.roleChanges} icon={History} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Status Changes" value={stats.statusChanges} icon={History} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Logins" value={stats.logins} icon={History} color="text-violet-600" accent="bg-violet-50" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by employee or description…"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="flex gap-3">
            <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">All employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_number})</option>)}
            </select>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">All actions</option>
              {actionTypes.map(a => <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>)}
            </select>
            <button onClick={load} className="p-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" description="Role assignments, status changes, and logins will appear here." />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map(log => {
              const meta = ACTION_META[log.action] || { label: log.action, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
              const emp = log.employees;
              return (
                <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-500 flex-shrink-0 overflow-hidden">
                    {emp?.photo_url
                      ? <img src={emp.photo_url} alt={emp?.full_name} className="w-full h-full object-cover" />
                      : (emp?.full_name?.[0]?.toUpperCase() || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 text-sm">{emp?.full_name || 'Unknown'}</span>
                      <span className="text-xs text-slate-400">{emp?.employee_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{log.description || log.action}</p>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {Object.entries(log.metadata).slice(0, 4).map(([k, v]) => (
                          <span key={k} className="text-xs bg-slate-50 text-slate-500 px-2 py-0.5 rounded border border-slate-100">
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">{fmtDateTime(log.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
