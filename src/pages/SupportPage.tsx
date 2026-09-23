import { FormEvent, useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Loader2, Paperclip, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../components/toast/toast';
import { signedDocumentUrl } from '../lib/storageUrls';
import { PortalPage } from '../components/portal/PortalPage';

const CATEGORIES = [
  { id: 'booking', label: 'Booking' },
  { id: 'billing', label: 'Billing' },
  { id: 'quote', label: 'Quote' },
  { id: 'technical', label: 'Technical' },
  { id: 'other', label: 'Other' },
] as const;

interface Ticket {
  id: string;
  category: string;
  subject: string;
  status: string;
  booking_id: string | null;
  created_at: string;
  updated_at: string;
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

export function SupportPage({ onBack }: { onBack?: () => void }) {
  const { user, profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('booking');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const loadTickets = useCallback(async () => {
    if (!user) return;
    const { data, error: err } = await supabase
      .from('support_tickets')
      .select('id, category, subject, status, booking_id, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (err) setError(err.message);
    else setTickets((data || []) as Ticket[]);
    setLoading(false);
  }, [user]);

  const loadMessages = useCallback(async (ticketId: string) => {
    const { data } = await supabase
      .from('support_messages')
      .select('id, sender_name, is_staff, body, attachment_path, attachment_name, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    setMessages((data || []) as TicketMessage[]);
  }, []);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  useEffect(() => {
    if (!active) return;
    void loadMessages(active.id);
    const channel = supabase
      .channel(`support-${active.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${active.id}` }, () => {
        void loadMessages(active.id);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [active, loadMessages]);

  const upload = async (ticketId: string, picked: File) => {
    if (!user) return null;
    const safe = picked.name.replace(/[^\w.-]+/g, '_');
    const path = `${user.id}/support/${ticketId}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from('documents').upload(path, picked, {
      contentType: picked.type || 'application/octet-stream',
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);
    return { path, name: picked.name };
  };

  const createTicket = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    if (subject.trim().length < 3 || body.trim().length < 1) {
      setError('Add a subject and a message.');
      return;
    }
    setSending(true);
    const { data, error: err } = await supabase.from('support_tickets').insert({
      user_id: user.id,
      category,
      subject: subject.trim(),
      status: 'open',
    }).select('id, category, subject, status, booking_id, created_at, updated_at').single();
    if (err || !data) {
      setSending(false);
      setError(err?.message || 'Could not open the ticket');
      return;
    }
    try {
      const attached = file ? await upload(data.id, file) : null;
      const { error: msgErr } = await supabase.from('support_messages').insert({
        ticket_id: data.id,
        sender_id: user.id,
        sender_name: profile?.full_name || 'You',
        is_staff: false,
        body: body.trim(),
        attachment_path: attached?.path || null,
        attachment_name: attached?.name || null,
      });
      if (msgErr) throw new Error(msgErr.message);
      setSubject('');
      setBody('');
      setFile(null);
      toast.success('Ticket sent');
      setActive(data as Ticket);
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ticket opened, but the message failed');
    }
    setSending(false);
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !active || !reply.trim()) return;
    setSending(true);
    const { error: err } = await supabase.from('support_messages').insert({
      ticket_id: active.id,
      sender_id: user.id,
      sender_name: profile?.full_name || 'You',
      is_staff: false,
      body: reply.trim(),
    });
    setSending(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    setReply('');
    await loadMessages(active.id);
  };

  const closeTicket = async () => {
    if (!active) return;
    const { error: err } = await supabase.from('support_tickets').update({ status: 'closed' }).eq('id', active.id);
    if (err) toast.error(err.message);
    else {
      toast.success('Ticket closed');
      setActive({ ...active, status: 'closed' });
      await loadTickets();
    }
  };

  return (
    <PortalPage title="Support" subtitle="Open a ticket and keep the conversation with Alphatek in one place." onBack={onBack}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <form onSubmit={createTicket} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">New ticket</h2>
            <label className="block text-xs font-medium text-slate-500">
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Message
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
            <label className="inline-flex items-center gap-2 min-h-[44px] text-sm text-slate-600 cursor-pointer">
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              <span>{file ? file.name : 'Attach a file'}</span>
              <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={sending} className="w-full min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              {sending ? 'Sending…' : 'Send ticket'}
            </button>
          </form>

          <ul className="space-y-2" aria-label="Your tickets">
            {loading && <li className="text-sm text-slate-400 px-1">Loading tickets…</li>}
            {!loading && tickets.length === 0 && <li className="text-sm text-slate-500 px-1">No tickets yet.</li>}
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setActive(t)}
                  aria-current={active?.id === t.id ? 'true' : undefined}
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
        </div>

        <section className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[320px] flex flex-col" aria-live="polite">
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
              <LifeBuoy className="w-8 h-8 text-slate-300 mb-3" aria-hidden="true" />
              <p className="font-semibold text-slate-800">Choose a ticket</p>
              <p className="text-sm text-slate-500 mt-1">Replies from Alphatek appear here.</p>
            </div>
          ) : (
            <>
              <header className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900 truncate">{active.subject}</h2>
                  <p className="text-xs text-slate-500 capitalize">{active.status}</p>
                </div>
                {active.status !== 'closed' && (
                  <button type="button" onClick={() => void closeTicket()} className="min-h-[44px] text-sm font-semibold text-slate-600 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg">
                    Close
                  </button>
                )}
              </header>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[50vh]">
                {messages.map((m) => (
                  <article key={m.id} className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${m.is_staff ? 'bg-slate-100 text-slate-800' : 'ml-auto bg-emerald-600 text-white'}`}>
                    <p className={`text-[11px] font-semibold mb-0.5 ${m.is_staff ? 'text-slate-500' : 'text-emerald-100'}`}>{m.is_staff ? m.sender_name || 'Alphatek' : 'You'}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {m.attachment_path && (
                      <button
                        type="button"
                        className="mt-1 underline text-xs"
                        onClick={async () => {
                          const url = await signedDocumentUrl(m.attachment_path || '');
                          if (url) window.open(url, '_blank', 'noopener,noreferrer');
                          else toast.error('Could not open the attachment');
                        }}
                      >
                        {m.attachment_name || 'Attachment'}
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {active.status !== 'closed' && (
                <form onSubmit={sendReply} className="p-3 border-t border-slate-100 flex gap-2">
                  <label className="sr-only" htmlFor="support-reply">Reply</label>
                  <input id="support-reply" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply" className="flex-1 min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <button type="submit" disabled={sending || !reply.trim()} aria-label="Send reply" className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 text-white flex items-center justify-center disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </PortalPage>
  );
}
