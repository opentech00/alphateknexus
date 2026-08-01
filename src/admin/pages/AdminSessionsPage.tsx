import { useState, useEffect } from 'react';
import { Loader2, ShieldCheck, Clock, Monitor } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AdminSession {
  id: string;
  user_id: string;
  login_at: string;
  logout_at: string | null;
  ip_address: string | null;
  user_agent: string;
  profiles: { full_name: string; email: string } | null;
}

export function AdminSessionsPage() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('admin_sessions')
        .select('*, profiles!admin_sessions_user_id_fkey(full_name, email)')
        .order('login_at', { ascending: false })
        .limit(50);
      setSessions((data as AdminSession[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Sessions</h1>
        <p className="text-sm text-slate-400 mt-1">Recent admin login activity</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Admin</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Login Time</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Logout Time</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Device</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  No admin sessions recorded yet.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{s.profiles?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{s.profiles?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(s.login_at).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.logout_at ? new Date(s.logout_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">
                    <span className="flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{s.user_agent}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.logout_at ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-full">
                        Ended
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
