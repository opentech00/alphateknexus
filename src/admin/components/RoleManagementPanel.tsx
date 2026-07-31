import { useState, useEffect, useMemo } from 'react';
import {
  Plus, X, Edit3, Trash2, Search, RefreshCw, Shield, AlertCircle,
  ChevronDown, ChevronUp, Save, Settings, Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { rolesService, permissionService, auditService } from '../../lib/rbacService';
import type { Role, PermissionDefinition, CreateRoleInput, UpdateRoleInput } from '../../types/rbac';
import { PageHeader, StatCard, EmptyState, Spinner, ErrorBanner } from '../components/ui';

const inputCls =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white';
const btnPrimarySmall =
  'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition-colors';
const btnDangerSmall =
  'px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition-colors';

export function RoleManagementPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    color_code: string;
    permission_ids: string[];
  }>({
    name: '',
    description: '',
    color_code: 'blue',
    permission_ids: [],
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesData, permsData] = await Promise.all([
        rolesService.getAllRoles(true),
        permissionService.getAllPermissions(),
      ]);
      setRoles(rolesData);
      setPermissions(permsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRoles = useMemo(
    () =>
      roles.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.description?.toLowerCase().includes(search.toLowerCase())
      ),
    [roles, search]
  );

  const permissionsByCategory = useMemo(() => {
    const grouped: Record<string, PermissionDefinition[]> = {};
    permissions.forEach((p) => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });
    return grouped;
  }, [permissions]);

  const handleOpenModal = (role?: Role) => {
    if (role) {
      setEditing(role);
      setFormData({
        name: role.name,
        description: role.description || '',
        color_code: role.color_code || 'blue',
        permission_ids: role.permissions?.map((p) => p.id) || [],
      });
    } else {
      setEditing(null);
      setFormData({ name: '', description: '', color_code: 'blue', permission_ids: [] });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('Role name is required');
      return;
    }

    setSaving(true);
    try {
      const { user } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (editing) {
        // Check if system role
        if (editing.is_system_role) {
          setError('Cannot modify system roles');
          setSaving(false);
          return;
        }

        const updateInput: UpdateRoleInput = {
          name: formData.name,
          description: formData.description,
          color_code: formData.color_code,
          permission_ids: formData.permission_ids,
        };
        await rolesService.updateRole(editing.id, updateInput, user.id);
      } else {
        const createInput: CreateRoleInput = {
          name: formData.name,
          description: formData.description,
          color_code: formData.color_code,
          permission_ids: formData.permission_ids,
        };
        await rolesService.createRole(createInput, user.id);
      }

      setShowModal(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (roleId: string) => {
    if (!confirm('Delete this role? This action cannot be undone.')) return;

    try {
      await rolesService.deleteRole(roleId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role');
    }
  };

  const togglePermission = (permId: string) => {
    setFormData((prev) => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permId)
        ? prev.permission_ids.filter((id) => id !== permId)
        : [...prev.permission_ids, permId],
    }));
  };

  const colorOptions = [
    { value: 'red', label: 'Red', bg: 'bg-red-500' },
    { value: 'orange', label: 'Orange', bg: 'bg-orange-500' },
    { value: 'amber', label: 'Amber', bg: 'bg-amber-500' },
    { value: 'yellow', label: 'Yellow', bg: 'bg-yellow-500' },
    { value: 'green', label: 'Green', bg: 'bg-green-500' },
    { value: 'emerald', label: 'Emerald', bg: 'bg-emerald-500' },
    { value: 'teal', label: 'Teal', bg: 'bg-teal-500' },
    { value: 'cyan', label: 'Cyan', bg: 'bg-cyan-500' },
    { value: 'blue', label: 'Blue', bg: 'bg-blue-500' },
    { value: 'indigo', label: 'Indigo', bg: 'bg-indigo-500' },
    { value: 'purple', label: 'Purple', bg: 'bg-purple-500' },
    { value: 'pink', label: 'Pink', bg: 'bg-pink-500' },
    { value: 'gray', label: 'Gray', bg: 'bg-gray-500' },
  ];

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
        </div>
        <button onClick={() => handleOpenModal()} className={btnPrimarySmall + ' flex items-center gap-2'}>
          <Plus className="w-4 h-4" /> New Role
        </button>
        <button onClick={() => load()} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {filteredRoles.length === 0 ? (
        <EmptyState icon={Shield} title="No roles found" description="Create a new role to get started" />
      ) : (
        <div className="space-y-2">
          {filteredRoles.map((role) => (
            <div key={role.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              {/* Role Header */}
              <div className="p-4 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}>
                <div
                  className={`w-3 h-3 rounded-full ${role.color_code ? `bg-${role.color_code}-500` : 'bg-slate-300'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{role.name}</h3>
                    {role.is_system_role && (
                      <span className="px-2 py-1 bg-slate-200 text-slate-700 text-xs rounded font-medium">
                        System
                      </span>
                    )}
                    {!role.is_active && (
                      <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-medium">
                        Inactive
                      </span>
                    )}
                  </div>
                  {role.description && <p className="text-xs text-slate-500 mt-1">{role.description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {role.permission_count || 0} permissions
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {expandedRole === role.id ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Role Details */}
              {expandedRole === role.id && (
                <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-4">
                  {/* Permissions Grid */}
                  {role.permissions && role.permissions.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <Shield className="w-4 h-4" /> Permissions
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {role.permissions.map((perm) => (
                          <div
                            key={perm.id}
                            className={`px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis ${
                              perm.is_sensitive
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                            title={perm.description || undefined}
                          >
                            {perm.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 flex items-center gap-2">
                      <Info className="w-4 h-4" /> No permissions assigned
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-slate-200">
                    {!role.is_system_role && (
                      <>
                        <button
                          onClick={() => handleOpenModal(role)}
                          className={btnPrimarySmall + ' flex items-center gap-2'}
                        >
                          <Edit3 className="w-4 h-4" /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(role.id)}
                          className={btnDangerSmall + ' flex items-center gap-2'}
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editing ? 'Edit Role' : 'Create New Role'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Basic Info */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">Role Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Finance Manager"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="What is this role responsible for?"
                  rows={3}
                  className={inputCls}
                />
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">Role Color</label>
                <div className="grid grid-cols-7 gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setFormData((prev) => ({ ...prev, color_code: color.value }))}
                      className={`w-8 h-8 rounded-lg ${color.bg} ${
                        formData.color_code === color.value ? 'ring-2 ring-offset-2 ring-slate-900' : ''
                      } transition-all`}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Assign Permissions
                </label>
                <div className="space-y-3">
                  {Object.entries(permissionsByCategory).map(([category, perms]) => (
                    <div key={category} className="border border-slate-200 rounded-lg p-3">
                      <h4 className="text-sm font-semibold text-slate-900 mb-2 capitalize">
                        {category.replace(/_/g, ' ')}
                      </h4>
                      <div className="space-y-2">
                        {perms.map((perm) => (
                          <label key={perm.id} className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.permission_ids.includes(perm.id)}
                              onChange={() => togglePermission(perm.id)}
                              className="w-4 h-4 rounded border-slate-300 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-900">{perm.name}</div>
                              {perm.description && (
                                <div className="text-xs text-slate-500">{perm.description}</div>
                              )}
                            </div>
                            {perm.is_sensitive && (
                              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={btnPrimarySmall + ' flex items-center gap-2 disabled:opacity-50'}
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
