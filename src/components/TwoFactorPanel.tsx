import { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, ShieldOff, Loader2, AlertCircle, CheckCircle2,
  KeyRound, Copy, Check, X, Smartphone, Lock, Download,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Step = 'idle' | 'loading' | 'show-qr' | 'verifying' | 'enabled' | 'backup-codes';

export function TwoFactorPanel() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('idle');
  const [secret, setSecret] = useState('');
  const [otpAuthUri, setOtpAuthUri] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-2fa', {
        body: { action: 'check' },
      });
      if (fnError) throw fnError;
      setEnabled(!!data?.enabled);
    } catch {
      setEnabled(false);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const handleSetup = async () => {
    setError('');
    setStep('loading');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-2fa', {
        body: { action: 'setup' },
      });
      if (fnError) throw fnError;
      setSecret(data.secret);
      setOtpAuthUri(data.otpAuthUri);
      setStep('show-qr');
    } catch (err: any) {
      setError(err.message || 'Failed to start 2FA setup');
      setStep('idle');
    }
  };

  const handleVerify = async () => {
    setError('');
    if (verifyCode.length !== 6) {
      setError('Enter all 6 digits');
      return;
    }
    setStep('loading');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-2fa', {
        body: { action: 'verify', code: verifyCode },
      });
      if (fnError) throw fnError;
      if (data.backupCodes) {
        setBackupCodes(data.backupCodes);
        setEnabled(true);
        setStep('backup-codes');
      } else {
        setEnabled(true);
        setStep('enabled');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
      setStep('verifying');
    }
  };

  const handleDisable = async () => {
    if (!confirm('Disable two-factor authentication? Your account will be less secure.')) return;
    setError('');
    setStep('loading');
    try {
      const { error: fnError } = await supabase.functions.invoke('manage-2fa', {
        body: { action: 'disable' },
      });
      if (fnError) throw fnError;
      setEnabled(false);
      setStep('idle');
      setSecret('');
      setOtpAuthUri('');
      setBackupCodes([]);
    } catch (err: any) {
      setError(err.message || 'Failed to disable 2FA');
      setStep('idle');
    }
  };

  const copySecret = async () => {
    await navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const copyBackupCodes = async () => {
    await navigator.clipboard.writeText(backupCodes.join('\n'));
    setCodesCopied(true);
    setTimeout(() => setCodesCopied(false), 2000);
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
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Status banner */}
      <div className={`rounded-2xl p-5 border-2 ${enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-emerald-100' : 'bg-slate-200'}`}>
            {enabled ? <ShieldCheck className="w-6 h-6 text-emerald-600" /> : <ShieldOff className="w-6 h-6 text-slate-500" />}
          </div>
          <div className="flex-1">
            <p className={`font-semibold text-sm ${enabled ? 'text-emerald-800' : 'text-slate-700'}`}>
              {enabled ? 'Two-Factor Authentication is ON' : 'Two-Factor Authentication is OFF'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {enabled
                ? 'Your account is protected with an authenticator app.'
                : 'Add an extra layer of security to your account.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Idle: Not enabled ── */}
      {step === 'idle' && !enabled && (
        <div className="space-y-4">
          <div className="space-y-3">
            {[
              { icon: Smartphone, text: 'Use Google Authenticator, Authy, or any TOTP app' },
              { icon: KeyRound, text: 'Scan a QR code or enter a secret manually' },
              { icon: Lock, text: 'Get 8 backup codes for account recovery' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-slate-500" />
                </div>
                <p className="text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
          <button onClick={handleSetup} className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
            <Shield className="w-4 h-4" />
            Enable 2FA
          </button>
        </div>
      )}

      {/* ── Idle: Already enabled ── */}
      {step === 'idle' && enabled && (
        <button onClick={handleDisable} className="w-full py-3 bg-red-50 text-red-600 font-semibold rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2 border border-red-200">
          <ShieldOff className="w-4 h-4" />
          Disable 2FA
        </button>
      )}

      {/* ── Loading ── */}
      {step === 'loading' && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      )}

      {/* ── Show QR code ── */}
      {step === 'show-qr' && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-800 mb-3">Scan this QR code</p>
            <div className="inline-block p-4 bg-white border-2 border-slate-200 rounded-2xl">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpAuthUri)}`}
                alt="2FA QR Code"
                className="w-48 h-48 mx-auto"
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500 text-center mb-2">Or enter this code manually:</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="font-mono text-sm font-bold text-slate-800 break-all select-all">{secret}</p>
              </div>
              <button onClick={copySecret} className="flex-shrink-0 w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                {copiedSecret ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-sm font-semibold text-slate-800 mb-2">Enter the 6-digit code from your app</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3.5 text-center text-2xl font-bold tracking-widest bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setStep('idle'); setSecret(''); setOtpAuthUri(''); setVerifyCode(''); }} className="flex-1 py-3 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button onClick={handleVerify} disabled={verifyCode.length !== 6} className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50">
              Verify & Enable
            </button>
          </div>
        </div>
      )}

      {/* ── Backup codes ── */}
      {step === 'backup-codes' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              Save these backup codes securely. You can use them to access your account if you lose your authenticator device. Each code can only be used once.
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <div key={i} className="px-3 py-2 bg-white rounded-lg border border-slate-100 text-center">
                  <p className="font-mono text-sm font-bold text-slate-800">{code}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={copyBackupCodes} className="flex-1 py-3 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
              {codesCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {codesCopied ? 'Copied!' : 'Copy Codes'}
            </button>
            <button onClick={() => setStep('enabled')} className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Enabled confirmation ── */}
      {step === 'enabled' && (
        <div className="text-center py-4">
          <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <p className="font-semibold text-slate-800 mb-1">2FA is now active</p>
          <p className="text-xs text-slate-500 mb-4">You'll need a verification code on every login.</p>
          <button onClick={() => setStep('idle')} className="px-5 py-2.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors text-sm">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
