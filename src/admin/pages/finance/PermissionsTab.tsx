import { useEffect, useState, useCallback } from 'react';
import {
  Shield, Search, Loader2, X, CheckCircle2, RefreshCw, Lock, Eye,
  PlusCircle, ArrowDownCircle, Trash2, FileText, TrendingUp, UserCog,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface ProfileMap {
  [userId: string]: { full_name: string | null; email: string | null };
}

interface FinancePermission {
  id: string;
  user_id: string;
  can_view_finance: boolean;
  can_add_transactions: boolean;
  can_approve_withdrawals: boolean;
  can_delete_transactions: boolean;
  can_manage_fx_rates: boolean;
  can_manage_invoices: boolean;
  updated_at: string;
  profile?: { full_name: string | null; email: string | null };
}

const PERMISSIONS = [
  { key: 'can_view_finance', label: 'View Finance', icon: Eye, desc: 'Can view finance tabs and data' },
  { key: 'can_add_transactions', label: 'Add Transactions', icon: PlusCircle, desc: 'Can add wallet transactions and receipts' },
  { key: 'can_approve_withdrawals', label: 'Approve Withdrawals', icon: CheckCircle2, desc: 'Can approve or reject withdrawal requests' },
  { key: 'can_delete_transactions', label: 'Delete Transactions', icon: Trash2, desc: 'Can delete transactions and records' },
  { key: 'can_manage_fx_rates', label: 'Manage FX Rates', icon: TrendingUp, desc: 'Can add and edit exchange rates' },
  { key: 'can_manage_invoices', label: 'Manage Invoices', icon: FileText, desc: 'Can create and edit invoices' },
] as const;

async function loadProfiles(userIds: string[]): Promise<ProfileMap> {
  if (userIds.length === 0) return {};
  const unique = [...new Set(userIds)];
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', unique);
  const map: ProfileMap = {};
  (data || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email }; });
  return map;
}

export function PermissionsTab() {
  const [permissions, setPermissions] = useState<FinancePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('finance_permissions')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) { setLoadError(error.message); setPermissions([]); setLoading(false); return; }
    const rows = (data || []) as any[];
    const profileMap = await loadProfiles(rows.map(r => r.user_id).filter(Boolean));
    const enriched: FinancePermission[] = rows.map(r => ({
      ...r, profile: profileMap[r.user_id] || { full_name: null, email: null },
    }));
    setPermissions(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePermission = async (perm: FinancePermission, key: keyof FinancePermission) => {
    setUpdating(perm.id + key);
    const newValue = !perm[key as keyof FinancePermission];
    const { error } = await supabase
      .from('finance_permissions')
      .update({ [key]: newValue })
      .eq('id', perm.id);
    if (!error) load();
    setUpdating(null);
  };

  const handleDelete = async (perm: FinancePermission) => {
    if (!confirm(`Remove all finance permissions for ${perm.profile?.full_name || perm.profile?.email || 'this user'}?`)) return;
    setUpdating(perm.id + 'delete');
    const { error } = await supabase.from('finance_permissions').delete().eq('id', perm.id);
    if (!error) load();
    setUpdating(null);
  };

  const filtered = permissions.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = p.profile?.full_name || '';
    const email = p.profile?.email || '';
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Role-Based Financial Permissions</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Grant granular finance access to team members. Full admins automatically bypass all restrictions and retain complete access.
            Users without a permission row can only view finance data (default).
          </p>
        </div>
      </div>

      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load permissions: {loadError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors text-sm whitespace-nowrap">
            <UserCog className="w-4 h-4" /> Add Member
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-500 animate-spin" /></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No team members with finance permissions yet</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Member" to grant finance access to a team member.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(perm => (
            <div key={perm.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Shield className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{perm.profile?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{perm.profile?.email || ''}</p>
                  </div>
                </div>
                <button onClick={() => handleDelete(perm)} disabled={updating === perm.id + 'delete'}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100">
                {PERMISSIONS.map(p => {
                  const isEnabled = perm[p.key as keyof FinancePermission] as boolean;
                  const Icon = p.icon;
                  const isUpdating = updating === perm.id + p.key;
                  return (
                    <button key={p.key} onClick={() => togglePermission(perm, p.key as keyof FinancePermission)} disabled={isUpdating}
                      className={`flex items-start gap-3 p-4 text-left transition-colors ${isEnabled ? 'bg-emerald-50/50' : 'bg-white hover:bg-slate-50'}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isEnabled ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                        {isUpdating ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> : <Icon className={`w-4 h-4 ${isEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-slate-800">{p.label}</p>
                          {isEnabled ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <Lock className="w-3 h-3 text-slate-300 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 leading-snug">{p.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddMemberModal
          existingUserIds={permissions.map(p => p.user_id)}
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setShowAddModal(false); load(); }}
        />
      )}
    </>
  );
}

function AddMemberModal({ existingUserIds, onClose, onAdded }: {
  existingUserIds: string[]; onClose: () => void; onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const searchUsers = async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    setResults((data || []).filter(u => !existingUserIds.includes(u.id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selectedId) { setError('Select a team member'); return; }
    setSubmitting(true);
    const { error: err } = await supabase.from('finance_permissions').insert({
      user_id: selectedId,
      can_view_finance: true,
      can_add_transactions: false,
      can_approve_withdrawals: false,
      can_delete_transactions: false,
      can_manage_fx_rates: false,
      can_manage_invoices: false,
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Add Team Member</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Search Team Members</label>
              <input type="text" value={search} onChange={e => searchUsers(e.target.value)} placeholder="Search by name or email…"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              {results.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {results.map(u => (
                    <button key={u.id} type="button"
                      onClick={() => { setSelectedId(u.id); setSearch(`${u.full_name || u.email}`); setResults([]); }}
                      className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${selectedId === u.id ? 'bg-emerald-50' : ''}`}>
                      <p className="text-sm font-medium text-slate-800">{u.full_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">{u.email} · {u.role}</p>
                    </button>
                  ))}
                </div>
              )}
              {selectedId && <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Member selected</div>}
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                New members start with <strong>View Finance</strong> access only. You can grant additional permissions after adding them.
              </p>
            </div>

            <button type="submit" disabled={submitting}
              className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
              {submitting ? 'Adding…' : 'Add Member'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
