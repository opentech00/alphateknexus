import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  needs2FA: boolean;
  pending2FAEmail: string;
  pending2FAPassword: string;
  signIn: (email: string, password: string) => Promise<{ error: string | null; needs2FA?: boolean }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  clear2FA: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [pending2FAEmail, setPending2FAEmail] = useState('');
  const [pending2FAPassword, setPending2FAPassword] = useState('');

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
        } else {
          setProfile(null);
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

    // Record successful login
    try {
      await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'record-success' },
      });
    } catch { /* non-critical */ }

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

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: error.message };
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: 'user',
      });
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setNeeds2FA(false);
    setPending2FAEmail('');
    setPending2FAPassword('');
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, isAdmin: profile?.role === 'admin', loading, needs2FA, pending2FAEmail, pending2FAPassword, signIn, signUp, signOut, clear2FA }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
