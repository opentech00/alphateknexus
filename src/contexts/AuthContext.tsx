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
  // Guard: when true, onAuthStateChange must NOT touch needsEmailVerification
  const signUpInProgressRef = useRef(false);

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    idleWarnedRef.current = false;
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetIdleTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [resetIdleTimer]);

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
          // Skip verification check if signUp is currently running — it will
          // set needsEmailVerification itself after inserting the profile.
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
        }
        setLoading(false);
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
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
    // Set guard so onAuthStateChange doesn't overwrite our state
    signUpInProgressRef.current = true;

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: undefined,
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('rate limit') || msg.includes('email rate')) {
          setNeedsEmailVerification(true);
          return { error: null };
        }
        return { error: error.message };
      }

      if (!data.user) {
        return { error: 'Account creation failed. Please try again.' };
      }

      // Wait briefly for session to be established so the profile insert
      // passes RLS (auth.uid() must equal the profile id)
      await new Promise(r => setTimeout(r, 200));

      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: 'user',
      });

      if (profileError) {
        console.error('signUp: profile insert failed:', profileError.message);
        // If profile already exists (duplicate key), that's fine — continue
        if (!profileError.message.includes('duplicate')) {
          return { error: 'Account was created but profile setup failed. Please try signing in.' };
        }
      }

      // Send the 6-digit verification code email
      try {
        const res = await supabase.functions.invoke('send-verification-code');
        if (res.error) {
          console.error('signUp: send-verification-code error:', res.error);
        }
      } catch (e) {
        console.error('signUp: send-verification-code exception:', e);
      }

      setNeedsEmailVerification(true);
      return { error: null };
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
