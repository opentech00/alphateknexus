import { useState, useEffect } from 'react';
import { Plus, X, Edit3, Trash2, Search, RefreshCw, Building2, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { departmentsService, auditService } from '../../lib/rbacService';
import type { RbacDepartment, Profile } from '../../types';
import { Spinner, ErrorBanner, EmptyState, PageHeader, StatCard } from '../components/ui';

const inputCls =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white';
const btnPrimarySmall =
  'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition-colors';
const btnDangerSmall =
  'px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition-colors';

export function DepartmentManagementPanel() {
  const [departments, setDepartments] = useState<RbacDepartment[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RbacDepartment | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    manager_id: '',
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [deptsData, { data: usersData }] = await Promise.all([
        departmentsService.getAllDepartments(true),
        supabase.from('profiles').select('id, full_name, email').order('full_name'),
      ]);
      setDepartments(deptsData);
      setAllUsers((usersData as Profile[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredDepartments = departments.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      d.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenModal = (dept?: RbacDepartment) => {
    if (dept) {
      setEditing(dept);
      setFormData({
        code: dept.code,
        name: dept.name,
        description: dept.description || '',
        manager_id: dept.manager_id || '',
        is_active: dept.is_active,
      });
    } else {
      setEditing(null);
      setFormData({
        code: '',
        name: '',
        description: '',
        manager_id: '',
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.code.trim()) {
      setError('Department code is required');
      return;
    }
    if (!formData.name.trim()) {
      setError('Department name is required');
      return;
    }

    setSaving(true);
    try {
      const { user } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (editing) {
        const { error: updateError } = await supabase
          .from('rbac_departments')
          .update({
            name: formData.name,
            description: formData.description,
            manager_id: formData.manager_id || null,
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id);

        if (updateError) throw updateError;
        await auditService.logAction('update_department', 'department', editing.id, formData.name);
      } else {
        const { error: insertError } = await supabase
          .from('rbac_departments')
          .insert({
            code: formData.code.toUpperCase(),
            name: formData.name,
            description: formData.description,
            manager_id: formData.manager_id || null,
            is_active: formData.is_active,
          });

        if (insertError) throw insertError;
        await auditService.logAction('create_department', 'department', null, formData.name);
      }

      setShowModal(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (deptId: string, deptName: string) => {
    if (!confirm(`Delete "${deptName}"? This action cannot be undone.`)) return;

    try {
      const { error: deleteError } = await supabase
        .from('rbac_departments')
        .delete()
        .eq('id', deptId);

      if (deleteError) throw deleteError;
      await auditService.logAction('delete_department', 'department', deptId, deptName);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete department');
    }
  };

  if (loading) return <Spinner />;

  const stats = [
    {
      label: 'Total Departments',
      value: departments.length.toString(),
      icon: Building2,
    },
    {
      label: 'Active Departments',
      value: departments.filter((d) => d.is_active).length.toString(),
      icon: Building2,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} />
        ))}
      </div>

      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search departments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
        </div>
        <button onClick={() => handleOpenModal()} className={btnPrimarySmall + ' flex items-center gap-2'}>
          <Plus className="w-4 h-4" /> New Department
        </button>
        <button onClick={() => load()} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {/* Departments Grid */}
      {filteredDepartments.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No departments found"
          description="Create a new department to get started"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDepartments.map((dept) => {
            const manager = allUsers.find((u) => u.id === dept.manager_id);
            return (
              <div
                key={dept.id}
                className="border border-slate-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <h3 className="font-semibold text-slate-900 truncate">{dept.name}</h3>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-1">{dept.code}</p>
                  </div>
                  {!dept.is_active && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-medium ml-2 flex-shrink-0">
                      Inactive
                    </span>
                  )}
                </div>

                {/* Description */}
                {dept.description && (
                  <p className="text-sm text-slate-600 mb-3 line-clamp-2">{dept.description}</p>
                )}

                {/* Manager */}
                {manager && (
                  <div className="flex items-center gap-2 mb-3 text-sm text-slate-700">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="truncate">{manager.full_name || manager.email}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-slate-200">
                  <button
                    onClick={() => handleOpenModal(dept)}
                    className="flex-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(dept.id, dept.name)}
                    className="flex-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editing ? 'Edit Department' : 'Create New Department'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Department Code *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="e.g., FIN, HR, OPS"
                  disabled={!!editing}
                  className={inputCls}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Unique identifier for this department
                </p>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Department Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Finance"
                  className={inputCls}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="What does this department do?"
                  rows={3}
                  className={inputCls}
                />
              </div>

              {/* Manager */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Department Manager
                </label>
                <select
                  value={formData.manager_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, manager_id: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">-- No Manager --</option>
                  {allUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Status */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-900">Active Department</span>
              </label>
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
                onClick={handleSave}
                disabled={saving}
                className={btnPrimarySmall + ' disabled:opacity-50'}
              >
                {saving ? 'Saving...' : editing ? 'Update Department' : 'Create Department'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
