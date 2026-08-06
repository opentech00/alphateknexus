import { useState, FormEvent } from 'react';
import { LogIn, Eye, EyeOff, AlertCircle, Loader2, User } from 'lucide-react';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { useAppLogo } from '../../lib/media';

export function LoginPage() {
  const { signIn } = useAuth();
  const { url: logoUrl } = useAppLogo();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!employeeId.trim() || !password.trim()) {
      setError('Please enter your Employee ID and password.');
      return;
    }
    setLoading(true);
    const { error: signInError } = await signIn(employeeId.trim(), password);
    setLoading(false);
    if (signInError) {
      setError(
        signInError.includes('Invalid login credentials')
          ? 'Invalid Employee ID or password. Please try again.'
          : signInError,
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-8">
      {/* Background accent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 bg-white shadow-lg shadow-emerald-500/10 overflow-hidden">
            <img
              src={logoUrl}
              alt="Alphatek Nexus"
              className="w-full h-full object-contain p-1"
            />
          </div>
          <h1 className="text-2xl font-bold text-white">Alphatek Nexus</h1>
          <p className="text-sm text-slate-400 mt-1">Employee Portal — Sign in to access your dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-7 sm:p-8">
          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee ID</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <User className="w-4.5 h-4.5" />
                </span>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                  placeholder="e.g. ATN-0001"
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-mono tracking-wide focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white placeholder-slate-400 placeholder:font-sans placeholder:tracking-normal"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors bg-white placeholder-slate-400"
                  autoComplete="current-password"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="w-4.5 h-4.5 animate-spin" /> Signing in…</>
              ) : (
                <><LogIn className="w-4.5 h-4.5" /> Sign In</>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Use the Employee ID and password provided by your administrator.
          </p>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          © {new Date().getFullYear()} Alphatek Nexus. All rights reserved.
        </p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-emerald-600 transition-colors">Privacy Policy</a>
          <span className="text-slate-600">·</span>
          <a href="/terms-of-service.html" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-emerald-600 transition-colors">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
