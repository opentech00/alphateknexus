# Guide 1 — Dedicated Admin Login Page on the Admin Subdomain

## Goal

Give `https://admin.alphateknexus.com/` its own dedicated login screen — separate from the client portal login — so admins sign in directly on the admin subdomain instead of being redirected to the client portal.

---

## Why This Matters Right Now

Currently, `AdminApp.tsx` checks `useAuth()` and if `!user || !isAdmin`, it shows a plain "Access Denied" screen with a link to `/` (the client portal). That means an admin has to:

1. Go to `alphateknexus.com`
2. Log in through the client portal
3. Manually navigate to `admin.alphateknexus.com`

This is clunky and insecure. The admin subdomain should have its own login form.

---

## Step-by-Step Implementation

### Step 1 — Create `AdminLoginPage`

Create a new file: `src/admin/pages/AdminLoginPage.tsx`

```tsx
import { useState, FormEvent } from 'react';
import { LogIn, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function AdminLoginPage() {
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
    const { error: signInError, needs2FA } = await signIn(email.trim(), password);
    setLoading(false);
    if (signInError) {
      setError(
        signInError.includes('Invalid login credentials')
          ? 'Invalid email or password. Please try again.'
          : signInError
      );
    }
    // If 2FA is needed, the AuthContext will set needs2FA=true
    // and AdminApp will render the 2FA page automatically.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900/30" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-500 rounded-2xl mb-4 shadow-lg shadow-emerald-500/30">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to access the control panel</p>
        </div>

        {/* Login Card */}
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

        <p className="text-center text-slate-500 text-xs mt-6">
          Alphatek Nexus — Admin Portal · Authorized personnel only
        </p>
      </div>
    </div>
  );
}
```

### Step 2 — Update `AdminApp.tsx` to show the login page

Replace the "Access Denied" block in `AdminApp.tsx`:

**Before (lines ~50–65):**
```tsx
if (!user || !isAdmin) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 mb-6">{user ? 'Your account does not have admin privileges.' : 'You must be logged in to access the admin dashboard.'}</p>
        <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors text-sm">
          Go to Login
        </a>
      </div>
    </div>
  );
}
```

**After:**
```tsx
import { AdminLoginPage } from './pages/AdminLoginPage';

// ...inside AdminContent():

if (!user) {
  return <AdminLoginPage />;
}

if (!isAdmin) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-red-50 rounded-full mb-4">
          <ShieldCheck className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 mb-6">Your account does not have admin privileges.</p>
        <button
          onClick={() => signOut()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors text-sm"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
```

### Step 3 — Handle 2FA on the admin subdomain

The existing `TwoFactorPage` component already works with the shared `AuthContext`. To use it in the admin app, add this check **before** the `AdminLoginPage` render:

```tsx
import { TwoFactorPage } from '../pages/TwoFactorPage';

// ...inside AdminContent(), after loading check:

if (needs2FA) {
  return (
    <TwoFactorPage
      email={pending2FAEmail}
      password={pending2FAPassword}
      onBack={() => clear2FA()}
      onSuccess={() => clear2FA()}
    />
  );
}

if (!user) {
  return <AdminLoginPage />;
}
```

You'll need to pull `needs2FA`, `pending2FAEmail`, `pending2FAPassword`, `clear2FA`, and `signOut` from `useAuth()`:

```tsx
const { user, isAdmin, loading, needs2FA, pending2FAEmail, pending2FAPassword, clear2FA, signOut } = useAuth();
```

### Step 4 — Verify the flow

1. Visit `https://admin.alphateknexus.com/` while logged out → you see the admin login form
2. Enter admin credentials → you land on the admin dashboard overview
3. Enter non-admin credentials → you see "Access Denied" with a sign-out button
4. If 2FA is enabled → the 2FA verification screen appears

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Reuse `AuthContext` instead of creating a separate one | The Supabase session is shared across subdomains (same project, same cookies). Creating a second auth context would cause token conflicts. |
| Admin login page has a dark theme | Visually distinguishes the admin portal from the client portal's light theme, reinforcing "you are in a privileged area." |
| Non-admin users see "Access Denied" + sign out | Prevents confusion — they know they logged in but lack privileges, and can sign out to try a different account. |
| 2FA reuses the existing `TwoFactorPage` | No need to duplicate the TOTP verification logic. The shared `AuthContext` already manages the 2FA flow state. |
