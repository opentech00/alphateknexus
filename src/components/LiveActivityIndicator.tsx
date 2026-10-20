import { useEffect, useRef, useState } from 'react';
import { Activity, Calendar, MessageCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface LiveActivityItem {
  id: string;
  at: string;
  title: string;
  body: string;
  bookingId: string | null;
  kind: 'booking' | 'message';
}

interface Props {
  tone?: 'light' | 'dark';
  onOpen?: (item: LiveActivityItem) => void;
}

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

export function LiveActivityIndicator({ tone = 'light', onOpen }: Props) {
  const [items, setItems] = useState<LiveActivityItem[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);
  const ready = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const remember = (item: LiveActivityItem, announce: boolean) => {
      setItems((prev) => {
        if (prev.some((row) => row.id === item.id)) return prev;
        return [item, ...prev].slice(0, 30);
      });
      if (announce && ready.current) setUnseen((count) => count + 1);
    };

    (async () => {
      const [bookingsRes, messagesRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, contact_name, status, created_at, services(name)')
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
        const service = (row.services as { name?: string } | null)?.name;
        seeded.push({
          id: `booking-${row.id}`,
          at: row.created_at,
          title: 'Booking submitted',
          body: [row.contact_name, service, statusText(row.status)].filter(Boolean).join(' · '),
          bookingId: row.id,
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
          kind: 'message',
        });
      }
      seeded.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setItems(seeded.slice(0, 30));
      ready.current = true;
    })();

    const channel = supabase
      .channel(`live-client-activity-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row.id || row.deleted_at) return;
        remember({
          id: `booking-${row.id}`,
          at: String(row.created_at || new Date().toISOString()),
          title: 'New booking',
          body: [row.contact_name, statusText(row.status)].filter(Boolean).join(' · '),
          bookingId: String(row.id),
          kind: 'booking',
        }, true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row.id || row.deleted_at) return;
        remember({
          id: `booking-update-${row.id}-${row.updated_at || row.status}`,
          at: String(row.updated_at || new Date().toISOString()),
          title: 'Booking activity',
          body: [row.contact_name, statusText(row.status)].filter(Boolean).join(' · '),
          bookingId: String(row.id),
          kind: 'booking',
        }, true);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row.id || row.is_admin) return;
        remember({
          id: `message-${row.id}`,
          at: String(row.created_at || new Date().toISOString()),
          title: 'Client message',
          body: `${row.sender_name || 'Client'}: ${String(row.content || '').slice(0, 90)}`,
          bookingId: row.booking_id ? String(row.booking_id) : null,
          kind: 'message',
        }, true);
      })
      .subscribe((status) => {
        if (!cancelled) setLive(status === 'SUBSCRIBED');
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const dark = tone === 'dark';

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setUnseen(0);
        }}
        className={`relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
          dark ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
        }`}
        aria-label={unseen > 0 ? `Live client activity, ${unseen} new` : 'Live client activity'}
        aria-expanded={open}
      >
        <Activity className={`w-5 h-5 ${unseen > 0 ? 'text-emerald-500' : ''}`} />
        <span className={`absolute top-2 right-2 h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'} ${unseen > 0 ? 'animate-pulse' : ''}`} />
        {unseen > 0 && (
          <span className="absolute top-1 right-1 flex min-w-[16px] h-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
            {unseen > 9 ? '9+' : unseen}
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
              const Icon = item.kind === 'message' ? MessageCircle : Calendar;
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
                  <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${item.kind === 'message' ? 'text-blue-500' : 'text-emerald-600'}`} />
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
