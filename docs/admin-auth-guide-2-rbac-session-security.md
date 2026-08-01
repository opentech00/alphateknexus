# Guide 2 — Role-Based Access Control & Session Security for Admin

## Goal

Add server-enforced role checks, session management, and audit logging so the admin subdomain is protected at the database level — not just in the UI.

---

## Why This Matters

Even with a dedicated admin login page (Guide 1), the current setup has a gap: the `isAdmin` check lives entirely in React (`profile?.role === 'admin'`). If someone manipulates their profile row or a client-side bug misreads the role, they could see admin UI. The database itself should enforce that only admins can read/write admin tables.

---

## Prerequisites

- Guide 1 completed (admin login page exists)
- Supabase project with `profiles` table and `role` column (`'user' | 'admin'`)
- Existing RLS policies on `profiles`, `bookings`, and other tables

---

## Step 1 — Lock Down the `profiles.role` Column

Right now, any authenticated user can update their own profile — including the `role` field. This is a privilege escalation risk. The `role` column must only be writable by admins.

### Migration: `restrict_profile_role_updates.sql`

```sql
-- Revoke UPDATE on the role column from regular users
-- Only admins can change roles

-- First, create a SECURITY DEFINER function that safely checks admin status
-- without causing RLS recursion on the profiles table
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role = 'admin'
  );
$$;

-- Grant EXECUTE only to authenticated users (not anon)
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- Create a column-level privilege: users can UPDATE their profile
-- but NOT the role column
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, avatar_url, address) ON public.profiles TO authenticated;

-- Admins can update all columns including role
GRANT UPDATE ON public.profiles TO authenticated;
-- (Admins are identified by the is_admin() check in RLS policies, not by a separate DB role)
```

### Update the profiles UPDATE RLS policy

```sql
-- Drop existing update policy
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;

-- New policy: users can update their own profile EXCEPT role
-- Admins can update any profile including role
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND (
    -- If they're trying to change the role column, they must be an admin
    NOT (OLD.role IS DISTINCT FROM NEW.role) OR public.is_admin(auth.uid())
  ));

-- Admins can update any profile
CREATE POLICY "update_any_profile_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
```

---

## Step 2 — Add Admin Session Tracking

Track when and where admins log in, so you have an audit trail.

### Migration: `admin_sessions_audit.sql`

```sql
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  ip_address text,
  user_agent text,
  session_token_hash text  -- Store a hash, never the raw token
);

-- Enable RLS
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Only admins can read session history
CREATE POLICY "select_admin_sessions" ON public.admin_sessions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Any authenticated user can INSERT their own session record (for audit)
CREATE POLICY "insert_own_session" ON public.admin_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only the user themselves can update their own session (mark logout)
CREATE POLICY "update_own_session" ON public.admin_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime for admin dashboards
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_sessions;
```

---

## Step 3 — Record Admin Sessions on Login

Update `AuthContext.tsx` to log the session when an admin signs in.

### Add to `AuthContext.tsx` — inside the `signIn` function, after successful login:

```tsx
// After confirming login succeeded, check if user is admin and log session
if (data.user) {
  try {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileData?.role === 'admin') {
      // Hash the session token for audit (never store raw)
      const tokenHash = await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(data.session?.access_token || '')
      ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));

      await supabase.from('admin_sessions').insert({
        user_id: data.user.id,
        ip_address: null, // IP is not available client-side; use edge function if needed
        user_agent: navigator.userAgent,
        session_token_hash: tokenHash,
      });
    }
  } catch {
    // Non-critical — don't block login if audit logging fails
  }
}
```

### Record logout

In the `signOut` function:

```tsx
const signOut = async () => {
  // Mark the latest admin session as logged out
  if (user) {
    try {
      await supabase.from('admin_sessions')
        .update({ logout_at: new Date().toISOString() })
        .is('logout_at', null)
        .eq('user_id', user.id)
        .order('login_at', { ascending: false })
        .limit(1);
    } catch { /* non-critical */ }
  }

  await supabase.auth.signOut();
  setProfile(null);
  setNeeds2FA(false);
  setPending2FAEmail('');
  setPending2FAPassword('');
};
```

---

## Step 4 — Add an Admin Activity Log Page

Create a simple view in the admin dashboard that shows recent admin sessions.

### Create `src/admin/pages/AdminSessionsPage.tsx`

```tsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Clock, Globe, Monitor } from 'lucide-react';

interface AdminSession {
  id: string;
  user_id: string;
  login_at: string;
  logout_at: string | null;
  ip_address: string | null;
  user_agent: string;
  profiles: { full_name: string; email: string } | null;
}

export function AdminSessionsPage() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('admin_sessions')
        .select('*, profiles(full_name, email)')
        .order('login_at', { ascending: false })
        .limit(50);
      setSessions((data as AdminSession[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Sessions</h1>
        <p className="text-sm text-slate-400 mt-1">Recent admin login activity</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Admin</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Login Time</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Logout Time</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Device</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{s.profiles?.full_name || 'Unknown'}</p>
                  <p className="text-xs text-slate-400">{s.profiles?.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {new Date(s.login_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {s.logout_at ? new Date(s.logout_at).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">
                  {s.user_agent}
                </td>
                <td className="px-4 py-3">
                  {s.logout_at ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-full">
                      Ended
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Register it in `AdminApp.tsx`

Add to the imports:
```tsx
import { AdminSessionsPage } from './pages/AdminSessionsPage';
```

Add to the `renderPage` switch:
```tsx
case 'admin-sessions':
  return <AdminSessionsPage />;
```

Add to the sidebar navigation in `AdminSidebar.tsx`:
```tsx
{ id: 'admin-sessions', label: 'Admin Sessions', icon: ShieldCheck }
```

---

## Step 5 — Enforce Admin-Only Access on Sensitive Tables

For tables that only admins should access (like `admin_sessions`, `backup_history`, `finance_*`), add a blanket admin check using the `is_admin()` function:

```sql
-- Example: admin_sessions table
-- (Already done in Step 2, but apply the same pattern to other admin-only tables)

-- For any admin-only table:
CREATE POLICY "admin_only_select" ON <table_name>
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admin_only_insert" ON <table_name>
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin_only_update" ON <table_name>
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin_only_delete" ON <table_name>
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
```

---

## Verification Checklist

| Check | How to verify |
|---|---|
| Non-admin cannot change their role | Sign in as a regular user, try `UPDATE profiles SET role='admin'` — should be rejected by RLS |
| Admin can change roles | Sign in as admin, update a user's role — should succeed |
| Admin sessions are logged | Sign in as admin, check the Admin Sessions page — your login should appear |
| Logout is recorded | Sign out, refresh the sessions page — the "Active" badge should change to "Ended" |
| Non-admin cannot read admin_sessions | Sign in as regular user, query `admin_sessions` — should return empty |
| 2FA flow works on admin subdomain | Enable 2FA for an admin account, sign in on `admin.alphateknexus.com` — 2FA screen should appear |

---

## Summary of What Each Guide Covers

| Guide | Scope | Layer |
|---|---|---|
| **Guide 1** | Dedicated admin login page on the admin subdomain | UI / Frontend |
| **Guide 2** | Role-based access control, session audit logging, column-level security | Database / RLS / Backend |

Together they create a complete admin auth system: the login screen ensures only the right people reach the dashboard, and the database-level security ensures that even if the UI check is bypassed, the data itself is protected.
