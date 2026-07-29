import { useState, useMemo, FormEvent } from 'react';
import { Eye, EyeOff, ArrowRight, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AuthLayout, AuthSlide } from '../components/auth/AuthLayout';

interface RegisterPageProps {
  onNavigate: (page: string) => void;
}

const slides: AuthSlide[] = [
  {
    src: '/login-cleaning-janitorial.webp',
    title: 'Spotless spaces, productive teams.',
    desc: 'Professional deep cleaning, office maintenance, carpet care, and full sanitization on demand.',
    badge: 'CLEANING',
  },
  {
    src: '/login-clearing-forwarding.webp',
    title: 'Ship smarter, arrive faster.',
    desc: 'Complete customs handling, port clearance, real-time tracking, and insurance coverage for your cargo.',
    badge: 'LOGISTICS',
  },
  {
    src: '/login-procurement.webp',
    title: 'Buy better, save more.',
    desc: 'Strategic sourcing, vendor management, cost analysis, and supply chain optimization.',
    badge: 'PROCUREMENT',
  },
  {
    src: '/login-private-security.webp',
    title: 'Protection that never sleeps.',
    desc: 'Armed & unarmed guards, 24/7 CCTV monitoring, access control, and event security deployment.',
    badge: 'SECURITY',
  },
  {
    src: '/login-smart-sort.webp',
    title: 'Sort smart, live cleaner.',
    desc: 'Scheduled waste pickups, bin subscriptions, recycling programs, and real-time impact tracking for a greener city.',
    badge: 'SMART SORT',
  },
];

function getPasswordStrength(password: string) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  let label = '';
  let color = '';
  if (score <= 1) { label = 'Very weak'; color = 'bg-red-500'; }
  else if (score === 2) { label = 'Weak'; color = 'bg-orange-500'; }
  else if (score === 3) { label = 'Fair'; color = 'bg-amber-500'; }
  else if (score === 4) { label = 'Strong'; color = 'bg-emerald-500'; }
  else { label = 'Very strong'; color = 'bg-emerald-600'; }
  return { checks, score, label, color };
}

export function RegisterPage({ onNavigate }: RegisterPageProps) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    if (!email.trim()) { setError('Please enter your email address'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (strength.score < 3) { setError('Please choose a stronger password'); return; }

    setLoading(true);
    const { error } = await signUp(email.trim().toLowerCase(), password, fullName.trim());
    if (error) {
      setError(error);
      setLoading(false);
    } else {
      onNavigate('dashboard');
    }
  };

  return (
    <AuthLayout slides={slides}>
      <div className="mb-4">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-slate-500 text-sm">Get started with Alphatek Nexus today</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1.5">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm"
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1.5">Email</label>
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
          <label className="block text-sm font-semibold text-slate-800 mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm pr-12"
              placeholder="Min 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>

          {password && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-all duration-300 ${
                        i <= strength.score ? strength.color : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-xs font-medium ${
                  strength.score <= 2 ? 'text-red-500' : strength.score === 3 ? 'text-amber-500' : 'text-emerald-600'
                }`}>
                  {strength.label}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {[
                  { key: 'length', label: '8+ characters' },
                  { key: 'uppercase', label: 'Uppercase' },
                  { key: 'lowercase', label: 'Lowercase' },
                  { key: 'number', label: 'Number' },
                  { key: 'special', label: 'Special char' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-1">
                    {strength.checks[key as keyof typeof strength.checks] ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <X className="w-3 h-3 text-slate-300" />
                    )}
                    <span className={`text-xs ${
                      strength.checks[key as keyof typeof strength.checks] ? 'text-slate-600' : 'text-slate-400'
                    }`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pt-0.5">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>Create Account <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>

        <p className="text-center text-sm text-slate-500 pt-0.5">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
          >
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}
