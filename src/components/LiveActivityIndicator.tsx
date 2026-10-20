import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, Calendar, LifeBuoy, MessageCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const DIVISION_SLUGS = [
  'clearing-forwarding',
  'waste-management',
  'cleaning-janitorial',
  'private-security',
  'procurement',
] as const;

export type DivisionSlug = (typeof DIVISION_SLUGS)[number];

export interface LiveActivityItem {
  id: string;
  at: string;
  title: string;
  body: string;
  bookingId: string | null;
  slug: string | null;
  kind: 'booking' | 'message' | 'inbox';
}

interface ActivityCounts {
  bySlug: Record<string, number>;
  messages: number;
  inbox: number;
}

interface LiveActivityValue {
  items: LiveActivityItem[];
  live: boolean;
  counts: ActivityCounts;
  total: number;
  acknowledgeSlug: (slug: string) => void;
  acknowledgeMessages: () => void;
  acknowledgeInbox: () => void;
}

const EMPTY_COUNTS: ActivityCounts = { bySlug: {}, messages: 0, inbox: 0 };

const LiveActivityContext = createContext<LiveActivityValue | null>(null);

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateString).toLocaleDateString();
}

function statusText(status: unknown): string {
  return String(status || 'updated').replace(/_/g, ' ');
}

export function LiveActivityProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LiveActivityItem[]>([]);
  const [counts, setCounts] = useState<ActivityCounts>(EMPTY_COUNTS);
  const [live, setLive] = useState(false);
  const slugByService = useRef<Record<string, string>>({});
  const ready = useRef(false);

  const pushItem = (item: LiveActivityItem) => {
    setItems((prev) => {
      if (prev.some((row) => row.id === item.id)) return prev;
      return [item, ...prev].slice(0, 40);
    });
  };

  const bumpSlug = (slug: string | null) => {
    if (!slug || !DIVISION_SLUGS.includes(slug as DivisionSlug)) return;
    setCounts((prev) => ({
      ...prev,
      bySlug: { ...prev.bySlug, [slug]: (prev.bySlug[slug] || 0) + 1 },
    }));
  };

  const bumpMessages = () => setCounts((prev) => ({ ...prev, messages: prev.messages + 1 }));
  const bumpInbox = () => setCounts((prev) => ({ ...prev, inbox: prev.inbox + 1 }));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: services } = await supabase.from('services').select('id, slug');
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const service of services || []) {
        if (service.id && service.slug) map[service.id] = service.slug;
      }
      slugByService.current = map;

      const [bookingsRes, messagesRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, contact_name, status, created_at, service_id, services(name, slug)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('messages')
          .select('id, booking_id, sender_name, content, is_admin, created_at')
          .eq('is_admin', false)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);
      if (cancelled) return;

      const seeded: LiveActivityItem[] = [];
      for (const row of bookingsRes.data || []) {
        const service = row.services as { name?: string; slug?: string } | null;
        seeded.push({
          id: `booking-${row.id}`,
          at: row.created_at,
          title: 'Booking submitted',
          body: [row.contact_name, service?.name, statusText(row.status)].filter(Boolean).join(' · '),
          bookingId: row.id,
          slug: service?.slug || map[row.service_id] || null,
          kind: 'booking',
        });
      }
      for (const row of messagesRes.data || []) {
        seeded.push({
          id: `message-${row.id}`,
          at: row.created_at,
          title: 'Client message',
          body: `${row.sender_name || 'Client'}: ${String(row.content || '').slice(0, 90)}`,
          bookingId: row.booking_id,
          slug: null,
          kind: 'message',
        });
      }
      seeded.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setItems(seeded.slice(0, 40));
      ready.current = true;
    })();

    const slugOf = (serviceId: unknown) => (
      typeof serviceId === 'string' ? slugByService.current[serviceId] || null : null
    );

    const channel = supabase
      .channel(`live-client-activity-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row.id || row.deleted_at) return;
        const slug = slugOf(row.service_id);
        pushItem({
          id: `booking-${row.id}`,
          at: String(row.created_at || new Date().toISOString()),
          title: 'New booking',
          body: [row.contact_name, statusText(row.status)].filter(Boolean).join(' · '),
          bookingId: String(row.id),
          slug,
          kind: 'booking',
        });
        if (ready.current) bumpSlug(slug);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row.id || row.is_admin) return;
        let slug: string | null = null;
        if (row.booking_id) {
          const { data } = await supabase.from('bookings').select('service_id').eq('id', String(row.booking_id)).maybeSingle();
          slug = slugOf(data?.service_id);
        }
        pushItem({
          id: `message-${row.id}`,
          at: String(row.created_at || new Date().toISOString()),
          title: 'Client message',
          body: `${row.sender_name || 'Client'}: ${String(row.content || '').slice(0, 90)}`,
          bookingId: row.booking_id ? String(row.booking_id) : null,
          slug,
          kind: 'message',
        });
        if (!ready.current) return;
        bumpMessages();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row.id) return;
        pushItem({
          id: `ticket-${row.id}`,
          at: String(row.created_at || new Date().toISOString()),
          title: 'New inbox ticket',
          body: String(row.subject || row.body || 'A client opened a support request'),
          bookingId: null,
          slug: null,
          kind: 'inbox',
        });
        if (ready.current) bumpInbox();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row.id || row.is_staff) return;
        pushItem({
          id: `ticket-msg-${row.id}`,
          at: String(row.created_at || new Date().toISOString()),
          title: 'Inbox reply',
          body: String(row.body || 'A client replied in support'),
          bookingId: null,
          slug: null,
          kind: 'inbox',
        });
        if (ready.current) bumpInbox();
      })
      .subscribe((status) => {
        if (!cancelled) setLive(status === 'SUBSCRIBED');
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const total = counts.messages + counts.inbox + Object.values(counts.bySlug).reduce((sum, n) => sum + n, 0);

  const value: LiveActivityValue = {
    items,
    live,
    counts,
    total,
    acknowledgeSlug: (slug) => setCounts((prev) => ({ ...prev, bySlug: { ...prev.bySlug, [slug]: 0 } })),
    acknowledgeMessages: () => setCounts((prev) => ({ ...prev, messages: 0 })),
    acknowledgeInbox: () => setCounts((prev) => ({ ...prev, inbox: 0 })),
  };

  return <LiveActivityContext.Provider value={value}>{children}</LiveActivityContext.Provider>;
}

export function useLiveActivity() {
  const ctx = useContext(LiveActivityContext);
  if (!ctx) throw new Error('useLiveActivity must be used within LiveActivityProvider');
  return ctx;
}

interface Props {
  tone?: 'light' | 'dark';
  onOpen?: (item: LiveActivityItem) => void;
}

export function LiveActivityIndicator({ tone = 'light', onOpen }: Props) {
  const { items, live, total } = useLiveActivity();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dark = tone === 'dark';

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
          dark ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
        }`}
        aria-label={total > 0 ? `Live client activity, ${total} new` : 'Live client activity'}
        aria-expanded={open}
      >
        <Activity className={`w-5 h-5 ${total > 0 ? 'text-emerald-500' : ''}`} />
        <span className={`absolute top-2 right-2 h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'} ${total > 0 ? 'animate-pulse' : ''}`} />
        {total > 0 && (
          <span className="absolute top-1 right-1 flex min-w-[16px] h-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-[80] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Client activity</p>
              <p className="text-[11px] text-slate-500">{live ? 'Live' : 'Connecting…'}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Close activity">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No client activity yet</p>
            ) : items.map((item) => {
              const Icon = item.kind === 'message' ? MessageCircle : item.kind === 'inbox' ? LifeBuoy : Calendar;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpen?.(item);
                  }}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${item.kind === 'message' ? 'text-blue-500' : item.kind === 'inbox' ? 'text-amber-500' : 'text-emerald-600'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{item.title}</span>
                      <span className="flex-shrink-0 text-[10px] text-slate-400">{timeAgo(item.at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{item.body}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
