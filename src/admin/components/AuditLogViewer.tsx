import { useState, useEffect, useMemo } from 'react';
import {
  Search, RefreshCw, Calendar, Filter, Download, Eye, ChevronDown,
  AlertCircle, CheckCircle, Clock, User,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { auditService } from '../../lib/rbacService';
import type { AuditLog } from '../../types/rbac';
import { Spinner, ErrorBanner, EmptyState } from '../components/ui';

const inputCls =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create_role: { label: 'Created Role', color: 'bg-green-100 text-green-700' },
  update_role: { label: 'Updated Role', color: 'bg-blue-100 text-blue-700' },
  delete_role: { label: 'Deleted Role', color: 'bg-red-100 text-red-700' },
  assign_role: { label: 'Assigned Role', color: 'bg-purple-100 text-purple-700' },
  remove_role: { label: 'Removed Role', color: 'bg-orange-100 text-orange-700' },
  manage_permission: { label: 'Changed Permissions', color: 'bg-amber-100 text-amber-700' },
  manage_finance: { label: 'Finance Operation', color: 'bg-indigo-100 text-indigo-700' },
  delete_booking: { label: 'Deleted Booking', color: 'bg-red-100 text-red-700' },
  delete_user: { label: 'Deleted User', color: 'bg-red-100 text-red-700' },
  update_user: { label: 'Updated User', color: 'bg-blue-100 text-blue-700' },
  default: { label: 'Action', color: 'bg-slate-100 text-slate-700' },
};

interface AuditLogFilters {
  search: string;
  action: string;
  resource_type: string;
  status: string;
  date_from: string;
  date_to: string;
}

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AuditLogFilters>({
    search: '',
    action: '',
    resource_type: '',
    status: '',
    date_from: '',
    date_to: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const auditLogs = await auditService.getAuditLogs({
        limit: 500,
        date_from: filters.date_from ? new Date(filters.date_from) : undefined,
        date_to: filters.date_to ? new Date(filters.date_to) : undefined,
        action: filters.action || undefined,
        resource_type: filters.resource_type || undefined,
        status: (filters.status as 'success' | 'failure') || undefined,
      });
      setLogs(auditLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return (
          log.action.toLowerCase().includes(searchLower) ||
          log.resource_name?.toLowerCase().includes(searchLower) ||
          log.resource_id?.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [logs, filters.search]);

  const handleFilterChange = (key: keyof AuditLogFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      action: '',
      resource_type: '',
      status: '',
      date_from: '',
      date_to: '',
    });
  };

  const handleExport = async () => {
    try {
      const exportLogs = await auditService.exportAuditLogs();
      
      const csv = [
        ['Timestamp', 'User', 'Action', 'Resource Type', 'Resource ID', 'Status', 'Result'].join(','),
        ...exportLogs.map((log) =>
          [
            new Date(log.created_at).toLocaleString(),
            log.user_id || 'System',
            log.action,
            log.resource_type,
            log.resource_id || '-',
            log.status,
            log.error_message || 'Success',
          ]
            .map((v) => `"${v}"`)
            .join(',')
        ),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export logs');
    }
  };

  const getActionBadge = (action: string) => {
    return ACTION_LABELS[action] || ACTION_LABELS['default'];
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Search and Filter Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search logs by action, resource, or ID..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className={inputCls}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2.5 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            title="Toggle filters"
          >
            <Filter className="w-5 h-5 text-slate-600" />
          </button>
          <button
            onClick={() => load()}
            className="p-2.5 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          >
            <RefreshCw className="w-5 h-5 text-slate-600" />
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2.5 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm transition-colors"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>

        {/* Filters (Collapsible) */}
        {showFilters && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Action Type
                </label>
                <select
                  value={filters.action}
                  onChange={(e) => handleFilterChange('action', e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- All --</option>
                  <option value="create_role">Create Role</option>
                  <option value="update_role">Update Role</option>
                  <option value="delete_role">Delete Role</option>
                  <option value="assign_role">Assign Role</option>
                  <option value="remove_role">Remove Role</option>
                  <option value="manage_permission">Manage Permission</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Resource Type
                </label>
                <select
                  value={filters.resource_type}
                  onChange={(e) => handleFilterChange('resource_type', e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- All --</option>
                  <option value="role">Role</option>
                  <option value="user_role">User Role</option>
                  <option value="permission">Permission</option>
                  <option value="booking">Booking</option>
                  <option value="user">User</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- All --</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => handleFilterChange('date_from', e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => handleFilterChange('date_to', e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    resetFilters();
                    load();
                  }}
                  className="px-3 py-2 w-full text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors text-sm"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {/* Results */}
      <div>
        <p className="text-sm text-slate-600 mb-3">
          Showing {filteredLogs.length} of {logs.length} audit logs
        </p>

        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No audit logs"
            description="No logs match your search criteria"
          />
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => {
              const actionBadge = getActionBadge(log.action);
              const isExpanded = expandedLog === log.id;

              return (
                <div
                  key={log.id}
                  className="border border-slate-200 rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow"
                >
                  {/* Log Header */}
                  <div
                    className="p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    {log.status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${actionBadge.color}`}>
                          {actionBadge.label}
                        </span>
                        <span className="text-sm font-medium text-slate-900">
                          {log.resource_name || log.resource_id || log.resource_type}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-500">
                          {log.user_id ? `User ID: ${log.user_id.substring(0, 8)}...` : 'System'}
                        </span>
                      </div>
                    </div>

                    <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-3">
                      {/* Basic Info */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-1">Action</p>
                          <p className="font-medium text-slate-900">{log.action}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-1">Resource Type</p>
                          <p className="font-medium text-slate-900">{log.resource_type}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-1">Resource ID</p>
                          <p className="font-mono text-slate-700 text-xs break-all">
                            {log.resource_id || '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-1">Status</p>
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            log.status === 'success'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                      </div>

                      {/* Changes */}
                      {log.changes && (
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-2">Changes</p>
                          <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-white p-2 rounded border border-slate-200">
                            {log.changes.before && (
                              <div>
                                <p className="text-slate-500 mb-1">Before:</p>
                                <pre className="text-slate-700 whitespace-pre-wrap break-words">
                                  {JSON.stringify(log.changes.before, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.changes.after && (
                              <div>
                                <p className="text-slate-500 mb-1">After:</p>
                                <pre className="text-slate-700 whitespace-pre-wrap break-words">
                                  {JSON.stringify(log.changes.after, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Error Message */}
                      {log.error_message && (
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-1">Error</p>
                          <p className="text-sm text-red-700 bg-red-50 p-2 rounded font-mono">
                            {log.error_message}
                          </p>
                        </div>
                      )}

                      {/* Metadata */}
                      {log.metadata && (
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-2">Metadata</p>
                          <pre className="text-xs bg-white p-2 rounded border border-slate-200 overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* IP Address */}
                      {log.ip_address && (
                        <div className="text-xs text-slate-500">
                          <p className="text-xs font-medium text-slate-600 mb-1">IP Address</p>
                          <p>{log.ip_address}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
