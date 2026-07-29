import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Smartphone, Monitor, Loader2, Search,
  Power, PowerOff, User, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AppAccessRow {
  id: string;
  employee_id: string;
  app_type: 'employee' | 'field' | 'admin';
  is_active: boolean;
  granted_at: string;
  updated_at: string;
  notes: string | null;
  employees: {
    id: string;
    full_name: string;
    email: string;
    employee_number: string;
    position: string | null;
    photo_url: string | null;
    status: string;
    hr_roles: { name: string } | null;
    services: { name: string } | null;
  };
}

const appTypeMeta: Record<string, { label: string; icon: typeof Monitor; color: string; bg: string; border: string }> = {
  employee: { label: 'Employee Portal', icon: Monitor, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  field:    { label: 'Field Staff App',  icon: Smartphone, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  admin:    { label: 'Admin Panel',      icon: ShieldCheck, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
};

export function AppAccessManagementPage() {
  const [rows, setRows] = useState<AppAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'employee' | 'field' | 'admin'>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchAccess = useCallback(async () => {
    const { data } = await supabase
      .from('app_access')
      .select(`
        id, employee_id, app_type, is_active, granted_at, updated_at, notes,
        employees (
          id, full_name, email, employee_number, position, photo_url, status,
          hr_roles ( name ),
          services ( name )
        )
      `)
      .order('updated_at', { ascending: false });
    setRows((data as unknown as AppAccessRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccess(); }, [fetchAccess]);

  const handleAppTypeChange = async (row: AppAccessRow, newType: 'employee' | 'field' | 'admin') => {
    setUpdating(row.id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('app_access')
      .update({ app_type: newType, granted_by: user?.id })
      .eq('id', row.id);
    setUpdating(null);
    fetchAccess();
  };

  const handleToggleActive = async (row: AppAccessRow) => {
    setUpdating(row.id);
    await supabase
      .from('app_access')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);
    setUpdating(null);
    fetchAccess();
  };

  const filtered = rows.filter((r) => {
    if (filter !== 'all' && r.app_type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.employees?.full_name?.toLowerCase().includes(q) ||
             r.employees?.email?.toLowerCase().includes(q) ||
             r.employees?.employee_number?.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: rows.length,
    employee: rows.filter((r) => r.app_type === 'employee' && r.is_active).length,
    field: rows.filter((r) => r.app_type === 'field' && r.is_active).length,
    admin: rows.filter((r) => r.app_type === 'admin' && r.is_active).length,
    disabled: rows.filter((r) => !r.is_active).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">App Access Management</h1>
        <p className="text-sm text-slate-400 mt-0.5">Control which employees can access the Employee Portal vs Field Staff App</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Monitor className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-slate-400 font-medium">Employee Portal</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.employee}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-slate-400 font-medium">Field Staff</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.field}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-400 font-medium">Admin Panel</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.admin}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <PowerOff className="w-4 h-4 text-red-400" />
            <span className="text-xs text-slate-400 font-medium">Disabled</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.disabled}</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or employee number…"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'employee', 'field', 'admin'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                filter === f
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {f === 'all' ? 'All' : appTypeMeta[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-slate-400">No employees found.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((row) => {
              const meta = appTypeMeta[row.app_type];
              const Icon = meta.icon;
              return (
                <div key={row.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {row.employees?.photo_url ? (
                      <img src={row.employees.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-semibold text-slate-500">
                        {row.employees?.full_name?.[0]?.toUpperCase() || '?'}
                      </span>
                    )}
                  </div>

                  {/* Name + info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800 text-sm truncate">{row.employees?.full_name || 'Unknown'}</p>
                      {!row.is_active && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold text-red-600 bg-red-50 rounded">DISABLED</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {row.employees?.email} · {row.employees?.position || row.employees?.hr_roles?.name || 'No role'}
                    </p>
                  </div>

                  {/* App type selector */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    {(['employee', 'field', 'admin'] as const).map((type) => {
                      const TM = appTypeMeta[type];
                      const TIcon = TM.icon;
                      const isActive = row.app_type === type;
                      return (
                        <button
                          key={type}
                          onClick={() => handleAppTypeChange(row, type)}
                          disabled={updating === row.id}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                            isActive
                              ? `${TM.bg} ${TM.color} ${TM.border}`
                              : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <TIcon className="w-3.5 h-3.5" />
                          {TM.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Mobile: dropdown */}
                  <div className="sm:hidden">
                    <select
                      value={row.app_type}
                      onChange={(e) => handleAppTypeChange(row, e.target.value as any)}
                      disabled={updating === row.id}
                      className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg outline-none"
                    >
                      <option value="employee">Employee Portal</option>
                      <option value="field">Field Staff</option>
                      <option value="admin">Admin Panel</option>
                    </select>
                  </div>

                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggleActive(row)}
                    disabled={updating === row.id}
                    className={`p-2 rounded-lg transition-colors ${
                      row.is_active
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-slate-300 hover:bg-slate-100'
                    }`}
                    title={row.is_active ? 'Disable access' : 'Enable access'}
                  >
                    {updating === row.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : row.is_active ? (
                      <Power className="w-4 h-4" />
                    ) : (
                      <PowerOff className="w-4 h-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subdomain info */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Subdomain Access</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Monitor className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span><code className="text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">employee.alphateknexus.app</code></span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Smartphone className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span><code className="text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">field.alphateknexus.app</code></span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <ShieldCheck className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span><code className="text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">admin.alphateknexus.app</code></span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Employees assigned to the Field Staff App will see the mobile field interface when they log in via the field subdomain. Employees assigned to the Employee Portal will see the standard dashboard.
        </p>
      </div>
    </div>
  );
}
