import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'booking_update' | 'message' | 'system';
  read: boolean;
  booking_id: string | null;
  service_slug: string | null;
  created_at: string;
}

interface AdminNotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  unreadByType: Record<string, number>;
  unreadBySlug: Record<string, number>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markReadBySlug: (slug: string) => Promise<void>;
  loading: boolean;
}

const AdminNotificationsContext = createContext<AdminNotificationsContextValue | null>(null);

export function AdminNotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const unreadByType = notifications
    .filter((n) => !n.read)
    .reduce<Record<string, number>>((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {});

  const unreadBySlug = notifications
    .filter((n) => !n.read && n.service_slug)
    .reduce<Record<string, number>>((acc, n) => {
      acc[n.service_slug!] = (acc[n.service_slug!] || 0) + 1;
      return acc;
    }, {});

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
      if (data) setNotifications(data as Notification[]);
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
      .channel(`admin-notifications-ctx-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications((prev) => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications((prev) =>
              prev.map((n) => (n.id === (payload.new as Notification).id ? (payload.new as Notification) : n))
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

  const markReadBySlug = async (slug: string) => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('service_slug', slug).eq('read', false);
    setNotifications((prev) => prev.map((n) => (n.service_slug === slug ? { ...n, read: true } : n)));
  };

  return (
    <AdminNotificationsContext.Provider value={{ notifications, unreadCount, unreadByType, unreadBySlug, markAsRead, markAllAsRead, markReadBySlug, loading }}>
      {children}
    </AdminNotificationsContext.Provider>
  );
}

export function useAdminNotifications() {
  const ctx = useContext(AdminNotificationsContext);
  if (!ctx) throw new Error('useAdminNotifications must be used within AdminNotificationsProvider');
  return ctx;
}
