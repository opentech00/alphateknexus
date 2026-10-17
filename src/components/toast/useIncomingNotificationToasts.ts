import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { showBrowserNotification } from '../../lib/pushNotifications';
import {
  isIncomingToastSuppressed,
  openIncomingNotification,
  toast,
  type IncomingNotification,
} from './toast';

export function useIncomingNotificationToasts(enabled = true) {
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      channel = supabase
        .channel(`in-app-toasts-${user.id}-${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const n = payload.new as IncomingNotification & { metadata?: Record<string, unknown> | null };
            if (!n?.id || seen.current.has(n.id)) return;
            seen.current.add(n.id);
            if (seen.current.size > 80) {
              seen.current = new Set(Array.from(seen.current).slice(-40));
            }

            const actorId = n.metadata && typeof n.metadata.actor_id === 'string' ? n.metadata.actor_id : null;
            if (actorId && actorId === user.id) return;
            if (isIncomingToastSuppressed()) return;

            toast.info({
              id: `notif_${n.id}`,
              title: n.title,
              body: n.body,
              action: {
                label: 'Open',
                onClick: () => openIncomingNotification(n),
              },
            });
            const meta = (n.metadata || {}) as Record<string, unknown>;
            showBrowserNotification(n.title, n.body, {
              campaign_id: typeof meta.campaign_id === 'string' ? meta.campaign_id : '',
              cta_page: typeof meta.cta_page === 'string' ? meta.cta_page : '',
              screen: typeof meta.screen === 'string' ? meta.screen : '',
              booking_id: n.booking_id || '',
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled]);
}
