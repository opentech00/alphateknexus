import { useState, useEffect, useRef, FormEvent } from 'react';
import { MailCheck, Loader2, AlertCircle, CheckCircle2, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuthLayout } from '../components/auth/AuthLayout';
import { useAuth } from '../contexts/AuthContext';

interface EmailVerificationPageProps {
  email: string;
  onBack: () => void;
  onVerified: () => void;
}

export function EmailVerificationPage({ email, onBack, onVerified }: EmailVerificationPageProps) {
  const { refreshVerification } = useAuth();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verified, setVerified] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-send code on mount
  useEffect(() => {
    sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const sendCode = async () => {
    setSending(true);
    setError('');
    setInfo('');
    try {
      const { error: fnError } = await supabase.functions.invoke('send-verification-code');
      if (fnError) {
        const msg = (fnError as any)?.context?.error || fnError.message || 'Failed to send code';
        setError(msg);
      } else {
        setInfo(`A 6-digit verification code has been sent to ${email}. Check your inbox and enter the code below.`);
        setResendCooldown(60);
      }
    } catch {
      setError('Could not send verification code. Please try again.');
    }
    setSending(false);
  };

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits filled
    if (value && index === 5 && newDigits.every(d => d !== '')) {
      submitCode(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = pasted.split('').concat(Array(6 - pasted.length).fill(''));
      setDigits(newDigits);
      if (pasted.length === 6) {
        submitCode(pasted);
      } else {
        inputRefs.current[pasted.length]?.focus();
      }
    }
  };

  const submitCode = async (code: string) => {
    setVerifying(true);
    setError('');
    setInfo('');
    try {
      const { error: fnError } = await supabase.functions.invoke('verify-email-code', {
        body: { code },
      });
      if (fnError) {
        const msg = (fnError as any)?.context?.error || fnError.message || 'Verification failed';
        setError(msg);
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      } else {
        setVerified(true);
        setInfo('Email verified successfully! Redirecting...');
        // Refresh the session to pick up the confirmed email
        await refreshVerification();
        setTimeout(() => onVerified(), 1500);
      }
    } catch {
      setError('Could not verify code. Please try again.');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
    setVerifying(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }
    submitCode(code);
  };

  const allFilled = digits.every(d => d !== '');

  return (
    <AuthLayout
      heroTitle="Verify your email"
      heroDesc="Enter the 6-digit code we sent to your email to activate your account."
    >
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        Back to login
      </button>

      <div className="mb-6 text-center">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors ${verified ? 'bg-emerald-50' : 'bg-emerald-50'}`}>
          {verified ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          ) : (
            <ShieldCheck className="w-8 h-8 text-emerald-600" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Verify your email</h1>
        <p className="mt-1.5 text-slate-500 text-sm leading-relaxed">
          We sent a 6-digit code to{' '}
          <span className="font-semibold text-slate-700">{email}</span>.
          Enter it below to activate your account.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {info && !error && (
        <div className="flex items-start gap-2.5 px-4 py-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{info}</span>
        </div>
      )}

      {sending && (
        <div className="flex items-center justify-center gap-2.5 px-4 py-3 mb-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Sending verification code...
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 6-digit code inputs */}
        <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={verifying || verified}
              className={`w-11 h-14 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all ${
                verified
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : digit
                    ? 'border-emerald-500 bg-emerald-50/50 text-slate-900'
                    : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-emerald-500 focus:bg-white'
              } disabled:opacity-70`}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={!allFilled || verifying || verified}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {verifying ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</>
          ) : verified ? (
            <><CheckCircle2 className="w-5 h-5" /> Verified</>
          ) : (
            <>Verify email</>
          )}
        </button>
      </form>

      <div className="mt-5 text-center">
        <p className="text-sm text-slate-500">
          Didn't receive a code?{' '}
          {resendCooldown > 0 ? (
            <span className="text-slate-400 font-medium">
              Resend in {resendCooldown}s
            </span>
          ) : (
            <button
              onClick={sendCode}
              disabled={sending || verifying || verified}
              className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Resend code
            </button>
          )}
        </p>
      </div>

      <p className="text-center text-xs text-slate-400 mt-4">
        The code expires in 10 minutes. Check your spam folder if you don't see the email.
      </p>
    </AuthLayout>
  );
}
