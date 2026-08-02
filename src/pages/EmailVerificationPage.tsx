import { useState, useEffect } from 'react';
import { MailCheck, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuthLayout } from '../components/auth/AuthLayout';

interface EmailVerificationPageProps {
  email: string;
  onBack: () => void;
  onVerified: () => void;
}

export function EmailVerificationPage({ email, onBack, onVerified }: EmailVerificationPageProps) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.user?.email_confirmed_at) {
        clearInterval(interval);
        onVerified();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [onVerified]);

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (resendError) {
        setError(resendError.message);
      } else {
        setResent(true);
        setTimeout(() => setResent(false), 5000);
      }
    } catch {
      setError('Failed to resend verification email. Please try again.');
    }
    setResending(false);
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.user?.email_confirmed_at) {
        onVerified();
      } else {
        setError('Your email has not been verified yet. Please check your inbox and click the verification link.');
      }
    } catch {
      setError('Could not check verification status. Please try again.');
    }
    setChecking(false);
  };

  return (
    <AuthLayout
      heroTitle="Verify your email"
      heroDesc="We sent a verification link to your email address. Click it to activate your account."
    >
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        Back to login
      </button>

      <div className="mb-6 text-center">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MailCheck className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Verify your email</h1>
        <p className="mt-1.5 text-slate-500 text-sm leading-relaxed">
          We sent a verification link to{' '}
          <span className="font-semibold text-slate-700">{email}</span>.
          Click the link in the email to activate your account.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {resent && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Verification email sent. Check your inbox.
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={handleCheckNow}
          disabled={checking}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {checking ? <Loader2 className="w-5 h-5 animate-spin" /> : <>I've verified my email</>}
        </button>

        <button
          onClick={handleResend}
          disabled={resending}
          className="w-full py-3 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
          Resend verification email
        </button>
      </div>

      <p className="text-center text-xs text-slate-400 mt-5">
        Already verified? Click "I've verified my email" to continue.
      </p>
    </AuthLayout>
  );
}
