import { useState, FormEvent } from 'react';
import { LogIn, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppLogo } from '../../lib/media';

export function AdminLoginPage() {
  const { signIn } = useAuth();
  const { url: logoUrl } = useAppLogo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error: signInError } = await signIn(email.trim(), password, rememberMe);
    setLoading(false);
    if (signInError) {
      setError(
        signInError.includes('Invalid login credentials')
          ? 'Invalid email or password. Please try again.'
          : signInError,
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900/30" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-white shadow-lg shadow-emerald-500/20 overflow-hidden">
            <img src={logoUrl} alt="Alphatek Nexus" className="w-full h-full object-contain p-1" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold uppercase tracking-wider mb-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin portal
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to access the control panel</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm"
                placeholder="admin@alphateknexus.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 border-2 border-slate-300 rounded transition-all peer-checked:bg-emerald-500 peer-checked:border-emerald-500 group-hover:border-slate-400" />
                <svg
                  className="absolute inset-0 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
                  viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M4 8l3 3 5-5" />
                </svg>
              </div>
              <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">Stay signed in on this device</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>Sign In to Admin <LogIn className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          Alphatek Nexus — Admin Portal · Authorized personnel only
        </p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-emerald-400 transition-colors">Privacy Policy</a>
          <span className="text-slate-600">·</span>
          <a href="/terms-of-service.html" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-emerald-400 transition-colors">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
