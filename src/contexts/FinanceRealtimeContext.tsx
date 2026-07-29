import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface FinanceToast {
  id: string;
  title: string;
  body: string;
  type: 'invoice' | 'system' | 'payment';
}

export function useFinanceRealtimeToasts() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<FinanceToast[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    if (!user) return;

    // Load recent finance notifications as initial toasts (last 5 min)
    const loadRecent = async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, type, created_at')
        .eq('user_id', user.id)
        .eq('service_slug', 'finance')
        .gte('created_at', fiveMinAgo)
        .order('created_at', { ascending: false })
        .limit(5);
      if (data) {
        data.forEach(n => seenIds.current.add(n.id));
      }
    };
    loadRecent();

    // Subscribe to new finance notifications in realtime
    const channel = supabase
      .channel(`finance-toasts-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as any;
          // Only show finance-related toasts
          if (n.service_slug !== 'finance' && n.type !== 'invoice') return;
          if (seenIds.current.has(n.id)) return;
          seenIds.current.add(n.id);

          const toast: FinanceToast = {
            id: n.id,
            title: n.title,
            body: n.body,
            type: n.type === 'invoice' ? 'invoice' : 'system',
          };
          setToasts(prev => [toast, ...prev].slice(0, 3));

          // Auto-dismiss after 6 seconds
          setTimeout(() => dismiss(n.id), 6000);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, dismiss]);

  return { toasts, dismiss };
}
