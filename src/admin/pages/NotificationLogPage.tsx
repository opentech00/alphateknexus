import { useState, useEffect, useCallback } from 'react';
import { Mail, Bell, Smartphone, CheckCircle2, XCircle, MinusCircle, Loader2, RefreshCw, Filter } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { supabase } from '../../lib/supabase';

interface OutboxRow {
  id: string;
  user_id: string;
  recipient_role: string;
  event_type: string;
  title: string;
  body: string;
  category: string;
  metadata: Record<string, unknown>;
  in_app_sent: boolean;
  email_sent: boolean;
  push_sent: boolean;
  in_app_skipped: boolean;
  email_skipped: boolean;
  push_skipped: boolean;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

type FilterChannel = 'all' | 'in_app' | 'email' | 'push';
type FilterStatus = 'all' | 'sent' | 'failed' | 'skipped' | 'pending';

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ChannelIcon({ sent, skipped, icon: Icon }: { sent: boolean; skipped: boolean; icon: typeof Mail }) {
  if (sent) return <Icon className="w-4 h-4 text-emerald-500" />;
  if (skipped) return <Icon className="w-4 h-4 text-slate-300" />;
  return <Icon className="w-4 h-4 text-slate-400" />;
}

function StatusBadge({ row }: { row: OutboxRow }) {
  if (!row.processed_at) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-full">
        <Loader2 className="w-3 h-3 animate-spin" /> Pending
      </span>
    );
  }
  const hasError = !!row.error_message;
  const anySent = row.in_app_sent || row.email_sent || row.push_sent;
  if (hasError && !anySent) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-700 bg-red-50 rounded-full">
        <XCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  if (anySent) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> Sent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-full">
      <MinusCircle className="w-3 h-3" /> Skipped
    </span>
  );
}

export function NotificationLogPage() {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<FilterChannel>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('notification_outbox')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (roleFilter !== 'all') {
        query = query.eq('recipient_role', roleFilter);
      }

      const { data } = await query;
      if (data) setRows(data as OutboxRow[]);
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = rows.filter((row) => {
    if (channelFilter !== 'all') {
      if (channelFilter === 'in_app' && !row.in_app_sent && !row.in_app_skipped) return false;
      if (channelFilter === 'email' && !row.email_sent && !row.email_skipped) return false;
      if (channelFilter === 'push' && !row.push_sent && !row.push_skipped) return false;
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending' && row.processed_at) return false;
      if (statusFilter === 'sent' && !(row.in_app_sent || row.email_sent || row.push_sent)) return false;
      if (statusFilter === 'failed' && (!row.error_message || (row.in_app_sent || row.email_sent || row.push_sent))) return false;
      if (statusFilter === 'skipped' && row.processed_at && (row.in_app_sent || row.email_sent || row.push_sent)) return false;
    }
    return true;
  });

  const stats = {
    total: rows.length,
    sent: rows.filter((r) => r.in_app_sent || r.email_sent || r.push_sent).length,
    failed: rows.filter((r) => r.error_message && !(r.in_app_sent || r.email_sent || r.push_sent)).length,
    pending: rows.filter((r) => !r.processed_at).length,
  };

  return (
    <div>
      <PageHeader
        title="Notification Log"
        description="Audit trail of all notifications sent across the platform"
        icon={Bell}
      />

      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Sent</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.sent}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Failed</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{stats.failed}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Pending</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">{stats.pending}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="all">All Roles</option>
            <option value="client">Clients</option>
            <option value="admin">Admins</option>
            <option value="employee">Employees</option>
            <option value="field">Field Workers</option>
          </select>
        </div>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as FilterChannel)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="all">All Channels</option>
          <option value="in_app">In-App</option>
          <option value="email">Email</option>
          <option value="push">Push</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="all">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
          <option value="pending">Pending</option>
        </select>
        <button
          onClick={fetchRows}
          className="ml-auto flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Bell className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">No notifications found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Recipient</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">In-App</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Push</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-slate-600">{row.event_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        row.recipient_role === 'client' ? 'bg-blue-50 text-blue-700' :
                        row.recipient_role === 'admin' ? 'bg-purple-50 text-purple-700' :
                        row.recipient_role === 'employee' ? 'bg-emerald-50 text-emerald-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {row.recipient_role}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-sm text-slate-700 truncate">{row.title}</p>
                      <p className="text-xs text-slate-400 truncate">{row.body}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ChannelIcon sent={row.in_app_sent} skipped={row.in_app_skipped} icon={Bell} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ChannelIcon sent={row.email_sent} skipped={row.email_skipped} icon={Mail} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ChannelIcon sent={row.push_sent} skipped={row.push_skipped} icon={Smartphone} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge row={row} />
                      {row.error_message && (
                        <p className="text-xs text-red-400 mt-1 max-w-xs truncate" title={row.error_message}>
                          {row.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400">{timeAgo(row.created_at)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
