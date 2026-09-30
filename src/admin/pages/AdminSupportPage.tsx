import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2, Plus, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../components/toast/toast';
import { signedDocumentUrl } from '../../lib/storageUrls';
import { KnowledgeSearch } from '../../components/support/KnowledgeSearch';

interface Ticket {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  status: string;
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

interface Article {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  is_published: boolean;
}

const STATUSES = ['open', 'waiting', 'resolved', 'closed'] as const;

export function AdminSupportPage() {
  const [tab, setTab] = useState<'tickets' | 'help'>('tickets');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <p className="text-sm text-slate-500 mt-1">Reply to tickets and keep help articles current.</p>
      </div>
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['tickets', 'help'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {key === 'help' ? 'Help articles' : 'Tickets'}
          </button>
        ))}
      </div>
      {tab === 'tickets' ? <TicketInbox /> : <HelpArticlesAdmin />}
    </div>
  );
}

function TicketInbox() {
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
  );
}

function HelpArticlesAdmin() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('knowledge_articles')
      .select('id, slug, title, body, category, is_published')
      .order('updated_at', { ascending: false });
    if (error) toast.error(error.message);
    else setArticles((data || []) as Article[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3 || body.trim().length < 8) {
      toast.error('Add a title and a short article.');
      return;
    }
    setSaving(true);
    const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    const { error } = await supabase.from('knowledge_articles').insert({
      slug: `${slug}-${Date.now().toString(36)}`,
      title: title.trim(),
      body: body.trim(),
      category: category.trim() || 'general',
      is_published: true,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle('');
    setBody('');
    toast.success('Article published. Search picks it up immediately.');
    await load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <KnowledgeSearch placeholder="Preview what clients will find…" />
        <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
          {articles.map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{a.title}</p>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.body}</p>
            </li>
          ))}
        </ul>
      </div>
      <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-600" /> New help article
        </h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (payments, bookings…)" className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Write the answer in plain language." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <button type="submit" disabled={saving} className="w-full min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Publish article
        </button>
      </form>
    </div>
  );
}
