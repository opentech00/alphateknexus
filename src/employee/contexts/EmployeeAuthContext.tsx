import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [appAccess, setAppAccess] = useState<AppAccess | null>(null);
  const [loading, setLoading] = useState(true);

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
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
    <AuthContext.Provider value={{ session, user, employee, appAccess, loading, signIn, signOut, clearPasswordFlag }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
