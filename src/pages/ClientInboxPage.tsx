import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Loader2, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PortalPage } from '../components/portal/PortalPage';
import { SupportPage } from './SupportPage';
import { MessageThread } from '../components/MessageThread';

type InboxTab = 'tickets' | 'jobs';

interface JobThread {
  id: string;
  status: string;
  updated_at: string;
  services: { name: string; slug: string } | null;
  lastMessage: string;
  lastAt: string | null;
}

export function ClientInboxPage({ onBack }: { onBack?: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<InboxTab>('tickets');
  const [threads, setThreads] = useState<JobThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<JobThread | null>(null);

  const loadJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, status, updated_at, services(name, slug)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(40);
    const rows = ((bookings || []) as {
      id: string;
      status: string;
      updated_at: string;
      services: JobThread['services'] | JobThread['services'][];
    }[]).map((row) => ({
      id: row.id,
      status: row.status,
      updated_at: row.updated_at,
      services: Array.isArray(row.services) ? row.services[0] ?? null : row.services,
    }));
    const ids = rows.map((r) => r.id);
    const lastByBooking = new Map<string, { content: string | null; created_at: string }>();
    if (ids.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('booking_id, content, created_at')
        .in('booking_id', ids)
        .order('created_at', { ascending: false });
      (msgs || []).forEach((m: { booking_id: string; content: string | null; created_at: string }) => {
        if (!lastByBooking.has(m.booking_id)) lastByBooking.set(m.booking_id, m);
      });
    }
    const withMail = rows
      .map((row) => {
        const last = lastByBooking.get(row.id);
        return {
          ...row,
          lastMessage: last?.content?.trim() || 'No messages yet — tap to start a conversation.',
          lastAt: last?.created_at || null,
        };
      })
      .filter((row) => lastByBooking.has(row.id) || ['pending', 'pending_review', 'approved', 'confirmed', 'in_progress'].includes(row.status));
    setThreads(withMail);
    setLoading(false);
  }, [user]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  return (
    <PortalPage
      title="Inbox"
      subtitle="Support tickets and job chats in one place."
      onBack={onBack}
    >
      <div role="tablist" aria-label="Inbox" className="flex gap-1 overflow-x-auto bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
        {([
          { id: 'tickets' as const, label: 'Tickets', icon: LifeBuoy },
          { id: 'jobs' as const, label: 'Job chats', icon: MessageSquare },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ${
              tab === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'tickets' && <SupportPage bare />}

      {tab === 'jobs' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <ul className="lg:col-span-2 space-y-2" aria-label="Job conversations">
            {loading && <li className="text-sm text-slate-400 px-1">Loading chats…</li>}
            {!loading && threads.length === 0 && (
              <li className="text-sm text-slate-500 px-1">No job chats yet. Messages from a booking appear here.</li>
            )}
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setActiveJob(t)}
                  aria-current={activeJob?.id === t.id ? 'true' : undefined}
                  className={`w-full text-left rounded-xl border px-3 py-3 min-h-[44px] ${
                    activeJob?.id === t.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900 truncate">{t.services?.name || 'Booking'}</p>
                  <p className="text-xs text-slate-500 capitalize">{t.status.replace('_', ' ')}</p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.lastMessage}</p>
                </button>
              </li>
            ))}
          </ul>
          <section className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[320px] flex flex-col">
            {!activeJob ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
                {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-400" /> : (
                  <>
                    <MessageSquare className="w-8 h-8 text-slate-300 mb-3" />
                    <p className="font-semibold text-slate-800">Choose a job chat</p>
                    <p className="text-sm text-slate-500 mt-1">Talk with Alphatek about an active booking.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-3 min-h-[320px]">
                <MessageThread bookingId={activeJob.id} />
              </div>
            )}
          </section>
        </div>
      )}
    </PortalPage>
  );
}
