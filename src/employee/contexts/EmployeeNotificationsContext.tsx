import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './EmployeeAuthContext';

export interface EmployeeNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  booking_id: string | null;
  service_slug: string | null;
  created_at: string;
}

interface EmployeeNotificationsContextValue {
  notifications: EmployeeNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const EmployeeNotificationsContext = createContext<EmployeeNotificationsContextValue | null>(null);

export function EmployeeNotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setNotifications(data as EmployeeNotification[]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`emp-notifications-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications((prev) => [payload.new as EmployeeNotification, ...prev].slice(0, 50));
          } else if (payload.eventType === 'UPDATE') {
            setNotifications((prev) =>
              prev.map((n) => (n.id === (payload.new as EmployeeNotification).id ? (payload.new as EmployeeNotification) : n))
            );
          } else if (payload.eventType === 'DELETE') {
            setNotifications((prev) => prev.filter((n) => n.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <EmployeeNotificationsContext.Provider value={{ notifications, unreadCount, loading, markAsRead, markAllAsRead }}>
      {children}
    </EmployeeNotificationsContext.Provider>
  );
}

export function useEmployeeNotifications() {
  const ctx = useContext(EmployeeNotificationsContext);
  if (!ctx) throw new Error('useEmployeeNotifications must be used within EmployeeNotificationsProvider');
  return ctx;
}
