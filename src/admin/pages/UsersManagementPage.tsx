import { useEffect, useState, useCallback } from 'react';
import {
  Users, Search, Ban, CheckCircle2, ShieldCheck, ShieldAlert, Star,
  Flag, FileText, Trash2, ArrowLeft, X, Download, Send, AlertTriangle,
  History, StickyNote, UserCheck, UserX, Filter, ChevronDown, Mail,
  Phone, Calendar, Briefcase, Eye, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, EmptyState, Spinner, ErrorBanner, StatCard } from '../components/ui';

type FlagType = 'vip' | 'at_risk' | 'problematic' | 'high_value';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  created_at: string;
  is_suspended: boolean;
  is_verified: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
}

interface AdminNote {
  id: string;
  note: string;
  created_at: string;
  admin_id: string;
  admin_name?: string;
}

interface UserFlag {
  id: string;
  flag_type: FlagType;
  note: string | null;
  created_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  details: any;
  created_at: string;
  admin_id: string;
}

interface UserActivity {
  bookings: { id: string; service_name: string; status: string; created_at: string; scheduled_date: string }[];
  payments: { id: string; amount: number; status: string; created_at: string }[];
  reviews: { id: string; rating: number; comment: string; created_at: string }[];
  messages: { id: string; body: string; created_at: string }[];
}

const FLAG_CONFIG: Record<FlagType, { label: string; icon: typeof Star; color: string; bg: string; border: string }> = {
  vip: { label: 'VIP', icon: Star, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  high_value: { label: 'High Value', icon: ShieldCheck, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  at_risk: { label: 'At Risk', icon: ShieldAlert, color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  problematic: { label: 'Problematic', icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
};

const inputCls = 'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all';

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function UsersManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'verified' | 'unverified'>('all');
  const [flagFilter, setFlagFilter] = useState<'all' | FlagType>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [allFlags, setAllFlags] = useState<Record<string, UserFlag[]>>({});

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone, role, created_at, is_suspended, is_verified, suspended_reason, suspended_at')
      .order('created_at', { ascending: false });
    if (err) { setError(err.message); setLoading(false); return; }
    setUsers(data as UserProfile[]);

    // Fetch all flags
    const { data: flagsData } = await supabase.from('user_flags').select('id, user_id, flag_type, note, created_at');
    const flagMap: Record<string, UserFlag[]> = {};
    (flagsData || []).forEach((f: any) => {
      if (!flagMap[f.user_id]) flagMap[f.user_id] = [];
      flagMap[f.user_id].push(f);
    });
    setAllFlags(flagMap);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = users.filter(u => {
    if (search) {
      const q = search.toLowerCase();
      if (!u.email.toLowerCase().includes(q) && !(u.full_name || '').toLowerCase().includes(q) && !(u.phone || '').includes(q)) return false;
    }
    if (statusFilter === 'active' && u.is_suspended) return false;
    if (statusFilter === 'suspended' && !u.is_suspended) return false;
    if (statusFilter === 'verified' && !u.is_verified) return false;
    if (statusFilter === 'unverified' && u.is_verified) return false;
    if (flagFilter !== 'all') {
      const flags = allFlags[u.id] || [];
      if (!flags.some(f => f.flag_type === flagFilter)) return false;
    }
    return true;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => !u.is_suspended).length,
    suspended: users.filter(u => u.is_suspended).length,
    verified: users.filter(u => u.is_verified).length,
  };

  const handleExport = () => {
    const headers = ['Email', 'Full Name', 'Phone', 'Role', 'Created', 'Suspended', 'Verified'];
    const rows = filtered.map(u => [
      u.email, u.full_name || '', u.phone || '', u.role,
      fmtDate(u.created_at), u.is_suspended ? 'Yes' : 'No', u.is_verified ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (selectedUser) {
    return (
      <UserDetail
        user={selectedUser}
        onBack={() => { setSelectedUser(null); fetchUsers(); }}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="User Management"
        description={`${users.length} registered users`}
        icon={Users}
        actions={
          <button onClick={handleExport} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Users" value={stats.total} icon={Users} color="text-slate-600" accent="bg-slate-50" />
        <StatCard label="Active" value={stats.active} icon={UserCheck} color="text-emerald-600" accent="bg-emerald-50" />
        <StatCard label="Suspended" value={stats.suspended} icon={UserX} color="text-red-600" accent="bg-red-50" />
        <StatCard label="Verified" value={stats.verified} icon={ShieldCheck} color="text-blue-600" accent="bg-blue-50" />
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input className={`${inputCls} pl-9`} placeholder="Search by name, email, or phone..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className={`${inputCls} sm:w-40`} value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
          <select className={`${inputCls} sm:w-40`} value={flagFilter} onChange={e => setFlagFilter(e.target.value as any)}>
            <option value="all">All Flags</option>
            <option value="vip">VIP</option>
            <option value="high_value">High Value</option>
            <option value="at_risk">At Risk</option>
            <option value="problematic">Problematic</option>
          </select>
        </div>
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No users found" description="Try adjusting your search or filters." />
      ) : (
        <div className="space-y-2">
          {filtered.map(u => {
            const flags = allFlags[u.id] || [];
            return (
              <div key={u.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedUser(u)}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${u.is_suspended ? 'bg-red-50' : 'bg-slate-100'}`}>
                      <span className={`font-semibold text-sm ${u.is_suspended ? 'text-red-600' : 'text-slate-700'}`}>
                        {u.full_name?.[0]?.toUpperCase() || u.email[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 text-sm">{u.full_name || 'Unnamed'}</h3>
                        {u.is_verified && <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />}
                        {u.is_suspended && <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-700 rounded">Suspended</span>}
                        {u.role === 'admin' && <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 rounded">Admin</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {flags.map(f => {
                      const cfg = FLAG_CONFIG[f.flag_type];
                      const Icon = cfg.icon;
                      return <span key={f.id} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full ${cfg.bg} ${cfg.color} ${cfg.border} border`}><Icon className="w-3 h-3" />{cfg.label}</span>;
                    })}
                    <span className="text-xs text-slate-400 ml-1">{fmtDate(u.created_at)}</span>
                    <Eye className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================== USER DETAIL VIEW ====================

function UserDetail({ user, onBack }: { user: UserProfile; onBack: () => void }) {
  const [tab, setTab] = useState<'overview' | 'activity' | 'notes' | 'audit'>('overview');
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [flags, setFlags] = useState<UserFlag[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAnnounceModal, setShowAnnounceModal] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    const [notesRes, flagsRes, auditRes] = await Promise.all([
      supabase.from('admin_notes').select('id, note, created_at, admin_id').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('user_flags').select('id, flag_type, note, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('admin_audit_log').select('id, action, details, created_at, admin_id').eq('target_user_id', user.id).order('created_at', { ascending: false }),
    ]);

    // Fetch admin names for notes
    const adminIds = [...new Set((notesRes.data || []).map((n: any) => n.admin_id))];
    let adminNames: Record<string, string> = {};
    if (adminIds.length > 0) {
      const { data: admins } = await supabase.from('profiles').select('id, full_name').in('id', adminIds);
      (admins || []).forEach((a: any) => { adminNames[a.id] = a.full_name || 'Admin'; });
    }

    setNotes((notesRes.data || []).map((n: any) => ({ ...n, admin_name: adminNames[n.admin_id] || 'Admin' })));
    setFlags(flagsRes.data as UserFlag[] || []);
    setAudit(auditRes.data as AuditEntry[] || []);

    // Fetch activity
    const [bookingsRes, reviewsRes, messagesRes] = await Promise.all([
      supabase.from('bookings').select('id, status, created_at, scheduled_date, services(name)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('reviews').select('id, rating, comment, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('messages').select('id, body, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    ]);

    setActivity({
      bookings: (bookingsRes.data || []).map((b: any) => ({ id: b.id, service_name: b.services?.name || 'Unknown', status: b.status, created_at: b.created_at, scheduled_date: b.scheduled_date })),
      payments: [],
      reviews: (reviewsRes.data || []) as any,
      messages: (messagesRes.data || []) as any,
    });
    setLoading(false);
  }, [user.id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const logAction = async (action: string, details?: any) => {
    const { data: { user: admin } } = await supabase.auth.getUser();
    await supabase.from('admin_audit_log').insert({ admin_id: admin?.id, target_user_id: user.id, action, details: details || null });
  };

  const handleSuspend = async () => {
    setActionLoading(true);
    const { error: err } = await supabase.from('profiles').update({ is_suspended: true, suspended_reason: suspendReason || null, suspended_at: new Date().toISOString() }).eq('id', user.id);
    if (err) { setActionLoading(false); return; }
    await logAction('suspend', { reason: suspendReason });
    setShowSuspendModal(false); setSuspendReason('');
    setActionLoading(false); fetchDetail();
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    const { error: err } = await supabase.from('profiles').update({ is_suspended: false, suspended_reason: null, suspended_at: null }).eq('id', user.id);
    if (err) { setActionLoading(false); return; }
    await logAction('reactivate');
    setActionLoading(false); fetchDetail();
  };

  const handleToggleVerify = async () => {
    setActionLoading(true);
    const newVerified = !user.is_verified;
    const { error: err } = await supabase.from('profiles').update({ is_verified: newVerified }).eq('id', user.id);
    if (err) { setActionLoading(false); return; }
    await logAction(newVerified ? 'verify' : 'unverify');
    user.is_verified = newVerified;
    setActionLoading(false); fetchDetail();
  };

  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async () => {
    setActionLoading(true);
    setDeleteError('');
    const { data, error: fnErr } = await supabase.functions.invoke('admin-delete-user', {
      body: { targetUserId: user.id },
    });
    if (fnErr || (data && data.error)) {
      setDeleteError(data?.error || fnErr?.message || 'Failed to delete user');
      setActionLoading(false);
      return;
    }
    setActionLoading(false);
    onBack();
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setActionLoading(true);
    const { data: { user: admin } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('admin_notes').insert({ user_id: user.id, admin_id: admin?.id, note: newNote.trim() });
    if (err) { setActionLoading(false); return; }
    await logAction('note_added', { note: newNote.trim() });
    setNewNote('');
    setActionLoading(false); fetchDetail();
  };

  const handleDeleteNote = async (noteId: string) => {
    const { error: err } = await supabase.from('admin_notes').delete().eq('id', noteId);
    if (!err) fetchDetail();
  };

  const handleToggleFlag = async (flagType: FlagType) => {
    const existing = flags.find(f => f.flag_type === flagType);
    if (existing) {
      const { error: err } = await supabase.from('user_flags').delete().eq('id', existing.id);
      if (!err) { await logAction('flag_removed', { flag_type: flagType }); fetchDetail(); }
    } else {
      const { data: { user: admin } } = await supabase.auth.getUser();
      const { error: err } = await supabase.from('user_flags').insert({ user_id: user.id, flag_type: flagType, created_by: admin?.id });
      if (!err) { await logAction('flag_added', { flag_type: flagType }); fetchDetail(); }
    }
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: Eye },
    { id: 'activity' as const, label: 'Activity', icon: History },
    { id: 'notes' as const, label: 'Notes', icon: StickyNote },
    { id: 'audit' as const, label: 'Audit Log', icon: FileText },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Users
      </button>

      {/* User Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="p-6 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${user.is_suspended ? 'bg-red-50' : 'bg-slate-100'}`}>
            <span className={`text-xl font-bold ${user.is_suspended ? 'text-red-600' : 'text-slate-700'}`}>
              {user.full_name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">{user.full_name || 'Unnamed User'}</h1>
              {user.is_verified && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200"><ShieldCheck className="w-3 h-3" />Verified</span>}
              {user.is_suspended && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 text-red-700 border border-red-200"><Ban className="w-3 h-3" />Suspended</span>}
              {user.role === 'admin' && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"><ShieldCheck className="w-3 h-3" />Admin</span>}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{user.email}</span>
              {user.phone && <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{user.phone}</span>}
              <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined {fmtDate(user.created_at)}</span>
            </div>
            {user.is_suspended && user.suspended_reason && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <strong>Suspension reason:</strong> {user.suspended_reason}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 pb-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {user.is_suspended ? (
            <button onClick={handleReactivate} disabled={actionLoading} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50">
              <CheckCircle2 className="w-4 h-4" />Reactivate
            </button>
          ) : (
            <button onClick={() => setShowSuspendModal(true)} disabled={actionLoading} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors disabled:opacity-50">
              <Ban className="w-4 h-4" />Suspend
            </button>
          )}
          <button onClick={handleToggleVerify} disabled={actionLoading} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-50">
            <ShieldCheck className="w-4 h-4" />{user.is_verified ? 'Unverify' : 'Verify'}
          </button>
          <button onClick={() => setShowAnnounceModal(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
            <Send className="w-4 h-4" />Send Message
          </button>
          <button onClick={() => setShowDeleteModal(true)} disabled={actionLoading} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50 ml-auto">
            <Trash2 className="w-4 h-4" />Delete Account
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white rounded-xl border border-slate-200 p-1">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Flags */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Flag className="w-4 h-4" />User Flags</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(Object.keys(FLAG_CONFIG) as FlagType[]).map(ft => {
                    const cfg = FLAG_CONFIG[ft];
                    const Icon = cfg.icon;
                    const active = flags.some(f => f.flag_type === ft);
                    return (
                      <button key={ft} onClick={() => handleToggleFlag(ft)} className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all active:scale-[0.98] ${active ? `${cfg.bg} ${cfg.border}` : 'border-slate-200 hover:border-slate-300'}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${active ? cfg.bg : 'bg-slate-50'}`}>
                          <Icon className={`w-3.5 h-3.5 ${active ? cfg.color : 'text-slate-400'}`} />
                        </div>
                        <span className={`text-sm font-medium ${active ? cfg.color : 'text-slate-500'}`}>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Stats */}
              {activity && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-1"><Briefcase className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-400 font-medium">Bookings</span></div>
                    <p className="text-2xl font-bold text-slate-900">{activity.bookings.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-1"><Star className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-400 font-medium">Reviews</span></div>
                    <p className="text-2xl font-bold text-slate-900">{activity.reviews.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-1"><Mail className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-400 font-medium">Messages</span></div>
                    <p className="text-2xl font-bold text-slate-900">{activity.messages.length}</p>
                  </div>
                </div>
              )}

              {/* Recent Bookings */}
              {activity && activity.bookings.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Recent Bookings</h3>
                  <div className="space-y-2">
                    {activity.bookings.slice(0, 5).map(b => (
                      <div key={b.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{b.service_name}</p>
                          <p className="text-xs text-slate-400">{fmtDate(b.scheduled_date)}</p>
                        </div>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${b.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : b.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{b.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ACTIVITY TAB */}
          {tab === 'activity' && activity && (
            <div className="space-y-4">
              <ActivitySection title="Bookings" icon={Briefcase} items={activity.bookings.map(b => ({ id: b.id, title: b.service_name, subtitle: fmtDate(b.scheduled_date), badge: b.status }))} />
              <ActivitySection title="Reviews" icon={Star} items={activity.reviews.map(r => ({ id: r.id, title: `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}`, subtitle: r.comment, badge: null }))} />
              <ActivitySection title="Messages" icon={Mail} items={activity.messages.map(m => ({ id: m.id, title: m.body.slice(0, 60) + (m.body.length > 60 ? '...' : ''), subtitle: fmtDateTime(m.created_at), badge: null }))} />
              {activity.bookings.length === 0 && activity.reviews.length === 0 && activity.messages.length === 0 && (
                <EmptyState icon={History} title="No activity yet" description="This user hasn't made any bookings, reviews, or messages." />
              )}
            </div>
          )}

          {/* NOTES TAB */}
          {tab === 'notes' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><StickyNote className="w-4 h-4" />Add Internal Note</h3>
                <textarea className={`${inputCls} resize-none`} rows={3} value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Write an internal note about this user. Only visible to admins." />
                <button onClick={handleAddNote} disabled={actionLoading || !newNote.trim()} className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors disabled:opacity-50">
                  <StickyNote className="w-4 h-4" />Add Note
                </button>
              </div>
              {notes.length === 0 ? (
                <EmptyState icon={StickyNote} title="No notes yet" description="Internal notes about this user will appear here." />
              ) : (
                <div className="space-y-2">
                  {notes.map(n => (
                    <div key={n.id} className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm text-slate-700">{n.note}</p>
                          <p className="text-xs text-slate-400 mt-2">By {n.admin_name} on {fmtDateTime(n.created_at)}</p>
                        </div>
                        <button onClick={() => handleDeleteNote(n.id)} className="text-slate-300 hover:text-red-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AUDIT TAB */}
          {tab === 'audit' && (
            <div className="space-y-2">
              {audit.length === 0 ? (
                <EmptyState icon={FileText} title="No audit entries" description="Admin actions on this account will be logged here." />
              ) : (
                audit.map(a => (
                  <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <History className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800 capitalize">{a.action.replace(/_/g, ' ')}</p>
                      {a.details && <p className="text-xs text-slate-500 mt-0.5">{JSON.stringify(a.details)}</p>}
                      <p className="text-xs text-slate-400 mt-1">{fmtDateTime(a.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* SUSPEND MODAL */}
      {showSuspendModal && (
        <Modal title="Suspend User" onClose={() => setShowSuspendModal(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-orange-700">
                Suspending <strong>{user.full_name || user.email}</strong> will prevent them from logging in and making new bookings. They can be reactivated at any time.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason (optional)</label>
              <textarea className={`${inputCls} resize-none`} rows={2} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="e.g. Payment dispute, suspicious activity..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSuspendModal(false)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 text-sm">Cancel</button>
              <button onClick={handleSuspend} disabled={actionLoading} className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 text-sm disabled:opacity-50">Confirm Suspension</button>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE MODAL */}
      {showDeleteModal && (
        <Modal title="Delete Account" onClose={() => setShowDeleteModal(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                <strong>This action is irreversible.</strong> Deleting <strong>{user.full_name || user.email}</strong> will permanently remove their account and all associated data. This cannot be undone.
              </p>
            </div>
            {deleteError && <ErrorBanner message={deleteError} />}
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 text-sm">Cancel</button>
              <button onClick={handleDelete} disabled={actionLoading} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 text-sm disabled:opacity-50">Delete Permanently</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ANNOUNCE MODAL */}
      {showAnnounceModal && (
        <AnnounceModal user={user} onClose={() => setShowAnnounceModal(false)} />
      )}
    </div>
  );
}

// ==================== ACTIVITY SECTION ====================

function ActivitySection({ title, icon: Icon, items }: { title: string; icon: typeof Briefcase; items: { id: string; title: string; subtitle: string; badge: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Icon className="w-4 h-4" />{title}</h3>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
            <div>
              <p className="text-sm font-medium text-slate-800">{item.title}</p>
              <p className="text-xs text-slate-400">{item.subtitle}</p>
            </div>
            {item.badge && <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">{item.badge}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== ANNOUNCE MODAL ====================

function AnnounceModal({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    // Insert as a message from admin
    const { data: { user: admin } } = await supabase.auth.getUser();
    await supabase.from('messages').insert({
      user_id: user.id,
      sender_id: admin?.id,
      body: message.trim(),
      is_from_admin: true,
    });
    // Log it
    await supabase.from('admin_audit_log').insert({
      admin_id: admin?.id,
      target_user_id: user.id,
      action: 'announcement_sent',
      details: { message: message.trim() },
    });
    setSending(false);
    setSent(true);
    setTimeout(onClose, 1500);
  };

  if (sent) {
    return (
      <Modal title="Message Sent" onClose={onClose}>
        <div className="text-center py-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-sm text-slate-600">Your message has been sent to {user.full_name || user.email}.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Send Message" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Send a direct message to <strong>{user.full_name || user.email}</strong>. This will appear in their message inbox.</p>
        <textarea className={`${inputCls} resize-none`} rows={4} value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your message..." />
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 text-sm">Cancel</button>
          <button onClick={handleSend} disabled={sending || !message.trim()} className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {sending ? <><RefreshCw className="w-4 h-4 animate-spin" />Sending...</> : <><Send className="w-4 h-4" />Send Message</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ==================== MODAL HELPER ====================

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
