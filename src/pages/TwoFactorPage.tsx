import { useState, FormEvent, useEffect, useRef } from 'react';
import { Shield, Loader2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuthLayout } from '../components/auth/AuthLayout';

interface TwoFactorPageProps {
  email: string;
  password: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function TwoFactorPage({ email, password, onBack, onSuccess }: TwoFactorPageProps) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newCode = pasted.split('').concat(Array(6 - pasted.length).fill(''));
      setCode(newCode as string[]);
      const lastIndex = Math.min(pasted.length, 5);
      inputsRef.current[lastIndex]?.focus();
    }
  };

  const fullCode = code.join('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (fullCode.length !== 6) {
      setError('Enter all 6 digits');
      return;
    }

    setLoading(true);
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !signInData.user) {
        setError('Authentication failed. Please try again.');
        setLoading(false);
        return;
      }

      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('manage-2fa', {
        body: { action: 'verify-login', code: fullCode, userId: signInData.user.id },
      });

      if (verifyError || (verifyData && !verifyData.success)) {
        await supabase.auth.signOut();
        setError(verifyData?.error || verifyError?.message || 'Invalid verification code');
        setLoading(false);
        return;
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      heroTitle="Two-Factor Authentication"
      heroDesc="An extra layer of security for your account. Enter the 6-digit code from your authenticator app to continue."
    >
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        Back to login
      </button>

      <div className="mb-6 text-center">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Two-Factor Authentication</h1>
        <p className="mt-1.5 text-slate-500 text-sm">Enter the 6-digit code from your authenticator app</p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleCodeChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-11 h-14 sm:w-12 sm:h-14 text-center text-xl font-bold bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:bg-white outline-none transition-all"
            />
          ))}
        </div>

        <button type="submit" disabled={loading || fullCode.length !== 6} className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98]">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify <KeyRound className="w-4 h-4" /></>}
        </button>
      </form>

      <p className="text-center text-xs text-slate-400 mt-5">
        Lost your device? Use one of your backup codes instead.
      </p>
    </AuthLayout>
  );
}
