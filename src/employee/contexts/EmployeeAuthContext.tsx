import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { initPushNotifications } from '../../lib/pushNotifications';
import type { Employee } from '../types';

interface AppAccess {
  app_type: 'employee' | 'field' | 'admin';
  is_active: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  employee: Employee | null;
  appAccess: AppAccess | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  clearPasswordFlag: () => void;
  idleWarningVisible: boolean;
  idleWarningSecondsLeft: number;
  dismissIdleWarning: () => void;
}

const EMPLOYEE_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_WARNING_MS = 2 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 5 * 1000;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [appAccess, setAppAccess] = useState<AppAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef<number>(Date.now());
  const [idleWarningVisible, setIdleWarningVisible] = useState(false);
  const [idleWarningSecondsLeft, setIdleWarningSecondsLeft] = useState(120);

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const dismissIdleWarning = useCallback(() => {
    setIdleWarningVisible(false);
    resetIdleTimer();
  }, [resetIdleTimer]);

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

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = EMPLOYEE_IDLE_TIMEOUT_MS - elapsed;

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
  }, [session, idleWarningVisible]);

  const fetchEmployee = async (uid: string) => {
    const { data } = await supabase
      .from('employees')
      .select('*, services(id,name,slug,description,icon), hr_roles(id,name,description,display_order,is_default,services(id,name,slug))')
      .eq('user_id', uid)
      .maybeSingle();
    setEmployee(data as Employee | null);

    if (data) {
      const { data: access } = await supabase
        .from('app_access')
        .select('app_type, is_active')
        .eq('employee_id', (data as Employee).id)
        .maybeSingle();
      setAppAccess(access as AppAccess | null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchEmployee(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await fetchEmployee(newSession.user.id);
          initPushNotifications('employee').catch(() => {});
        } else {
          setEmployee(null);
          setAppAccess(null);
        }
        setLoading(false);
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (identifier: string, password: string) => {
    let email = identifier.trim();
    if (identifier.includes('@')) {
      // already an email
    } else {
      const { data, error } = await supabase.rpc('get_employee_email_by_number', {
        p_employee_number: identifier.trim().toUpperCase(),
      });
      if (error) return { error: 'Unable to verify employee ID. Please try again.' };
      if (!data) return { error: 'Employee ID not found. Please check and try again.' };
      email = data as string;
    }

    // Check lockout
    try {
      const { data: lockoutData } = await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'check-lockout', email: email.toLowerCase() },
      });
      if (lockoutData?.locked) {
        const mins = Math.ceil(lockoutData.retryAfter / 60);
        return { error: `Account temporarily locked. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` };
      }
    } catch { /* proceed */ }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Record failure for lockout tracking
      try {
        const { data: failData } = await supabase.functions.invoke('manage-auth-events', {
          body: { action: 'record-failure', email: email.toLowerCase() },
        });
        if (failData?.locked) {
          return { error: 'Too many failed attempts. Account locked for 15 minutes.' };
        }
        if (failData?.remaining <= 2) {
          return { error: `Invalid credentials. ${failData.remaining} attempt${failData.remaining === 1 ? '' : 's'} remaining before lockout.` };
        }
      } catch { /* ignore */ }
      return { error: error.message?.includes('Invalid login credentials')
        ? 'Invalid Employee ID or password. Please try again.'
        : (error.message ?? 'Sign in failed.') };
    }

    // Record success (clears lockout + logs activity)
    try {
      await supabase.functions.invoke('manage-auth-events', {
        body: { action: 'record-success' },
      });
    } catch { /* non-critical */ }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setEmployee(null);
    setAppAccess(null);
  };

  const clearPasswordFlag = () => {
    setEmployee((prev) => (prev ? { ...prev, must_change_password: false } : prev));
  };

  return (
    <AuthContext.Provider value={{
      session, user, employee, appAccess, loading, signIn, signOut, clearPasswordFlag,
      idleWarningVisible, idleWarningSecondsLeft, dismissIdleWarning,
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
