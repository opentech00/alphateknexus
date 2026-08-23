import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { initPushNotifications } from '../lib/pushNotifications';
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
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: string | null; needs2FA?: boolean }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<{ error: string | null }>;
  clear2FA: () => void;
  refreshVerification: () => Promise<void>;
  hasAdminPermission: (pageKey: string) => boolean;
  isSuperAdmin: boolean;
  refreshAdminPermissions: () => void;
  idleWarningVisible: boolean;
  idleWarningSecondsLeft: number;
  dismissIdleWarning: () => void;
  failedLoginAlert: { date: string; device: string } | null;
  dismissFailedLoginAlert: () => void;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ADMIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_WARNING_MS = 2 * 60 * 1000; // warn 2 min before timeout
const IDLE_CHECK_INTERVAL_MS = 5 * 1000; // check every 5s for smoother countdown
const REMEMBER_ME_KEY = 'atn_remember_me';

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
  const [idleWarningVisible, setIdleWarningVisible] = useState(false);
  const [idleWarningSecondsLeft, setIdleWarningSecondsLeft] = useState(120);
  const [failedLoginAlert, setFailedLoginAlert] = useState<{ date: string; device: string } | null>(null);
  const signUpInProgressRef = useRef(false);

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const dismissIdleWarning = useCallback(() => {
    setIdleWarningVisible(false);
    resetIdleTimer();
  }, [resetIdleTimer]);

  const dismissFailedLoginAlert = useCallback(() => {
    setFailedLoginAlert(null);
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetIdleTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [resetIdleTimer]);

  useEffect(() => {
    if (!session) {
      setIdleWarningVisible(false);
      return;
    }

    // Skip idle timeout if remember-me is active
    const rememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    if (rememberMe) return;

    const interval = setInterval(() => {
      const timeout = profile?.role === 'admin' ? ADMIN_IDLE_TIMEOUT_MS : IDLE_TIMEOUT_MS;
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = timeout - elapsed;

      if (remaining <= 0) {
        setIdleWarningVisible(false);
        supabase.auth.signOut().catch(() => {});
      } else if (remaining <= IDLE_WARNING_MS && !idleWarningVisible) {
        setIdleWarningVisible(true);
        setIdleWarningSecondsLeft(Math.ceil(remaining / 1000));
      } else if (remaining > IDLE_WARNING_MS && idleWarningVisible) {
        setIdleWarningVisible(false);
      } else if (idleWarningVisible) {
        setIdleWarningSecondsLeft(Math.ceil(remaining / 1000));
      }
    }, IDLE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, profile, idleWarningVisible]);

  const fetchProfile = async (uid: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    setProfile(data as Profile | null);
  };

  const checkFailedLoginAlert = async (userId: string) => {
    try {
      const { data } = await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'check-failed-since-last-success', userId },
      });
      if (data?.hasFailedAttempts) {
        setFailedLoginAlert({ date: data.lastFailedAt, device: data.lastFailedDevice });
      }
    } catch { /* non-critical */ }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchProfile(data.session.user.id).then(async () => {
          const { data: prof } = await supabase
            .from('profiles')
            .select('is_verified')
            .eq('id', data.session!.user.id)
            .maybeSingle();
          if (prof) {
            setNeedsEmailVerification(!prof.is_verified);
          }
          setLoading(false);
        });
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
          if (!signUpInProgressRef.current) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('is_verified')
              .eq('id', newSession.user.id)
              .maybeSingle();
            if (prof) {
              setNeedsEmailVerification(!prof.is_verified);
            }
          }
        } else {
          setProfile(null);
          setNeedsEmailVerification(false);
          setFailedLoginAlert(null);
        }
        setLoading(false);
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, rememberMe = false) => {
    const normalizedEmail = email.trim().toLowerCase();

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

    // Store remember-me preference
    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, 'true');
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
    }

    const { data: profData } = await supabase
      .from('profiles')
      .select('is_verified')
      .eq('id', data.user.id)
      .maybeSingle();
    if (!profData?.is_verified) {
      setNeedsEmailVerification(true);
      return { error: null };
    }

    try {
      await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'record-success' },
      });
    } catch { /* non-critical */ }

    // Check for failed login attempts since last success
    checkFailedLoginAlert(data.user.id);

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
    } catch { /* non-critical */ }

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
      // 2FA not configured — proceed normally
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
    signUpInProgressRef.current = true;

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, fullName: fullName.trim() }),
      });
      const fnData = await response.json().catch(() => null) as Record<string, unknown> | null;

      if (!response.ok) {
        const detail = typeof fnData?.error === 'string' ? fnData.error : `Account creation failed (${response.status}).`;
        return { error: detail };
      }

      if (fnData?.success !== true) {
        return { error: typeof fnData?.error === 'string' ? fnData.error : 'Account creation failed. Please try again.' };
      }

      await supabase.auth.signOut({ scope: 'local' });
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        console.error('signUp: auto sign-in error:', signInError.message);
        return { error: `Account created, but sign-in failed: ${signInError.message}` };
      }

      try {
        await supabase.auth.refreshSession();
        const res = await supabase.functions.invoke('send-verification-code');
        if (res.error) {
          const fnErr = res.error as { message?: string; context?: Response };
          let detail = fnErr.message;
          if (fnErr.context) {
            try {
              const body = await fnErr.context.json();
              if (body?.error) detail = body.error;
            } catch { /* not JSON */ }
          }
          console.error('signUp: send-verification-code error:', detail);
        }
      } catch (e) {
        console.error('signUp: send-verification-code exception:', e);
      }

      setNeedsEmailVerification(true);
      return { error: null };
    } catch {
      return { error: 'Could not create account. Please try again.' };
    } finally {
      signUpInProgressRef.current = false;
    }
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
    localStorage.removeItem(REMEMBER_ME_KEY);
    await supabase.auth.signOut();
    setProfile(null);
    setNeeds2FA(false);
    setNeedsEmailVerification(false);
    setPending2FAEmail('');
    setPending2FAPassword('');
    setFailedLoginAlert(null);
  };

  const signOutAll = async () => {
    try {
      const { error: fnError } = await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'revoke-all-sessions' },
      });
      if (fnError) return { error: fnError.message || 'Failed to sign out of all devices' };
      localStorage.removeItem(REMEMBER_ME_KEY);
      await supabase.auth.signOut();
      setProfile(null);
      setNeeds2FA(false);
      setNeedsEmailVerification(false);
      setFailedLoginAlert(null);
      return { error: null };
    } catch {
      return { error: 'Failed to sign out of all devices' };
    }
  };

  const adminRole = profile?.role === 'admin';
  const { hasPermission: hasAdminPermission, isSuperAdmin, refresh: refreshAdminPermissions } = useAdminPermissions(profile, adminRole);

  return (
    <AuthContext.Provider value={{
      session, user, profile, isAdmin: adminRole, loading, needs2FA, needsEmailVerification,
      pending2FAEmail, pending2FAPassword, signIn, signUp, signOut, signOutAll, clear2FA,
      refreshVerification, hasAdminPermission, isSuperAdmin, refreshAdminPermissions,
      idleWarningVisible, idleWarningSecondsLeft, dismissIdleWarning,
      failedLoginAlert, dismissFailedLoginAlert,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
