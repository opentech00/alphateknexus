import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote, Users, ShieldCheck, GitBranch, Filter, XCircle, FileText,
  Loader2, Landmark, UserPlus, UserMinus, Search, X, Shield, Check, Smartphone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { getDivisionConfig } from '../../components/division/divisionConfigs';
import { StatCard } from '../../admin/components/ui';
import { FinanceApprovalsPanel } from '../../components/FinanceApprovalsPanel';
import { HeadDelegateForm, type TeamMember } from './ManageDivisionPage';
import {
  ADMIN_FINANCE_ACCESS_KEYS,
  ADMIN_FINANCE_ACCESS_META,
  INTERNAL_DEPARTMENT_SLUG,
  orgRoleLabel,
  templateKeysForRoleName,
  type AdminFinanceAccessKey,
} from '../../lib/capabilities';
import { useFinancePrivacy } from '../../contexts/FinancePrivacyContext';
import { financePageForSlug } from '../../lib/financeServices';

type Tab = 'ledgers' | 'team' | 'approvals' | 'tasks';
type ModeFilter = 'all' | 'hire' | 'quote';

interface LedgerRow {
  id: string;
  entry_date: string;
  kind: string;
  category: string;
  amount_sle: number;
  description: string | null;
  reference: string | null;
  settlement: string;
  request_type: 'quote' | 'hire' | null;
  channel: string | null;
  source: string;
  created_at: string;
  service_name: string;
  service_slug: string;
}

interface TeammateHit {
  id: string;
  full_name: string;
  employee_number: string;
  email: string;
  photo_url: string | null;
  current_division: string | null;
}

const SETTLEMENTS = ['pending', 'collected', 'recorded', 'void', 'refunded'] as const;

const settlementMeta: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  collected: { label: 'Collected', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  recorded: { label: 'Recorded', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  void: { label: 'Void', cls: 'bg-slate-100 text-slate-400 border-slate-200' },
  refunded: { label: 'Refunded', cls: 'bg-red-50 text-red-700 border-red-200' },
};

export function AdminFinanceDivisionWorkspace({
  onNavigate,
}: {
  onNavigate?: (page: string) => void;
}) {
  const { employee } = useAuth();
  const [tab, setTab] = useState<Tab>('ledgers');
  const config = getDivisionConfig(INTERNAL_DEPARTMENT_SLUG, 'Admin & Finance');
  const DivIcon = config.icon;

  if (!employee?.service_id) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <p className="font-semibold text-slate-900">No division assigned</p>
        <p className="text-sm text-slate-500 mt-1">Ask HR to place you in Admin & Finance before using this workspace.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 ${config.accentLight} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <DivIcon className={`w-6 h-6 ${config.accentText}`} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Division workspace</h1>
          <p className="mt-0.5 text-slate-500 text-sm">
            {config.name} — ledgers, access, team, approvals, and tasks for your department only.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {([
          { key: 'ledgers' as Tab, label: 'Ledgers', icon: Banknote },
          { key: 'team' as Tab, label: 'Team', icon: Users },
          { key: 'approvals' as Tab, label: 'Approvals', icon: ShieldCheck },
          { key: 'tasks' as Tab, label: 'Tasks', icon: GitBranch },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === t.key ? `${config.accentColor} text-white` : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'ledgers' && <FinanceLedgersTab accent={config.accentColor} onNavigate={onNavigate} />}
      {tab === 'team' && <FinanceTeamTab />}
      {tab === 'approvals' && <FinanceApprovalsPanel scope="all" allowCreate />}
      {tab === 'tasks' && <FinanceTasksTab serviceId={employee.service_id} />}
    </div>
  );
}

function FinanceLedgersTab({
  accent,
  onNavigate,
}: {
  accent: string;
  onNavigate?: (page: string) => void;
}) {
  const { money } = useFinancePrivacy();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ModeFilter>('all');
  const [status, setStatus] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('service_finance_entries')
      .select('id, entry_date, kind, category, amount_sle, description, reference, settlement, request_type, channel, source, created_at, services(name, slug)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) {
      setError(err.message);
      setRows([]);
      setLoading(false);
      return;
    }
    const mapped: LedgerRow[] = ((data || []) as Array<Record<string, unknown>>).map((row) => {
      const svc = row.services as { name?: string; slug?: string } | { name?: string; slug?: string }[] | null;
      const service = Array.isArray(svc) ? svc[0] : svc;
      return {
        id: String(row.id),
        entry_date: String(row.entry_date || ''),
        kind: String(row.kind || ''),
        category: String(row.category || ''),
        amount_sle: Number(row.amount_sle) || 0,
        description: (row.description as string | null) || null,
        reference: (row.reference as string | null) || null,
        settlement: String(row.settlement || 'recorded'),
        request_type: (row.request_type as 'quote' | 'hire' | null) || null,
        channel: (row.channel as string | null) || null,
        source: String(row.source || 'manual'),
        created_at: String(row.created_at || ''),
        service_name: service?.name || 'Company',
        service_slug: service?.slug || '',
      };
    });
    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter((row) => {
    if (mode === 'hire' && row.request_type !== 'hire') return false;
    if (mode === 'quote' && row.request_type !== 'quote') return false;
    if (status !== 'all' && row.settlement !== status) return false;
    return true;
  }), [rows, mode, status]);

  const stats = useMemo(() => ({
    total: visible.length,
    pending: visible.filter((r) => r.settlement === 'pending').length,
    collected: visible.filter((r) => r.settlement === 'collected').length,
    recorded: visible.filter((r) => r.settlement === 'recorded').length,
    quotes: visible.filter((r) => r.request_type === 'quote').length,
    divisions: new Set(visible.map((r) => r.service_slug || r.service_name)).size,
  }), [visible]);

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} icon={Landmark} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Pending" value={stats.pending} icon={Banknote} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Collected" value={stats.collected} icon={Banknote} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Recorded" value={stats.recorded} icon={FileText} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Quotes" value={stats.quotes} icon={FileText} color="text-indigo-600" accent="bg-indigo-50" />
        <StatCard label="Divisions" value={stats.divisions} icon={Users} color="text-slate-600" accent="bg-slate-50" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        {(['all', 'hire', 'quote'] as ModeFilter[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === m ? `${accent} text-white` : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {m === 'all' ? 'All' : m === 'hire' ? 'Hire' : 'Quotes'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
        {['all', ...SETTLEMENTS].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              status === s ? `${accent} text-white` : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {s === 'all' ? 'All Status' : settlementMeta[s]?.label || s}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 text-slate-400 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
            <XCircle className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No requests found</h3>
          <p className="text-sm text-slate-400 mt-2">
            {status !== 'all' || mode !== 'all' ? 'Try adjusting filters.' : 'No Admin & Finance ledger requests yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((row) => {
            const meta = settlementMeta[row.settlement] || settlementMeta.recorded;
            return (
              <div key={row.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {row.description || row.reference || row.category}
                      </h3>
                      <span className="text-sm text-slate-500 truncate">— {row.service_name}</span>
                      <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${meta.cls}`}>
                        {meta.label}
                      </span>
                      {row.request_type === 'quote' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <FileText className="w-3 h-3" /> Quote
                        </span>
                      )}
                      {row.request_type === 'hire' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                          <Banknote className="w-3 h-3" /> Hire
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {money(row.amount_sle)}
                      {row.channel ? ` · ${row.channel}` : ''}
                      {row.entry_date ? ` · ${new Date(`${row.entry_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                    </p>
                  </div>
                  {onNavigate && row.service_slug && (
                    <button
                      type="button"
                      onClick={() => onNavigate(financePageForSlug(row.service_slug))}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
                    >
                      Open ledger
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type PeopleTab = 'access' | 'team';

const FINANCE_ACCESS_KEY_SET = new Set<string>(ADMIN_FINANCE_ACCESS_KEYS);

function FinanceTeamTab() {
  const { employee, refreshEmployee } = useAuth();
  const [peopleTab, setPeopleTab] = useState<PeopleTab>('access');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.rpc('list_division_staff');
    if (err) {
      setError(err.message);
      setTeam([]);
    } else {
      setTeam((data as TeamMember[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const staff = team.filter((m) => m.id !== employee?.id);
  const grantable = staff.filter((m) => m.org_role !== 'division_head' && m.org_role !== 'super_admin');
  const selected = grantable.find((m) => m.id === selectedId) || null;

  const toggleCap = async (member: TeamMember, key: AdminFinanceAccessKey, enabled: boolean) => {
    setSaving(true);
    setError('');
    const rpc = enabled ? 'grant_division_capabilities' : 'revoke_division_capabilities';
    const { error: rpcErr } = await supabase.rpc(rpc, { target_employee_id: member.id, p_keys: [key] });
    if (rpcErr) setError(rpcErr.message);
    await load();
    await refreshEmployee();
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

  const applyTemplate = async (member: TeamMember) => {
    setSaving(true);
    setError('');
    const keys = templateKeysForRoleName(member.hr_role_name).filter((k) => FINANCE_ACCESS_KEY_SET.has(k));
    const current = new Set(member.capability_keys);
    const toGrant = keys.filter((k) => !current.has(k));
    const toRevoke = ADMIN_FINANCE_ACCESS_KEYS.filter((k) => current.has(k) && !keys.includes(k));
    if (toGrant.length) {
      const { error: gErr } = await supabase.rpc('grant_division_capabilities', { target_employee_id: member.id, p_keys: toGrant });
      if (gErr) { setError(gErr.message); setSaving(false); return; }
    }
    if (toRevoke.length) {
      const { error: rErr } = await supabase.rpc('revoke_division_capabilities', { target_employee_id: member.id, p_keys: toRevoke });
      if (rErr) { setError(rErr.message); setSaving(false); return; }
    }
    const appType = keys.some((k) => k.startsWith('field.')) ? 'field' : 'employee';
    const { error: appErr } = await supabase.rpc('set_staff_app_access', {
      target_employee_id: member.id,
      p_app_type: appType,
      p_is_active: true,
    });
    if (appErr) { setError(appErr.message); setSaving(false); return; }
    if (member.role_id) {
      const { error: roleErr } = await supabase.rpc('apply_hr_role_template', {
        target_employee_id: member.id,
        p_role_id: member.role_id,
      });
      if (roleErr) setError(roleErr.message);
    }
    await load();
    setSaving(false);
  };

  const remove = async (member: TeamMember) => {
    if (!confirm(`Remove ${member.full_name} from Admin & Finance? They keep their login. HR can place them again later.`)) return;
    setSaving(true);
    setError('');
    const { error: rpcErr } = await supabase.rpc('hod_remove_admin_finance_teammate', { target_employee_id: member.id });
    if (rpcErr) setError(rpcErr.message);
    if (selectedId === member.id) setSelectedId(null);
    await load();
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {([
          { key: 'access' as PeopleTab, label: 'Access', icon: Shield },
          { key: 'team' as PeopleTab, label: 'Team', icon: Users },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setPeopleTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              peopleTab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {peopleTab === 'access' && (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {grantable.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`w-full text-left bg-white border rounded-2xl p-3 transition-colors ${
                  selectedId === m.id ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-sm text-slate-900 truncate">{m.full_name}</p>
                <p className="text-xs text-slate-400">
                  {m.hr_role_name || 'No job title'} · {m.capability_keys.filter((k) => FINANCE_ACCESS_KEY_SET.has(k)).length} permissions
                </p>
              </button>
            ))}
            {grantable.length === 0 && (
              <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6">
                No staff to grant access to. Add a teammate first.
              </p>
            )}
          </div>
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5">
            {!selected ? (
              <p className="text-sm text-slate-500">Select a teammate to set their app and permissions from their Admin & Finance role.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{selected.full_name}</h3>
                    <p className="text-xs text-slate-400">{selected.hr_role_name || 'No job title'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void applyTemplate(selected)}
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
                    onChange={(ev) => void setApp(selected, ev.target.value as 'employee' | 'field')}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white"
                  >
                    <option value="employee">Employee portal</option>
                    <option value="field">Field app</option>
                  </select>
                </div>

                {(['employee', 'field'] as const).map((group) => (
                  <div key={group} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {group === 'employee' ? 'Employee portal' : 'Field app'}
                    </p>
                    {ADMIN_FINANCE_ACCESS_KEYS.filter((key) => ADMIN_FINANCE_ACCESS_META[key].group === group).map((key) => {
                      const meta = ADMIN_FINANCE_ACCESS_META[key];
                      const on = selected.capability_keys.includes(key);
                      return (
                        <label key={key} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={saving}
                            onChange={(ev) => void toggleCap(selected, key, ev.target.checked)}
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
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {peopleTab === 'team' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800"
            >
              <UserPlus className="w-4 h-4" /> Add teammate
            </button>
          </div>
          {staff.length === 0 ? (
            <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6">
              No other staff in Admin & Finance yet. Add someone HR has already created an account for.
            </p>
          ) : staff.map((m) => (
            <div key={m.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
              {m.photo_url ? (
                <img src={m.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-sm font-semibold text-emerald-700">
                  {m.full_name[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 text-sm truncate">{m.full_name}</p>
                <p className="text-xs text-slate-400 truncate">
                  {m.employee_number} · {m.hr_role_name || 'No job title'} · {orgRoleLabel(m.org_role)}
                </p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                {m.app_type}
              </span>
              {m.org_role !== 'division_head' && m.org_role !== 'super_admin' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void remove(m)}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                  title="Remove from department"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddFinanceTeammateModal
          onClose={() => setAddOpen(false)}
          onAttached={() => { setAddOpen(false); void load(); }}
        />
      )}
    </div>
  );
}

function AddFinanceTeammateModal({
  onClose,
  onAttached,
}: {
  onClose: () => void;
  onAttached: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<TeammateHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [error, setError] = useState('');

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.rpc('hod_search_admin_finance_teammates', { p_query: q });
    if (err) setError(err.message);
    else setHits((data as TeammateHit[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void search(''); }, [search]);

  useEffect(() => {
    const t = window.setTimeout(() => { void search(query); }, 250);
    return () => window.clearTimeout(t);
  }, [query, search]);

  const attach = async (id: string) => {
    setAttaching(id);
    setError('');
    const { error: err } = await supabase.rpc('hod_add_admin_finance_teammate', { target_employee_id: id });
    if (err) {
      setError(err.message);
      setAttaching(null);
      return;
    }
    onAttached();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900">Add teammate</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Search people HR has already given a login. They join Admin & Finance only. You cannot create accounts here.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, email, or employee number"
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>
        </div>
        {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : hits.length === 0 ? (
            <p className="text-sm text-slate-500 p-4">No matching staff with a login waiting to join Admin & Finance.</p>
          ) : hits.map((h) => (
            <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
              {h.photo_url ? (
                <img src={h.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-sm font-semibold text-slate-600">
                  {h.full_name[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{h.full_name}</p>
                <p className="text-xs text-slate-400 truncate">{h.employee_number} · {h.email} · Unassigned</p>
              </div>
              <button
                type="button"
                disabled={attaching === h.id}
                onClick={() => void attach(h.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {attaching === h.id ? 'Adding…' : 'Attach'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FinanceTasksTab({ serviceId }: { serviceId: string }) {
  const [team, setTeam] = useState<TeamMember[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, full_name, employee_number, email, phone, role_id, org_role, status, user_id, photo_url, hr_roles(name)')
        .eq('service_id', serviceId)
        .order('full_name');
      const mapped: TeamMember[] = ((data || []) as Array<Record<string, unknown>>).map((row) => {
        const role = row.hr_roles as { name?: string } | { name?: string }[] | null;
        const roleRow = Array.isArray(role) ? role[0] : role;
        return {
          id: String(row.id),
          full_name: String(row.full_name || ''),
          employee_number: String(row.employee_number || ''),
          email: String(row.email || ''),
          phone: (row.phone as string | null) || null,
          role_id: (row.role_id as string | null) || null,
          org_role: String(row.org_role || 'staff'),
          status: String(row.status || ''),
          user_id: (row.user_id as string | null) || null,
          photo_url: (row.photo_url as string | null) || null,
          hr_role_name: roleRow?.name || null,
          app_type: 'employee',
          app_active: true,
          capability_keys: [],
        };
      });
      setTeam(mapped);
    })();
  }, [serviceId]);

  return <HeadDelegateForm team={team} serviceId={serviceId} />;
}
