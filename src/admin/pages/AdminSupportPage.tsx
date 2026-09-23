import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/toast/toast';
import { signedDocumentUrl } from '../../lib/storageUrls';

interface Ticket {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  status: string;
  updated_at: string;
  profiles?: { full_name: string | null; email: string } | null;
}

interface TicketMessage {
  id: string;
  sender_name: string;
  is_staff: boolean;
  body: string;
  attachment_path: string | null;
  attachment_name: string | null;
  created_at: string;
}

const STATUSES = ['open', 'waiting', 'resolved', 'closed'] as const;

export function AdminSupportPage() {
  const { user, profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, user_id, category, subject, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    else setTickets((data || []) as Ticket[]);
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('support_messages')
      .select('id, sender_name, is_staff, body, attachment_path, attachment_name, created_at')
      .eq('ticket_id', id)
      .order('created_at');
    setMessages((data || []) as TicketMessage[]);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!active) return;
    void loadMessages(active.id);
  }, [active, loadMessages]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !active || !reply.trim()) return;
    setSending(true);
    const { error } = await supabase.from('support_messages').insert({
      ticket_id: active.id,
      sender_id: user.id,
      sender_name: profile?.full_name || 'Alphatek',
      is_staff: true,
      body: reply.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setReply('');
    await loadMessages(active.id);
    await load();
  };

  const setStatus = async (status: string) => {
    if (!active) return;
    const { error } = await supabase.from('support_tickets').update({ status }).eq('id', active.id);
    if (error) toast.error(error.message);
    else {
      setActive({ ...active, status });
      await load();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support tickets</h1>
        <p className="text-sm text-slate-500 mt-1">Reply to client tickets from the portal.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <ul className="lg:col-span-2 space-y-2 max-h-[70vh] overflow-y-auto" aria-label="Tickets">
          {loading && <li className="text-sm text-slate-400">Loading…</li>}
          {!loading && tickets.length === 0 && <li className="text-sm text-slate-500">No tickets yet.</li>}
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActive(t)}
                className={`w-full text-left rounded-xl border px-3 py-3 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  active?.id === t.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900 truncate">{t.subject}</p>
                <p className="text-xs text-slate-500 capitalize">{t.category} · {t.status}</p>
              </button>
            </li>
          ))}
        </ul>
        <section className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 min-h-[360px] flex flex-col">
          {!active ? (
            <p className="m-auto text-sm text-slate-500">Select a ticket to reply.</p>
          ) : (
            <>
              <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{active.subject}</h2>
                <label className="text-xs text-slate-500">
                  Status
                  <select value={active.status} onChange={(e) => void setStatus(e.target.value)} className="ml-2 min-h-[44px] rounded-lg border border-slate-200 px-2 text-sm">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </header>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[50vh]">
                {messages.map((m) => (
                  <article key={m.id} className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${m.is_staff ? 'ml-auto bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
                    <p className="text-[11px] font-semibold opacity-70 mb-0.5">{m.sender_name}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {m.attachment_path && (
                      <button type="button" className="mt-1 underline text-xs" onClick={async () => {
                        const url = await signedDocumentUrl(m.attachment_path || '');
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                      }}>
                        {m.attachment_name || 'Attachment'}
                      </button>
                    )}
                  </article>
                ))}
              </div>
              <form onSubmit={send} className="p-3 border-t border-slate-100 flex gap-2">
                <label className="sr-only" htmlFor="admin-support-reply">Reply</label>
                <input id="admin-support-reply" value={reply} onChange={(e) => setReply(e.target.value)} className="flex-1 min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <button type="submit" disabled={sending || !reply.trim()} className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 inline-flex items-center gap-1.5">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
