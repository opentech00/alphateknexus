import { useState, useEffect, useCallback } from 'react';
import {
  Database, Download, RefreshCw, Trash2, FileJson, CheckCircle2,
  AlertTriangle, Clock, HardDrive, Table2, Loader2, Archive,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, Card, ErrorBanner } from '../components/ui';

interface BackupRecord {
  id: string;
  created_by: string | null;
  tables_included: string[];
  table_counts: Record<string, number>;
  file_size_bytes: number;
  status: 'completed' | 'failed';
  storage_path: string | null;
  error_message: string | null;
  created_at: string;
}

interface TableInfo {
  name: string;
  rowCount: number;
}

const TRACKED_TABLES = [
  'profiles', 'services', 'bookings', 'booking_presets', 'booking_status_history',
  'documents', 'favorites', 'messages', 'notifications', 'reviews',
  'referrals', 'user_preferences',
  'smart_sort_plans', 'smart_sort_subscriptions', 'smart_sort_pickups',
  'smart_sort_invoices', 'smart_sort_payments',
  'wallet_transactions', 'procurement_requests',
  'employees', 'hr_roles', 'hr_role_permissions', 'id_cards',
  'employee_activity_logs',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function BackupPage() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [tableInfo, setTableInfo] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('backup_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (fetchErr) {
      setError('Failed to load backup history');
    } else {
      setBackups((data as BackupRecord[]) || []);
    }
    setLoading(false);
  }, []);

  const fetchTableInfo = useCallback(async () => {
    const info: TableInfo[] = [];
    for (const table of TRACKED_TABLES) {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      info.push({ name: table, rowCount: count || 0 });
    }
    setTableInfo(info);
  }, []);

  useEffect(() => {
    fetchBackups();
    fetchTableInfo();
  }, [fetchBackups, fetchTableInfo]);

  const handleCreateBackup = async () => {
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-backup`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Backup failed (${response.status})`);
      }

      const result = await response.json();
      const totalRows = result.total_rows || 0;
      setSuccess(`Backup created successfully — ${totalRows.toLocaleString()} rows across ${result.table_counts ? Object.keys(result.table_counts).length : 0} tables (${formatBytes(result.file_size_bytes || 0)}).`);
      await fetchBackups();
      await fetchTableInfo();
    } catch (err: any) {
      setError(err.message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (record: BackupRecord) => {
    if (!record.storage_path) return;
    try {
      const { data, error: dlError } = await supabase.storage
        .from('backups')
        .download(record.storage_path);

      if (dlError || !data) throw dlError || new Error('Download failed');

      const url = URL.createObjectURL(data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = record.storage_path.split('/').pop() || 'backup.json';
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Download failed');
    }
  };

  const handleDelete = async (id: string) => {
    const record = backups.find(b => b.id === id);
    if (record?.storage_path) {
      await supabase.storage.from('backups').remove([record.storage_path]);
    }
    await supabase.from('backup_history').delete().eq('id', id);
    setDeleteId(null);
    await fetchBackups();
  };

  const totalRows = tableInfo.reduce((sum, t) => sum + t.rowCount, 0);
  const lastBackup = backups.find(b => b.status === 'completed');

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Data Backup"
        description="Export and manage full database backups"
        icon={Database}
        actions={
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            {creating ? 'Creating…' : 'Create Backup'}
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {success && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Table2 className="w-4 h-4 text-emerald-600" />
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Tables</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{TRACKED_TABLES.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-blue-600" />
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Total Rows</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalRows.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Archive className="w-4 h-4 text-amber-600" />
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Backups</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{backups.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-slate-600" />
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Last Backup</span>
          </div>
          <p className="text-sm font-bold text-slate-900 leading-tight pt-1">
            {lastBackup ? formatDate(lastBackup.created_at) : 'Never'}
          </p>
        </Card>
      </div>

      {/* Table overview */}
      <Card className="p-5 mb-6">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-slate-500" />
          Data Overview
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {tableInfo.map(t => (
            <div key={t.name} className="px-3 py-2.5 bg-slate-50 rounded-lg">
              <p className="text-xs font-medium text-slate-500 truncate">{t.name}</p>
              <p className="text-sm font-bold text-slate-900">{t.rowCount.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Backup history */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileJson className="w-4 h-4 text-slate-500" />
            Backup History
          </h2>
          <button
            onClick={fetchBackups}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          </div>
        ) : backups.length === 0 ? (
          <div className="py-16 text-center">
            <Archive className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No backups yet. Click "Create Backup" to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Tables</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Rows</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Size</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => {
                  const totalBackupRows = b.table_counts
                    ? Object.values(b.table_counts).reduce((s: number, c: number) => s + c, 0)
                    : 0;
                  return (
                    <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{formatDate(b.created_at)}</td>
                      <td className="px-5 py-3">
                        {b.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Failed
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{b.tables_included?.length || 0}</td>
                      <td className="px-5 py-3 text-slate-600">{totalBackupRows.toLocaleString()}</td>
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{formatBytes(b.file_size_bytes)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {b.status === 'completed' && b.storage_path && (
                            <button
                              onClick={() => handleDownload(b)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          {deleteId === b.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(b.id)}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setDeleteId(null)}
                                className="px-2 py-1 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteId(b.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
