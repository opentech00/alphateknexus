import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Save, Check, X, Lock, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import { type HrRole } from '../hr/types';
import { GRANTABLE_CAPABILITIES, CAPABILITY_META } from '../../lib/capabilities';

interface RolePermission {
  id: string;
  role_id: string;
  page_key: string;
  can_access: boolean;
}

const MANAGED_PAGES = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'bookings', label: 'All Bookings' },
  { key: 'documents', label: 'Documents' },
  { key: 'clients', label: 'Clients' },
  { key: 'divisions', label: 'All Divisions' },
  { key: 'division-cf', label: 'Clearing & Forwarding' },
  { key: 'division-smart-sort', label: 'Smart Sort' },
  { key: 'division-cleaning', label: 'Cleaning Services' },
  { key: 'division-security', label: 'Private Security' },
  { key: 'division-procurement', label: 'Procurement' },
  { key: 'booking-review', label: 'Booking Review' },
  { key: 'messages', label: 'Messages' },
  { key: 'users', label: 'User Management' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'bundles', label: 'Bundles' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'field-dispatch', label: 'Field Dispatch' },
  { key: 'field-job-review', label: 'Field Job Review' },
  { key: 'field-incidents', label: 'Field Incidents' },
  { key: 'wallet', label: 'Wallet & Payments' },
  { key: 'finance', label: 'Finance Module' },
  { key: 'task-delegation', label: 'Task Delegation' },
  { key: 'backup', label: 'Data Backup' },
  { key: 'admin-sessions', label: 'Admin Sessions' },
  { key: 'notification-log', label: 'Notification Log' },
  { key: 'settings', label: 'Settings' },
  { key: 'hr-dashboard', label: 'HR Dashboard' },
  { key: 'hr-employees', label: 'Employees' },
  { key: 'hr-roles', label: 'Roles' },
  { key: 'hr-id-cards', label: 'ID Cards' },
  { key: 'hr-activity', label: 'Activity Logs' },
  { key: 'hr-directory', label: 'Staff Directory' },
  { key: 'hr-permissions', label: 'Permissions' },
];

export function HrPermissionsPage() {
  const [roles, setRoles] = useState<HrRole[]>([]);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    const [rolesRes, permsRes] = await Promise.all([
      supabase.from('hr_roles').select('*').order('name'),
      supabase.from('hr_role_permissions').select('*'),
    ]);
    if (rolesRes.error) setError(rolesRes.error.message);
    else setRoles((rolesRes.data as HrRole[]) || []);
    const perms = (permsRes.data as RolePermission[]) || [];
    setPermissions(perms);
    const draftMap: Record<string, boolean> = {};
    perms.forEach(p => { draftMap[`${p.role_id}:${p.page_key}`] = p.can_access; });
    setDraft(draftMap);
    setDirty(false);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = (roleId: string, pageKey: string) => {
    const key = `${roleId}:${pageKey}`;
    const current = draft[key] ?? false;
    setDraft(prev => ({ ...prev, [key]: !current }));
    setDirty(true);
  };

  const setAll = (roleId: string, value: boolean) => {
    const newDraft = { ...draft };
    MANAGED_PAGES.forEach(p => { newDraft[`${roleId}:${p.key}`] = value; });
    setDraft(newDraft);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const upserts: { role_id: string; page_key: string; can_access: boolean }[] = [];
      const existingKeys = new Set(permissions.map(p => `${p.role_id}:${p.page_key}`));

      for (const [key, can_access] of Object.entries(draft)) {
        const [role_id, page_key] = key.split(':');
        if (existingKeys.has(key)) {
          const existing = permissions.find(p => `${p.role_id}:${p.page_key}` === key);
          if (existing && existing.can_access !== can_access) {
            upserts.push({ role_id, page_key, can_access });
          }
        } else {
          if (can_access) {
            upserts.push({ role_id, page_key, can_access: true });
          }
        }
      }

      if (upserts.length > 0) {
        const { error: upsertErr } = await supabase
          .from('hr_role_permissions')
          .upsert(upserts, { onConflict: 'role_id,page_key' });
        if (upsertErr) throw upsertErr;
      }

      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save permissions');
    }
    setSaving(false);
  };

  const stats = useMemo(() => ({
    roles: roles.length,
    pages: MANAGED_PAGES.length,
    granted: Object.values(draft).filter(Boolean).length,
  }), [roles, draft]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Role Permissions"
        description="Control which admin pages each role can access"
        icon={ShieldCheck}
        actions={
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Roles" value={stats.roles} icon={ShieldCheck} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Managed Pages" value={stats.pages} icon={ShieldCheck} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Permissions Granted" value={stats.granted} icon={Check} color="text-emerald-600" accent="bg-emerald-50" />
      </div>

      <DivisionGrantCeilingPanel />

      {error && <ErrorBanner message={error} />}

      <SuggestedPermissionsMatrix />

      {loading ? <Spinner /> : roles.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No roles defined" description="Create roles first on the Roles page, then manage their permissions here." />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 min-w-[180px]">
                    Page
                  </th>
                  {roles.map(r => (
                    <th key={r.id} className="px-3 py-3 text-center min-w-[120px]">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-semibold text-slate-700 truncate max-w-[110px]">{r.name}</span>
                        <div className="flex gap-1">
                          <button onClick={() => setAll(r.id, true)} className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium px-1.5 py-0.5 rounded hover:bg-emerald-50 transition-colors">All</button>
                          <button onClick={() => setAll(r.id, false)} className="text-[10px] text-slate-500 hover:text-slate-700 font-medium px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors">None</button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MANAGED_PAGES.map(page => (
                  <tr key={page.key} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-100">
                      {page.label}
                    </td>
                    {roles.map(r => {
                      const key = `${r.id}:${page.key}`;
                      const checked = draft[key] ?? false;
                      return (
                        <td key={r.id} className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => toggle(r.id, page.key)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                              checked
                                ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                            }`}
                          >
                            {checked ? <Check className="w-4 h-4" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && dirty && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Lock className="w-4 h-4" />
          You have unsaved changes. Click "Save Changes" to apply.
        </div>
      )}
    </div>
  );
}

const PERMISSION_MATRIX: {
  role: string;
  view: boolean;
  approve: boolean;
  assign: boolean;
  manage: boolean;
}[] = [
  { role: 'Super Admin',      view: true,  approve: true,  assign: true,  manage: true  },
  { role: 'HR Admin',         view: true,  approve: true,  assign: true,  manage: false },
  { role: 'Finance Manager',  view: true,  approve: true,  assign: false, manage: false },
  { role: 'Operations Mgr',   view: true,  approve: false, assign: true,  manage: false },
  { role: 'Division Head',    view: true,  approve: false, assign: true,  manage: false },
  { role: 'Field Staff',      view: false, approve: false, assign: false, manage: false },
];

function SuggestedPermissionsMatrix() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Info className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-slate-800">Suggested Permissions Matrix</span>
          <span className="text-xs text-slate-400">Reference guide for assigning roles</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-bold tracking-widest text-slate-500 uppercase">Role</th>
                <th className="px-3 py-3 text-center text-xs font-bold tracking-widest text-slate-500 uppercase">Can View</th>
                <th className="px-3 py-3 text-center text-xs font-bold tracking-widest text-slate-500 uppercase">Can Approve</th>
                <th className="px-3 py-3 text-center text-xs font-bold tracking-widest text-slate-500 uppercase">Can Assign</th>
                <th className="px-5 py-3 text-center text-xs font-bold tracking-widest text-slate-500 uppercase">Can Manage Users</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {PERMISSION_MATRIX.map(row => (
                <tr key={row.role} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-800">{row.role}</td>
                  {[row.view, row.approve, row.assign, row.manage].map((allowed, i) => (
                    <td key={i} className="px-3 py-3 text-center">
                      {allowed ? (
                        <Check className="w-4 h-4 text-emerald-500 inline-block" />
                      ) : (
                        <X className="w-4 h-4 text-slate-300 inline-block" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              This is a suggested reference. Actual permissions are configured per-role in the matrix above.
              Division Heads work in the Employee portal — they never receive Admin dashboard access.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DivisionGrantCeilingPanel() {
  const [services, setServices] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.from('services').select('id,name,slug').order('name').then(({ data }) => {
      const rows = (data || []) as { id: string; name: string; slug: string }[];
      setServices(rows);
      if (rows[0]) setSelected(rows[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    supabase.from('division_grant_ceilings').select('capability_key').eq('service_id', selected)
      .then(({ data }) => setKeys(new Set((data || []).map((r: { capability_key: string }) => r.capability_key))));
  }, [selected]);

  const toggle = (key: string) => {
    setKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    const { error } = await supabase.rpc('set_division_grant_ceiling', {
      p_service_id: selected,
      p_keys: [...keys],
    });
    setMessage(error ? error.message : 'Ceiling saved. Heads can only grant these capabilities.');
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Division Head grant ceiling</h3>
      <p className="text-xs text-slate-500 mb-4">
        Super Admins set which Employee-portal capabilities a Head may hand to staff in that division.
      </p>
      <select value={selected} onChange={e => setSelected(e.target.value)} className="mb-3 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="grid sm:grid-cols-2 gap-2 mb-4">
        {GRANTABLE_CAPABILITIES.map(key => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={keys.has(key)} onChange={() => toggle(key)} className="mt-0.5 rounded border-slate-300 text-emerald-600" />
            <span>
              <span className="font-medium text-slate-800">{CAPABILITY_META[key].label}</span>
              <span className="block text-xs text-slate-400">{CAPABILITY_META[key].desc}</span>
            </span>
          </label>
        ))}
      </div>
      <button onClick={save} disabled={saving || !selected} className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
        {saving ? 'Saving…' : 'Save ceiling'}
      </button>
      {message && <p className="text-xs text-slate-500 mt-2">{message}</p>}
    </div>
  );
}
