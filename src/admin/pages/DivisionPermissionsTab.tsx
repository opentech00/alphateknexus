import { useEffect, useState, useCallback } from 'react';
import {
  Shield, Search, Loader2, X, CheckCircle2, RefreshCw, Lock,
  Trash2, UserCog, Eye, Settings, FileCheck, FolderOpen, MessageCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { DivisionConfig } from './DivisionPage';

interface DivisionPermission {
  id: string;
  user_id: string;
  division_slug: string;
  can_view: boolean;
  can_manage_bookings: boolean;
  can_approve_quotes: boolean;
  can_manage_documents: boolean;
  can_message_clients: boolean;
  can_delete_records: boolean;
  updated_at: string;
  profile?: { full_name: string | null; email: string | null };
}

type PermKey = keyof Pick<
  DivisionPermission,
  'can_view' | 'can_manage_bookings' | 'can_approve_quotes' |
  'can_manage_documents' | 'can_message_clients' | 'can_delete_records'
>;

const PERMISSIONS: { key: PermKey; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'can_view', label: 'View Division', icon: Eye, desc: 'Can view bookings and request data' },
  { key: 'can_manage_bookings', label: 'Manage Bookings', icon: Settings, desc: 'Can update booking status and assign jobs' },
  { key: 'can_approve_quotes', label: 'Approve Quotes', icon: FileCheck, desc: 'Can approve or reject quote requests' },
  { key: 'can_manage_documents', label: 'Manage Documents', icon: FolderOpen, desc: 'Can upload and manage booking documents' },
  { key: 'can_message_clients', label: 'Message Clients', icon: MessageCircle, desc: 'Can send messages to clients' },
  { key: 'can_delete_records', label: 'Delete Records', icon: Trash2, desc: 'Can delete bookings and records' },
];

async function fetchProfileMap(userIds: string[]) {
  if (userIds.length === 0) return {} as Record<string, { full_name: string | null; email: string | null }>;
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', [...new Set(userIds)]);
  const map: Record<string, { full_name: string | null; email: string | null }> = {};
  (data || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email }; });
  return map;
}

interface Props { config: DivisionConfig }

export function DivisionPermissionsTab({ config }: Props) {
  const [permissions, setPermissions] = useState<DivisionPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('division_permissions')
      .select('*')
      .eq('division_slug', config.slug)
      .order('updated_at', { ascending: false });
    if (error) { setLoadError(error.message); setLoading(false); return; }
    const rows = (data || []) as DivisionPermission[];
    const profileMap = await fetchProfileMap(rows.map(r => r.user_id));
    setPermissions(rows.map(r => ({ ...r, profile: profileMap[r.user_id] || { full_name: null, email: null } })));
    setLoading(false);
  }, [config.slug]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (perm: DivisionPermission, key: PermKey) => {
    setUpdating(perm.id + key);
    await supabase
      .from('division_permissions')
      .update({ [key]: !perm[key], updated_at: new Date().toISOString() })
      .eq('id', perm.id);
    await load();
    setUpdating(null);
  };

  const handleDelete = async (perm: DivisionPermission) => {
    const name = perm.profile?.full_name || perm.profile?.email || 'this user';
    if (!confirm(`Remove all ${config.name} permissions for ${name}?`)) return;
    setUpdating(perm.id + 'delete');
    await supabase.from('division_permissions').delete().eq('id', perm.id);
    await load();
    setUpdating(null);
  };

  const filtered = permissions.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.profile?.full_name || '').toLowerCase().includes(q) ||
      (p.profile?.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className={`flex items-start gap-3 rounded-xl p-4 border ${config.accentLight} border-${config.accentBorder.replace('border-', '')}`}>
        <Shield className={`w-5 h-5 ${config.accentText} flex-shrink-0 mt-0.5`} />
        <div>
          <p className="text-sm font-semibold text-slate-800">Role-Based {config.name} Permissions</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Grant granular access to team members for the {config.name} division. Full admins automatically bypass all
            restrictions. Members without a permission row can only view division data (default).
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
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className={`flex items-center gap-2 px-4 py-2.5 ${config.accentColor} text-white font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm whitespace-nowrap`}
          >
            <UserCog className="w-4 h-4" /> Add Member
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-center py-16">
            <Loader2 className={`w-7 h-7 ${config.accentText} animate-spin`} />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No team members with {config.name} permissions yet</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Member" to grant access to a team member.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(perm => (
            <div key={perm.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${config.accentLight} rounded-xl flex items-center justify-center`}>
                    <Shield className={`w-5 h-5 ${config.accentText}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{perm.profile?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{perm.profile?.email || ''}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(perm)}
                  disabled={updating === perm.id + 'delete'}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100">
                {PERMISSIONS.map(p => {
                  const isEnabled = perm[p.key];
                  const Icon = p.icon;
                  const isUpdating = updating === perm.id + p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => toggle(perm, p.key)}
                      disabled={isUpdating}
                      className={`flex items-start gap-3 p-4 text-left transition-colors ${isEnabled ? `${config.accentLight}/50` : 'bg-white hover:bg-slate-50'}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isEnabled ? config.accentLight : 'bg-slate-100'}`}>
                        {isUpdating
                          ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                          : <Icon className={`w-4 h-4 ${isEnabled ? config.accentText : 'text-slate-400'}`} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-slate-800">{p.label}</p>
                          {isEnabled
                            ? <CheckCircle2 className={`w-3.5 h-3.5 ${config.accentText} flex-shrink-0`} />
                            : <Lock className="w-3 h-3 text-slate-300 flex-shrink-0" />
                          }
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
          divisionSlug={config.slug}
          divisionName={config.name}
          accentColor={config.accentColor}
          accentText={config.accentText}
          existingUserIds={permissions.map(p => p.user_id)}
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setShowAddModal(false); load(); }}
        />
      )}
    </>
  );
}

function AddMemberModal({
  divisionSlug, divisionName, accentColor, accentText, existingUserIds, onClose, onAdded,
}: {
  divisionSlug: string; divisionName: string;
  accentColor: string; accentText: string;
  existingUserIds: string[]; onClose: () => void; onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedName, setSelectedName] = useState('');
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
    setResults((data || []).filter((u: any) => !existingUserIds.includes(u.id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selectedId) { setError('Select a team member first'); return; }
    setSubmitting(true);
    const { error: err } = await supabase.from('division_permissions').insert({
      user_id: selectedId,
      division_slug: divisionSlug,
      can_view: true,
      can_manage_bookings: false,
      can_approve_quotes: false,
      can_manage_documents: false,
      can_message_clients: false,
      can_delete_records: false,
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
            <UserCog className={`w-5 h-5 ${accentText}`} />
            <h2 className="text-lg font-bold text-slate-900">Add Member — {divisionName}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">Search Team Members</label>
              <input
                type="text"
                value={search}
                onChange={e => searchUsers(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              {results.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {results.map((u: any) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setSelectedId(u.id); setSelectedName(u.full_name || u.email); setSearch(u.full_name || u.email); setResults([]); }}
                      className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${selectedId === u.id ? 'bg-emerald-50' : ''}`}
                    >
                      <p className="text-sm font-medium text-slate-800">{u.full_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">{u.email} · {u.role}</p>
                    </button>
                  ))}
                </div>
              )}
              {selectedId && (
                <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" /> {selectedName} selected
                </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                New members start with <strong>View Division</strong> access only. You can grant additional
                permissions after adding them.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedId}
              className={`w-full py-3.5 ${accentColor} text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2`}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
              {submitting ? 'Adding…' : 'Add Member'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
