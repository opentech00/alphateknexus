import { useState, FormEvent, useEffect } from 'react';
import { KeyRound, ArrowLeft, AlertCircle, Loader2, Shield, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuthLayout } from '../components/auth/AuthLayout';

interface ResetPasswordPageProps {
  onBack: () => void;
}

export function ResetPasswordPage({ onBack }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setError('Invalid or expired reset link. Please request a new one.');
      }
    });
  }, []);

  const strength = (() => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };
    return Object.values(checks).filter(Boolean).length;
  })();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (strength < 3) { setError('Please choose a stronger password'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <AuthLayout
        heroTitle="Password updated"
        heroDesc="Your account is now secured with your new password. You can sign back in and continue where you left off."
      >
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Password updated</h1>
          <p className="text-sm text-slate-500 mb-6">Your password has been changed successfully. You can now sign in with your new password.</p>
          <button onClick={onBack} className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors active:scale-[0.98]">
            Go to Login
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      heroTitle="Set a new password"
      heroDesc="Choose a strong, memorable password to secure your Alphatek Nexus account."
    >
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        Back to login
      </button>

      <div className="mb-6">
        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
          <Shield className="w-6 h-6 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
        <p className="mt-1.5 text-slate-500 text-sm">Choose a strong password for your account</p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">New Password</label>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full pl-10 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm"
              placeholder="Min 8 characters"
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password && (
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i <= strength ? (strength <= 2 ? 'bg-red-500' : strength === 3 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-200'}`} />
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">Confirm Password</label>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showPwd ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm"
              placeholder="Repeat new password"
            />
          </div>
        </div>

        <button type="submit" disabled={loading} className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98]">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Update Password <Shield className="w-4 h-4" /></>}
        </button>
      </form>
    </AuthLayout>
  );
}
