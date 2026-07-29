import { useState, FormEvent } from 'react';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuthLayout } from '../components/auth/AuthLayout';

interface ForgotPasswordPageProps {
  onBack: () => void;
}

export function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter your email address');
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/?reset=true`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setSent(true);
    }
  };

  return (
    <AuthLayout
      heroTitle="Reset your password"
      heroDesc="We'll send a secure password reset link to your email so you can get back into your account."
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to login
      </button>

      {sent ? (
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            We've sent a password reset link to <span className="font-semibold text-slate-700">{email}</span>.
            Click the link in the email to set a new password.
          </p>
          <p className="text-xs text-slate-400 mt-4">
            Didn't receive an email? Check your spam folder or{' '}
            <button onClick={() => { setSent(false); setEmail(''); }} className="text-emerald-600 font-semibold hover:text-emerald-700">
              try again
            </button>
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Forgot password?</h1>
            <p className="mt-1.5 text-slate-500 text-sm">Enter your email and we'll send you a reset link</p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>Send Reset Link <Mail className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
