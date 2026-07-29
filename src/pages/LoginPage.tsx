import { useState, FormEvent } from 'react';
import { LogIn, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AuthLayout } from '../components/auth/AuthLayout';

interface LoginPageProps {
  onSwitch: () => void;
  onForgot: () => void;
}

export function LoginPage({ onSwitch, onForgot }: LoginPageProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
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
    const { error: signInError } = await signIn(email.trim(), password);
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
    <AuthLayout>
      <div className="mb-5">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-slate-500 text-sm">Sign in to your client portal</p>
        <p className="mt-2 text-xs text-emerald-600 font-medium italic">"Great service starts with a single sign-in."</p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">Password</label>
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

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>Sign In <LogIn className="w-4 h-4" /></>
          )}
        </button>
      </form>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onForgot}
          className="text-sm text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
        >
          Forgot password?
        </button>
      </div>

      <p className="text-center text-sm text-slate-500 pt-1">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
        >
          Create one
        </button>
      </p>
    </AuthLayout>
  );
}
