import { useState, FormEvent } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { supabase } from '../lib/supabase';

export function ChangePasswordPage() {
  const { user, employee, signOut, clearPasswordFlag } = useAuth();
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const rules = [
    { label: 'At least 8 characters', ok: newPwd.length >= 8 },
    { label: 'One uppercase letter', ok: /[A-Z]/.test(newPwd) },
    { label: 'One number', ok: /\d/.test(newPwd) },
    { label: 'Passwords match', ok: newPwd.length > 0 && newPwd === confirmPwd },
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPwd.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(newPwd) || !/\d/.test(newPwd)) { setError('Password must include an uppercase letter and a number.'); return; }
    if (newPwd !== confirmPwd) { setError('Passwords do not match.'); return; }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPwd });
    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    // Clear the must_change_password flag in DB
    if (employee) {
      await supabase
        .from('employees')
        .update({ must_change_password: false, updated_at: new Date().toISOString() })
        .eq('id', employee.id);
    }
    clearPasswordFlag();
    setDone(true);
    setLoading(false);
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Password Updated</h2>
          <p className="text-sm text-slate-500 mb-6">Your password has been changed successfully. You can now access your dashboard.</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500 rounded-2xl mb-4 shadow-lg shadow-amber-500/20">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Change Your Password</h1>
          <p className="text-sm text-slate-400 mt-1">For your security, you must set a new password before continuing.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7 sm:p-8">
          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            Signed in as <span className="font-semibold">{user?.email}</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white placeholder-slate-400"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm Password</label>
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white placeholder-slate-400"
                autoComplete="new-password"
              />
            </div>

            {/* Password rules */}
            <div className="space-y-1.5">
              {rules.map((r) => (
                <div key={r.label} className="flex items-center gap-2 text-xs">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${r.ok ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    {r.ok && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                  </span>
                  <span className={r.ok ? 'text-emerald-600 font-medium' : 'text-slate-400'}>{r.label}</span>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !rules.every((r) => r.ok)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader2 className="w-4.5 h-4.5 animate-spin" /> Updating…</> : <><Lock className="w-4.5 h-4.5" /> Update Password</>}
            </button>
          </form>

          <button
            onClick={signOut}
            className="w-full mt-4 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
