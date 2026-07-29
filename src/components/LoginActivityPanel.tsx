import { useState, useEffect, useCallback } from 'react';
import {
  LogIn, LogOut, ShieldCheck, ShieldX, Loader2, AlertCircle,
  Clock, MapPin, Monitor, RefreshCw, KeyRound,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ActivityEntry {
  id: string;
  event_type: string;
  ip_address: string | null;
  device_name: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

const EVENT_CONFIG: Record<string, { icon: typeof LogIn; label: string; color: string; bg: string }> = {
  login_success: { icon: LogIn, label: 'Sign in', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  login_failed: { icon: ShieldX, label: 'Failed sign-in', color: 'text-red-500', bg: 'bg-red-50' },
  logout: { icon: LogOut, label: 'Sign out', color: 'text-slate-500', bg: 'bg-slate-100' },
  '2fa_success': { icon: ShieldCheck, label: '2FA verified', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  '2fa_failed': { icon: KeyRound, label: '2FA failed', color: 'text-amber-500', bg: 'bg-amber-50' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function LoginActivityPanel() {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'list-activity' },
      });
      if (fnError) throw fnError;
      setActivity(data.activity || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load activity');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Login Activity</p>
          <p className="text-xs text-slate-500 mt-0.5">Recent authentication events on your account</p>
        </div>
        <button onClick={loadActivity} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {activity.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No login activity recorded yet</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[22px] top-2 bottom-2 w-px bg-slate-200" />

          <div className="space-y-1">
            {activity.map((entry) => {
              const config = EVENT_CONFIG[entry.event_type] || EVENT_CONFIG.login_success;
              const Icon = config.icon;
              return (
                <div key={entry.id} className="relative flex items-start gap-3 py-2.5">
                  <div className={`relative z-10 w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${config.bg} ring-4 ring-white`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{config.label}</p>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(entry.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      {entry.device_name && (
                        <span className="flex items-center gap-1">
                          <Monitor className="w-3 h-3" />
                          {entry.device_name}
                        </span>
                      )}
                      {entry.ip_address && entry.ip_address !== 'unknown' && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {entry.ip_address}
                        </span>
                      )}
                    </div>
                    {entry.error_message && (
                      <p className="text-xs text-red-500 mt-1">{entry.error_message}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center pt-2">
        Showing the last {activity.length} event{activity.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}
