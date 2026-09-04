import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Users, Shield, Briefcase, Check, AlertCircle, Smartphone,
  GitBranch, Plus,
} from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { supabase } from '../lib/supabase';
import {
  GRANTABLE_CAPABILITIES, CAPABILITY_META, templateKeysForRoleName, orgRoleLabel,
  type CapabilityKey,
} from '../../lib/capabilities';

interface TeamMember {
  id: string;
  full_name: string;
  employee_number: string;
  email: string;
  phone: string | null;
  role_id: string | null;
  org_role: string;
  status: string;
  user_id: string | null;
  photo_url: string | null;
  hr_role_name: string | null;
  app_type: string;
  app_active: boolean;
  capability_keys: string[];
}

type Tab = 'team' | 'access' | 'tasks';

export function ManageDivisionPage() {
  const { employee, refreshEmployee } = useAuth();
  const [tab, setTab] = useState<Tab>('access');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [ceiling, setCeiling] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [{ data, error: listErr }, { data: ceilData }] = await Promise.all([
      supabase.rpc('list_division_staff'),
      employee?.service_id
        ? supabase.from('division_grant_ceilings').select('capability_key').eq('service_id', employee.service_id)
        : Promise.resolve({ data: [] as { capability_key: string }[] }),
    ]);
    if (listErr) setError(listErr.message);
    else setTeam((data as TeamMember[]) || []);
    setCeiling(new Set((ceilData || []).map((r: { capability_key: string }) => r.capability_key)));
    setLoading(false);
  }, [employee?.service_id]);

  useEffect(() => { load(); }, [load]);

  const grantable = useMemo(
    () => GRANTABLE_CAPABILITIES.filter(k => ceiling.size === 0 || ceiling.has(k)),
    [ceiling],
  );

  const selected = team.find(t => t.id === selectedId) || null;
  const staff = team.filter(t => t.id !== employee?.id);

  const toggleCap = async (member: TeamMember, key: CapabilityKey, enabled: boolean) => {
    setSaving(true);
    setError('');
    const rpc = enabled ? 'grant_division_capabilities' : 'revoke_division_capabilities';
    const { error: rpcErr } = await supabase.rpc(rpc, { target_employee_id: member.id, p_keys: [key] });
    if (rpcErr) setError(rpcErr.message);
    await load();
    await refreshEmployee();
    setSaving(false);
  };

  const applyTemplate = async (member: TeamMember) => {
    setSaving(true);
    setError('');
    const keys = templateKeysForRoleName(member.hr_role_name).filter(k => grantable.includes(k));
    const current = new Set(member.capability_keys);
    const toGrant = keys.filter(k => !current.has(k));
    const toRevoke = GRANTABLE_CAPABILITIES.filter(k => current.has(k) && !keys.includes(k));
    if (toGrant.length) {
      const { error: gErr } = await supabase.rpc('grant_division_capabilities', { target_employee_id: member.id, p_keys: toGrant });
      if (gErr) { setError(gErr.message); setSaving(false); return; }
    }
    if (toRevoke.length) {
      const { error: rErr } = await supabase.rpc('revoke_division_capabilities', { target_employee_id: member.id, p_keys: toRevoke });
      if (rErr) { setError(rErr.message); setSaving(false); return; }
    }
    await load();
    setSaving(false);
  };

  const setApp = async (member: TeamMember, appType: 'employee' | 'field') => {
    setSaving(true);
    setError('');
    const { error: rpcErr } = await supabase.rpc('set_staff_app_access', {
      target_employee_id: member.id,
      p_app_type: appType,
      p_is_active: true,
    });
    if (rpcErr) setError(rpcErr.message);
    await load();
    setSaving(false);
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Manage my division</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Grant {employee?.services?.name || 'your division'} staff only the work they need. Super Admins keep company-wide Admin access.
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {([
          { key: 'access' as Tab, label: 'Access', icon: Shield },
          { key: 'team' as Tab, label: 'Team', icon: Users },
          { key: 'tasks' as Tab, label: 'Tasks', icon: GitBranch },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {tab === 'team' && (
        <div className="space-y-2">
          {staff.length === 0 ? (
            <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6">No other staff in this division yet.</p>
          ) : staff.map(m => (
            <div key={m.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
              {m.photo_url ? (
                <img src={m.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-sm font-semibold text-emerald-700">
                  {m.full_name[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 text-sm truncate">{m.full_name}</p>
                <p className="text-xs text-slate-400">{m.employee_number} · {m.hr_role_name || 'No job title'} · {orgRoleLabel(m.org_role)}</p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                {m.app_type}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'access' && (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {staff.filter(m => m.org_role !== 'division_head').map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`w-full text-left bg-white border rounded-2xl p-3 transition-colors ${
                  selectedId === m.id ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-sm text-slate-900 truncate">{m.full_name}</p>
                <p className="text-xs text-slate-400">{m.hr_role_name || 'No job title'} · {m.capability_keys.length} permissions</p>
              </button>
            ))}
            {staff.filter(m => m.org_role !== 'division_head').length === 0 && (
              <p className="text-sm text-slate-500">No staff to grant access to.</p>
            )}
          </div>
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5">
            {!selected ? (
              <p className="text-sm text-slate-500">Select a staff member to grant or revoke permissions.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{selected.full_name}</h3>
                    <p className="text-xs text-slate-400">{selected.hr_role_name || 'No job title'}</p>
                  </div>
                  <button
                    disabled={saving}
                    onClick={() => applyTemplate(selected)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    Apply {selected.hr_role_name || 'role'} template
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500">App</span>
                  <select
                    value={selected.app_type === 'field' ? 'field' : 'employee'}
                    disabled={saving}
                    onChange={ev => setApp(selected, ev.target.value as 'employee' | 'field')}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white"
                  >
                    <option value="employee">Employee portal</option>
                    <option value="field">Field app</option>
                  </select>
                </div>

                <div className="space-y-2">
                  {grantable.map(key => {
                    const meta = CAPABILITY_META[key];
                    const on = selected.capability_keys.includes(key);
                    return (
                      <label key={key} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={saving || selected.org_role === 'division_head'}
                          onChange={ev => toggleCap(selected, key, ev.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-emerald-600"
                        />
                        <span>
                          <span className="block text-sm font-medium text-slate-800">{meta.label}</span>
                          <span className="block text-xs text-slate-400">{meta.desc}</span>
                        </span>
                        {on && <Check className="w-4 h-4 text-emerald-500 ml-auto mt-0.5" />}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'tasks' && <HeadDelegateForm team={staff} serviceId={employee?.service_id || null} />}
    </div>
  );
}

function HeadDelegateForm({ team, serviceId }: { team: TeamMember[]; serviceId: string | null }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('medium');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const assignable = team.filter(t => t.user_id && t.status === 'active' && t.org_role !== 'super_admin');

  const submit = async () => {
    setError('');
    setMessage('');
    if (!title.trim() || !assignee || !user || !serviceId) {
      setError('Title and assignee are required.');
      return;
    }
    setSaving(true);
    const { error: insErr } = await supabase.from('task_delegations').insert({
      title: title.trim(),
      description: description.trim() || null,
      service_id: serviceId,
      assigned_by: user.id,
      assigned_to: assignee,
      priority,
      due_date: due || null,
      status: 'pending',
    });
    if (insErr) setError(insErr.message);
    else {
      setMessage('Task assigned.');
      setTitle('');
      setDescription('');
      setAssignee('');
    }
    setSaving(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 max-w-xl">
      <div className="flex items-center gap-2 mb-1">
        <Plus className="w-4 h-4 text-slate-500" />
        <h3 className="font-semibold text-slate-900 text-sm">Assign a task</h3>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details (optional)" rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
      <select value={assignee} onChange={e => setAssignee(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
        <option value="">Select staff…</option>
        {assignable.map(m => (
          <option key={m.id} value={m.user_id || ''}>{m.full_name} ({m.employee_number})</option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <select value={priority} onChange={e => setPriority(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <input type="date" value={due} onChange={e => setDue(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
      </div>
      <button
        onClick={submit}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />} Assign
      </button>
    </div>
  );
}
