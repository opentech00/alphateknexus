import { useState, useEffect, useCallback } from 'react';
import {
  Monitor, Smartphone, Tablet, Trash2, Loader2, AlertCircle,
  Clock, MapPin, Shield, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SessionInfo {
  id: string;
  session_token: string;
  device_name: string;
  browser: string;
  os: string;
  ip_address: string;
  location: string | null;
  is_current: boolean;
  last_active_at: string;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getDeviceIcon(os: string, browser: string) {
  if (/android|ios/i.test(os)) return Smartphone;
  if (/ipad/i.test(os)) return Tablet;
  return Monitor;
}

export function SessionManagerPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'list-sessions' },
      });
      if (fnError) throw fnError;
      setSessions(data.sessions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleRevoke = async (sessionToken: string) => {
    if (!confirm('Revoke this session? The device will be signed out.')) return;
    setRevoking(sessionToken);
    try {
      const { error: fnError } = await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'revoke-session', sessionToken },
      });
      if (fnError) throw fnError;
      setSessions(prev => prev.filter(s => s.session_token !== sessionToken));
    } catch (err: any) {
      setError(err.message || 'Failed to revoke session');
    }
    setRevoking(null);
  };

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
          <p className="text-sm font-semibold text-slate-800">Active Sessions</p>
          <p className="text-xs text-slate-500 mt-0.5">Devices currently signed into your account</p>
        </div>
        <button onClick={loadSessions} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-8">
          <Monitor className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No active sessions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const Icon = getDeviceIcon(session.os, session.browser);
            return (
              <div
                key={session.id}
                className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                  session.is_current
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  session.is_current ? 'bg-emerald-100' : 'bg-slate-100'
                }`}>
                  <Icon className={`w-5 h-5 ${session.is_current ? 'text-emerald-600' : 'text-slate-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-slate-800">{session.device_name || 'Unknown device'}</p>
                    {session.is_current && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        This device
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(session.last_active_at)}
                    </span>
                    {session.ip_address && session.ip_address !== 'unknown' && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {session.ip_address}
                      </span>
                    )}
                  </div>
                </div>
                {!session.is_current && (
                  <button
                    onClick={() => handleRevoke(session.session_token)}
                    disabled={revoking === session.session_token}
                    className="flex-shrink-0 p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Revoke session"
                  >
                    {revoking === session.session_token ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
        <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          If you see a session you don't recognize, revoke it immediately and change your password.
        </p>
      </div>
    </div>
  );
}
