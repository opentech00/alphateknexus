import { useEffect, useState } from 'react';
import { Check, Loader2, Shield, Smartphone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function SecuritySettingsPanel({ onOpenSessions }: { onOpenSessions?: () => void }) {
  const { user, signOutAll } = useAuth();
  const [twoFaOn, setTwoFaOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('user_2fa')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      setTwoFaOn(data?.enabled === true);
    })();
  }, [user]);

  const revoke = async () => {
    if (!window.confirm('Sign out this admin account on every device? You will need to sign in again here.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    const { error: err } = await signOutAll();
    if (err) setError(err);
    else setMessage('All sessions were revoked.');
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Admin account security</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Secrets and API keys are not stored in this dashboard. Keep them in Supabase and Vercel only.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-800">Two-factor authentication</p>
            <p className="text-xs text-slate-500">Required for this admin login when enabled on your account.</p>
          </div>
        </div>
        <span className={`text-xs font-semibold uppercase tracking-wide ${twoFaOn ? 'text-emerald-600' : 'text-amber-600'}`}>
          {twoFaOn == null ? '…' : twoFaOn ? 'On' : 'Off'}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        Idle timeout for admins is 15 minutes. Client sessions time out after 30 minutes.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700 flex items-center gap-1.5"><Check className="w-4 h-4" /> {message}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void revoke()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
          Sign out all devices
        </button>
        {onOpenSessions && (
          <button
            type="button"
            onClick={onOpenSessions}
            className="px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            View admin sessions
          </button>
        )}
      </div>
    </div>
  );
}
