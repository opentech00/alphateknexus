import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { openDocument } from '../../lib/storageUrls';
import { SignedImage } from '../../components/SignedImage';
import { PageHeader, StatCard, Card, EmptyState, Spinner, ErrorBanner } from '../components/ui';
import {
  MessageSquare, Filter, Search, Send, Inbox, Tag, AlertCircle,
  CheckCircle2, Clock, Zap, DollarSign, Calendar, Briefcase,
  Volume2, VolumeX, ArrowLeft, Paperclip, X, Loader2,
} from 'lucide-react';

interface AdminMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_name: string;
  content: string | null;
  is_admin: boolean;
  created_at: string;
  attachment_url: string | null;
  attachment_name: string | null;
  category: string;
  priority: string;
  bookings?: { id: string; contact_name: string; services?: { name: string } | null } | null;
}

interface Conversation {
  booking_id: string;
  booking?: { id: string; contact_name: string; services?: { name: string } | null } | null;
  messages: AdminMessage[];
  lastMessageAt: string;
  unreadCount: number;
  category: string;
  priority: string;
}

const CATEGORIES = [
  { key: 'general', label: 'General', icon: MessageSquare, color: 'text-slate-600 bg-slate-50 border-slate-200' },
  { key: 'inquiry', label: 'Inquiry', icon: HelpCircle, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { key: 'booking', label: 'Booking', icon: Briefcase, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { key: 'complaint', label: 'Complaint', icon: AlertCircle, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { key: 'urgent', label: 'Urgent', icon: Zap, color: 'text-red-600 bg-red-50 border-red-200' },
  { key: 'payment', label: 'Payment', icon: DollarSign, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { key: 'schedule', label: 'Schedule', icon: Calendar, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
];

const PRIORITIES = [
  { key: 'low', label: 'Low', color: 'text-slate-500 bg-slate-100' },
  { key: 'normal', label: 'Normal', color: 'text-blue-500 bg-blue-100' },
  { key: 'high', label: 'High', color: 'text-orange-500 bg-orange-100' },
  { key: 'critical', label: 'Critical', color: 'text-red-500 bg-red-100' },
];

function HelpCircle(props: any) {
  return <MessageSquare {...props} />;
}

export function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [updateCategory, setUpdateCategory] = useState<string>('');
  const [updatePriority, setUpdatePriority] = useState<string>('');
  const lastMessageIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      // Two-tone chime
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const start = now + i * 0.12;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch {
      // AudioContext not available
    }
  }, [soundEnabled]);

  const loadMessages = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('messages')
        .select('id, booking_id, sender_id, sender_name, content, is_admin, created_at, attachment_url, attachment_name, category, priority, bookings(id, contact_name, services(name))')
        .order('created_at', { ascending: true })
        .limit(500);

      if (err) throw err;

      const messages = (data || []) as unknown as AdminMessage[];

      // Detect new incoming messages for sound
      const currentIds = new Set(messages.map(m => m.id));
      const newIncoming = messages.filter(m =>
        !m.is_admin && !lastMessageIdsRef.current.has(m.id)
      );
      if (lastMessageIdsRef.current.size > 0 && newIncoming.length > 0) {
        playNotificationSound();
      }
      lastMessageIdsRef.current = currentIds;

      // Group by booking_id
      const convMap = new Map<string, Conversation>();
      for (const msg of messages) {
        if (!convMap.has(msg.booking_id)) {
          convMap.set(msg.booking_id, {
            booking_id: msg.booking_id,
            booking: msg.bookings,
            messages: [],
            lastMessageAt: msg.created_at,
            unreadCount: 0,
            category: msg.category,
            priority: msg.priority,
          });
        }
        const conv = convMap.get(msg.booking_id)!;
        conv.messages.push(msg);
        if (new Date(msg.created_at) > new Date(conv.lastMessageAt)) {
          conv.lastMessageAt = msg.created_at;
        }
        conv.category = msg.category;
        conv.priority = msg.priority;
        if (!msg.is_admin) conv.unreadCount++;
      }

      const convs = Array.from(convMap.values()).sort((a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );

      setConversations(convs);
    } catch (err: any) {
      setError(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [playNotificationSound]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { loadMessages(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadMessages]);

  const handleSendReply = async () => {
    if (!selectedBookingId || !replyText.trim()) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase.from('messages').insert({
        booking_id: selectedBookingId,
        sender_id: user?.id,
        sender_name: user?.user_metadata?.full_name || user?.email || 'Admin',
        content: replyText.trim(),
        is_admin: true,
        category: 'general',
        priority: 'normal',
      });
      if (err) throw err;
      setReplyText('');
      loadMessages();
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateCategory = async (bookingId: string, category: string) => {
    try {
      const { error: err } = await supabase
        .from('messages')
        .update({ category })
        .eq('booking_id', bookingId);
      if (err) throw err;
      loadMessages();
    } catch (err: any) {
      setError(err.message || 'Failed to update category');
    }
  };

  const handleUpdatePriority = async (bookingId: string, priority: string) => {
    try {
      const { error: err } = await supabase
        .from('messages')
        .update({ priority })
        .eq('booking_id', bookingId);
      if (err) throw err;
      loadMessages();
    } catch (err: any) {
      setError(err.message || 'Failed to update priority');
    }
  };

  const filteredConversations = conversations.filter(c => {
    if (filterCategory !== 'all' && c.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.booking?.contact_name?.toLowerCase().includes(q) ||
        c.booking?.services?.name?.toLowerCase().includes(q) ||
        c.messages.some(m => m.content?.toLowerCase().includes(q) || m.sender_name?.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedConv = conversations.find(c => c.booking_id === selectedBookingId);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const urgentCount = conversations.filter(c => c.category === 'urgent' || c.priority === 'critical').length;
  const complaintCount = conversations.filter(c => c.category === 'complaint').length;

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Customer messages with smart categorization for easy staff management"
        icon={MessageSquare}
        actions={
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-colors ${
              soundEnabled ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {soundEnabled ? 'Sound On' : 'Sound Off'}
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Conversations" value={conversations.length} icon={Inbox} color="text-blue-600" accent="bg-blue-50" />
        <StatCard label="Unread" value={totalUnread} icon={MessageSquare} color="text-amber-600" accent="bg-amber-50" />
        <StatCard label="Urgent" value={urgentCount} icon={Zap} color="text-red-600" accent="bg-red-50" />
        <StatCard label="Complaints" value={complaintCount} icon={AlertCircle} color="text-orange-600" accent="bg-orange-50" />
      </div>

      {selectedConv ? (
        // Conversation detail view
        <div>
          <button
            onClick={() => setSelectedBookingId(null)}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to conversations
          </button>

          <Card className="p-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm text-slate-900">{selectedConv.booking?.contact_name || 'Customer'}</p>
                <p className="text-xs text-slate-400">{selectedConv.booking?.services?.name || 'Service'}</p>
              </div>
              <div className="flex gap-2">
                <select
                  value={selectedConv.category}
                  onChange={e => handleUpdateCategory(selectedConv.booking_id, e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select
                  value={selectedConv.priority}
                  onChange={e => handleUpdatePriority(selectedConv.booking_id, e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {selectedConv.messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.is_admin ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    msg.is_admin
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}>
                    {!msg.is_admin && (
                      <p className={`text-[10px] font-semibold mb-0.5 ${getCategoryColor(msg.category)}`}>
                        {msg.sender_name}
                      </p>
                    )}
                    {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                    {msg.attachment_url && (
                      <a href="#" onClick={(e) => { e.preventDefault(); openDocument(msg.attachment_url!); }} className="block mt-2">
                        <SignedImage source={msg.attachment_url} alt={msg.attachment_name || 'attachment'} className="max-w-full rounded-lg max-h-40" />
                      </a>
                    )}
                    <p className={`text-[9px] mt-1 ${msg.is_admin ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply box */}
            <div className="border-t border-slate-200 p-3 flex gap-2">
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                placeholder="Type a reply..."
                className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleSendReply}
                disabled={sending || !replyText.trim()}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </Card>
        </div>
      ) : (
        // Conversation list view
        <>
          {/* Category filter chips */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                filterCategory === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              All Categories
            </button>
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const count = conversations.filter(c => c.category === cat.key).length;
              return (
                <button
                  key={cat.key}
                  onClick={() => setFilterCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    filterCategory === cat.key ? cat.color : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {cat.label}
                  {count > 0 && <span className="ml-0.5 text-[9px] opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by customer, service, or message content..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {filteredConversations.length === 0 ? (
            <EmptyState icon={Inbox} title="No messages" description="Customer messages will appear here, categorized for easy management" />
          ) : (
            <div className="space-y-2">
              {filteredConversations.map(conv => {
                const lastMsg = conv.messages[conv.messages.length - 1];
                const cat = CATEGORIES.find(c => c.key === conv.category) || CATEGORIES[0];
                const CatIcon = cat.icon;
                const prio = PRIORITIES.find(p => p.key === conv.priority) || PRIORITIES[1];

                return (
                  <button
                    key={conv.booking_id}
                    onClick={() => setSelectedBookingId(conv.booking_id)}
                    className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${cat.color.split(' ').slice(1).join(' ')}`}>
                        <CatIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm text-slate-900 truncate">{conv.booking?.contact_name || 'Customer'}</p>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{timeAgo(conv.lastMessageAt)}</span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">{conv.booking?.services?.name || 'Service'}</p>
                        <p className="text-xs text-slate-500 truncate mt-1">
                          {lastMsg?.is_admin && <span className="text-emerald-500">You: </span>}
                          {lastMsg?.content || (lastMsg?.attachment_url ? '📎 Attachment' : 'No content')}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${cat.color}`}>
                            {cat.label}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${prio.color}`}>
                            {prio.label}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-white">
                              {conv.unreadCount} new
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getCategoryColor(category: string): string {
  const cat = CATEGORIES.find(c => c.key === category);
  return cat ? cat.color.split(' ')[0] : 'text-slate-600';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
