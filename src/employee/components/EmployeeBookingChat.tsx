import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/EmployeeAuthContext';
import { Portal } from '../../lib/portal';

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string | null;
  created_at: string;
}

interface Props {
  bookingId: string;
  clientName?: string | null;
  onClose: () => void;
}

export function EmployeeBookingChat({ bookingId, clientName, onClose }: Props) {
  const { user, employee, hasCapability } = useAuth();
  const canSend = hasCapability('div.message_clients');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('messages')
      .select('id, sender_id, sender_name, content, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    if (err) setError('Could not load messages.');
    else setMessages((data as ChatMessage[]) || []);
    setLoading(false);
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const channel = supabase
      .channel(`emp-messages:${bookingId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `booking_id=eq.${bookingId}`,
      }, (payload) => {
        const row = payload.new as ChatMessage;
        setMessages((prev) => prev.some((m) => m.id === row.id) ? prev : [...prev, row]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bookingId]);

  const send = async () => {
    if (!canSend || !user || !text.trim() || sending) return;
    setSending(true);
    setError('');
    const content = text.trim();
    const { error: err } = await supabase.from('messages').insert({
      booking_id: bookingId,
      sender_id: user.id,
      sender_name: employee?.full_name || user.email || 'Staff',
      content,
      is_admin: false,
      category: 'booking',
      priority: 'normal',
    });
    if (err) {
      setError(err.message);
    } else {
      setText('');
      await supabase.rpc('notify_booking_party', {
        p_booking_id: bookingId,
        p_title: 'New message from AlphaTek',
        p_body: content.slice(0, 160),
        p_type: 'message',
      });
    }
    setSending(false);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
        <div
          className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] h-[560px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                <MessageSquare className="w-4.5 h-4.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Client messages</p>
                <p className="text-xs text-slate-400">{clientName || `Booking ${bookingId.slice(0, 8)}`}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 bg-slate-50">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">No messages yet. Send the first update.</p>
            ) : messages.map((m) => {
              const own = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${own ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                    {!own && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{m.sender_name}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className={`text-[10px] mt-1 ${own ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {error && <p className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">{error}</p>}

          {canSend ? (
            <form
              className="p-3 border-t border-slate-100 flex gap-2"
              onSubmit={(e) => { e.preventDefault(); void send(); }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a message to the client…"
                className="flex-1 min-h-[44px] px-3.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="min-w-[44px] min-h-[44px] bg-emerald-600 text-white rounded-xl flex items-center justify-center disabled:opacity-40"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          ) : (
            <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">You can read this thread. Messaging clients requires the Message clients permission.</p>
          )}
        </div>
      </div>
    </Portal>
  );
}
