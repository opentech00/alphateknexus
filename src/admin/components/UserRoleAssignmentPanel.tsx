import { useState, useEffect, useMemo } from 'react';
import {
  Plus, X, Trash2, Search, RefreshCw, Users, Calendar, AlertCircle,
  ChevronDown, Star, Save, Badge,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { userRolesService, rolesService, auditService } from '../../lib/rbacService';
import type { UserRoleAssignment, Role, Profile } from '../../types';
import { Spinner, ErrorBanner, EmptyState } from '../components/ui';

const inputCls =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white';
const btnPrimarySmall =
  'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition-colors';
const btnDangerSmall =
  'px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition-colors';

interface UserWithRoles {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role_count: number;
  primary_role: string | null;
  roles: UserRoleAssignment[];
}

export function UserRoleAssignmentPanel() {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRoleData, setNewRoleData] = useState({
    role_id: '',
    is_primary: false,
    expires_at: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesData, { data: profilesData }] = await Promise.all([
        rolesService.getAllRoles(),
        supabase.from('profiles').select('id, full_name, email, avatar_url').order('full_name'),
      ]);

      setRoles(rolesData);

      // Load roles for each user
      if (profilesData) {
        const usersWithRoles: UserWithRoles[] = await Promise.all(
          profilesData.map(async (profile) => {
            const userRoles = await userRolesService.getUserRoleAssignments(profile.id);
            const primaryRole = userRoles.find((r) => r.is_primary);
            return {
              id: profile.id,
              full_name: profile.full_name || profile.email,
              email: profile.email,
              avatar_url: profile.avatar_url,
              role_count: userRoles.length,
              primary_role: primaryRole?.role?.name || null,
              roles: userRoles,
            };
          })
        );
        setUsers(usersWithRoles);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.full_name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
      ),
    [users, search]
  );

  const handleAssignRole = async () => {
    if (!selectedUser || !newRoleData.role_id) {
      setError('Please select a role');
      return;
    }

    setSaving(true);
    try {
      const { user } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await userRolesService.assignRole(
        {
          user_id: selectedUser.id,
          role_id: newRoleData.role_id,
          is_primary: newRoleData.is_primary,
          expires_at: newRoleData.expires_at ? new Date(newRoleData.expires_at) : null,
        },
        user.id
      );

      setNewRoleData({ role_id: '', is_primary: false, expires_at: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign role');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRole = async (assignmentId: string) => {
    if (!confirm('Remove this role assignment?')) return;

    try {
      const assignment = selectedUser?.roles.find((r) => r.id === assignmentId);
      if (!assignment) return;

      await userRolesService.removeRole(selectedUser!.id, assignment.role_id);

      // If this was primary, set another as primary
      const remaining = selectedUser!.roles.filter((r) => r.id !== assignmentId);
      if (assignment.is_primary && remaining.length > 0) {
        await userRolesService.setPrimaryRole(selectedUser!.id, remaining[0].role_id);
      }

      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove role');
    }
  };

  const handleSetPrimary = async (roleId: string) => {
    if (!selectedUser) return;

    try {
      const { user } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await userRolesService.setPrimaryRole(selectedUser.id, roleId);
      await auditService.logAction('set_primary_role', 'user_role', selectedUser.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update primary role');
    }
  };

  const openAssignmentModal = (user: UserWithRoles) => {
    setSelectedUser(user);
    setNewRoleData({ role_id: '', is_primary: false, expires_at: '' });
    setShowModal(true);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
        </div>
        <button onClick={() => load()} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {filteredUsers.length === 0 ? (
        <EmptyState icon={Users} title="No users found" description="Start by searching for users" />
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((user) => (
            <div key={user.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              {/* User Header */}
              <div
                className="p-4 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
              >
                {user.avatar_url && (
                  <img src={user.avatar_url} alt={user.full_name} className="w-10 h-10 rounded-full object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{user.full_name}</h3>
                    {user.primary_role && (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded font-medium flex items-center gap-1">
                        <Star className="w-3 h-3" /> {user.primary_role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{user.email}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {user.role_count} role{user.role_count !== 1 ? 's' : ''} assigned
                  </p>
                </div>
                <ChevronDown className="w-5 h-5 text-slate-400" />
              </div>

              {/* User Details */}
              {expandedUser === user.id && (
                <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-4">
                  {/* Current Roles */}
                  {user.roles.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <Badge className="w-4 h-4" /> Current Roles ({user.roles.length})
                      </h4>
                      <div className="space-y-2">
                        {user.roles.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900">{assignment.role?.name}</span>
                                {assignment.is_primary && (
                                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                )}
                                {assignment.expires_at && (
                                  <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded font-medium flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Expires{' '}
                                    {new Date(assignment.expires_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              {assignment.department?.name && (
                                <p className="text-xs text-slate-500 mt-1">
                                  Department: {assignment.department.name}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              {!assignment.is_primary && (
                                <button
                                  onClick={() => handleSetPrimary(assignment.role_id)}
                                  className="p-1.5 hover:bg-amber-100 rounded text-slate-600 hover:text-amber-600 transition-colors"
                                  title="Set as primary role"
                                >
                                  <Star className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveRole(assignment.id)}
                                className="p-1.5 hover:bg-red-100 rounded text-slate-600 hover:text-red-600 transition-colors"
                                title="Remove role"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> No roles assigned
                    </p>
                  )}

                  {/* Assign Role Button */}
                  <button
                    onClick={() => openAssignmentModal(user)}
                    className={btnPrimarySmall + ' flex items-center gap-2'}
                  >
                    <Plus className="w-4 h-4" /> Assign Role
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Assign Role to {selectedUser.full_name}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Select Role *
                </label>
                <select
                  value={newRoleData.role_id}
                  onChange={(e) =>
                    setNewRoleData((prev) => ({ ...prev, role_id: e.target.value }))
                  }
                  className={inputCls}
                >
                  <option value="">-- Choose a role --</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} {role.is_system_role ? '(System)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Primary Role Checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newRoleData.is_primary}
                  onChange={(e) =>
                    setNewRoleData((prev) => ({ ...prev, is_primary: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-slate-300 cursor-pointer"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">Set as Primary Role</div>
                  <div className="text-xs text-slate-500">
                    User will be identified by this role by default
                  </div>
                </div>
              </label>

              {/* Expiration Date */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Expiration Date (Optional)
                </label>
                <input
                  type="date"
                  value={newRoleData.expires_at}
                  onChange={(e) =>
                    setNewRoleData((prev) => ({ ...prev, expires_at: e.target.value }))
                  }
                  className={inputCls}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Leave empty for permanent assignment
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignRole}
                disabled={saving || !newRoleData.role_id}
                className={btnPrimarySmall + ' flex items-center gap-2 disabled:opacity-50'}
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Assigning...' : 'Assign Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
