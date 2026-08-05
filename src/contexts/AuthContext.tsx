import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { initPushNotifications, unregisterDeviceToken } from '../lib/pushNotifications';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import type { Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  needs2FA: boolean;
  needsEmailVerification: boolean;
  pending2FAEmail: string;
  pending2FAPassword: string;
  signIn: (email: string, password: string) => Promise<{ error: string | null; needs2FA?: boolean }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  clear2FA: () => void;
  refreshVerification: () => Promise<void>;
  hasAdminPermission: (pageKey: string) => boolean;
  isSuperAdmin: boolean;
  refreshAdminPermissions: () => void;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ADMIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 60 * 1000;

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [pending2FAEmail, setPending2FAEmail] = useState('');
  const [pending2FAPassword, setPending2FAPassword] = useState('');
  const lastActivityRef = useRef<number>(Date.now());
  const idleWarnedRef = useRef<boolean>(false);

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    idleWarnedRef.current = false;
  }, []);

  // Track user activity to reset idle timer
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetIdleTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [resetIdleTimer]);

  // Check for idle timeout
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const timeout = profile?.role === 'admin' ? ADMIN_IDLE_TIMEOUT_MS : IDLE_TIMEOUT_MS;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeout && !idleWarnedRef.current) {
        idleWarnedRef.current = true;
        supabase.auth.signOut().catch(() => {});
      }
    }, IDLE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, profile]);

  const fetchProfile = async (uid: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    setProfile(data as Profile | null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
          initPushNotifications('client').catch(() => {});
          // Check our own is_verified flag on profiles, not Supabase's
          // email_confirmed_at (which is auto-set when email confirmation is off)
          const { data: prof } = await supabase
            .from('profiles')
            .select('is_verified')
            .eq('id', newSession.user.id)
            .maybeSingle();
          setNeedsEmailVerification(!prof?.is_verified);
        } else {
          setProfile(null);
          setNeedsEmailVerification(false);
        }
        setLoading(false);
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    // Check lockout status before attempting login
    try {
      const { data: lockoutData } = await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'check-lockout', email: normalizedEmail },
      });
      if (lockoutData?.locked) {
        const mins = Math.ceil(lockoutData.retryAfter / 60);
        return { error: `Account temporarily locked. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` };
      }
    } catch {
      // If check fails, proceed with login attempt
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) {
      // Record the failed attempt for lockout tracking
      try {
        const { data: failData } = await supabase.functions.invoke('manage-auth-events', {
          body: { action: 'record-failure', email: normalizedEmail },
        });
        if (failData?.locked) {
          return { error: 'Too many failed attempts. Account locked for 15 minutes.' };
        }
        if (failData?.remaining <= 2) {
          return { error: `Invalid email or password. ${failData.remaining} attempt${failData.remaining === 1 ? '' : 's'} remaining before lockout.` };
        }
      } catch { /* ignore */ }
      return { error: 'Invalid email or password.' };
    }
    if (!data.user) return { error: 'Authentication failed' };

    // Check our own is_verified flag on profiles
    const { data: profData } = await supabase
      .from('profiles')
      .select('is_verified')
      .eq('id', data.user.id)
      .maybeSingle();
    if (!profData?.is_verified) {
      setNeedsEmailVerification(true);
      return { error: null };
    }

    // Record successful login
    try {
      await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'record-success' },
      });
    } catch { /* non-critical */ }

    // If this user is an admin, log the session for audit
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileData?.role === 'admin') {
        const token = data.session?.access_token || '';
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
        const tokenHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

        await supabase.from('admin_sessions').insert({
          user_id: data.user.id,
          user_agent: navigator.userAgent,
          session_token_hash: tokenHash,
        });
      }
    } catch { /* non-critical — don't block login if audit logging fails */ }

    // Check if 2FA is enabled for this user
    try {
      const { data: checkData } = await supabase.functions.invoke('manage-2fa', {
        body: { action: 'verify-login', code: '__check__', userId: data.user.id },
      });
      if (checkData && checkData.error === 'Invalid code') {
        await supabase.auth.signOut();
        setPending2FAEmail(normalizedEmail);
        setPending2FAPassword(password);
        setNeeds2FA(true);
        return { error: null, needs2FA: true };
      }
    } catch {
      // 2FA not configured for this user — proceed normally
    }
    return { error: null };
  };

  const clear2FA = () => {
    setNeeds2FA(false);
    setPending2FAEmail('');
    setPending2FAPassword('');
  };

  const refreshVerification = async () => {
    const { data: sessionData } = await supabase.auth.refreshSession();
    if (sessionData.session?.user) {
      await fetchProfile(sessionData.session.user.id);
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_verified')
        .eq('id', sessionData.session.user.id)
        .maybeSingle();
      setNeedsEmailVerification(!prof?.is_verified);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: undefined,
      },
    });

    // Supabase may return "email rate limit exceeded" when its built-in
    // confirmation email hits the rate limit. The account is still created
    // in this case — we use our own 6-digit code system instead, so we
    // treat this as non-fatal and proceed to the verification screen.
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('rate limit') || msg.includes('email rate')) {
        // Account may still have been created — try to insert profile
        const userId = (data as any)?.user?.id;
        if (userId) {
          await supabase.from('profiles').insert({
            id: userId,
            email,
            full_name: fullName,
            role: 'user',
          });
        }
        // The verification screen will send the 6-digit code on mount
        return { error: null };
      }
      return { error: error.message };
    }

    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: 'user',
      });
      // Send the 6-digit verification code email
      try {
        await supabase.functions.invoke('send-verification-code');
      } catch { /* non-critical — user can resend from verification screen */ }
    }
    return { error: null };
  };

  const signOut = async () => {
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
    setNeedsEmailVerification(false);
    setPending2FAEmail('');
    setPending2FAPassword('');
  };

  const adminRole = profile?.role === 'admin';
  const { hasPermission: hasAdminPermission, isSuperAdmin, refresh: refreshAdminPermissions } = useAdminPermissions(profile, adminRole);

  return (
    <AuthContext.Provider value={{ session, user, profile, isAdmin: adminRole, loading, needs2FA, needsEmailVerification, pending2FAEmail, pending2FAPassword, signIn, signUp, signOut, clear2FA, refreshVerification, hasAdminPermission, isSuperAdmin, refreshAdminPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
