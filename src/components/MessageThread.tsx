import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageSquare, Shield, X, ImagePlus, Loader2, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { openDocument } from '../lib/storageUrls';
import { SignedImage } from './SignedImage';
import { useAuth } from '../contexts/AuthContext';

interface Message {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_name: string;
  content: string | null;
  is_admin: boolean;
  created_at: string;
  attachment_url: string | null;
  attachment_name: string | null;
}

interface MessageThreadProps {
  bookingId: string;
  onClose?: () => void;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function MessageThread({ bookingId, onClose }: MessageThreadProps) {
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ url: string; path: string; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`messages:booking_id=eq.${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookingId]);

  async function fetchMessages() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('messages')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (err) {
      setError('Failed to load messages');
    } else {
      setMessages(data || []);
    }
    setLoading(false);
  }

  const handleImageSelect = async (file: File) => {
    setError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Only JPG, PNG, WebP, and GIF images are supported.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Image must be under 5MB.');
      return;
    }
    if (!user) return;

    setUploadingImage(true);
    try {
      const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
      const filePath = `${user.id}/${bookingId}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        setError('We could not upload that image. Please try a different file.');
        return;
      }

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);
      setPendingImage({ url: urlData.publicUrl, path: filePath, name: file.name });
    } catch {
      setError('An unexpected error occurred during upload.');
    } finally {
      setUploadingImage(false);
    }
  };

  const removePendingImage = async () => {
    if (pendingImage) {
      await supabase.storage.from('documents').remove([pendingImage.path]);
      setPendingImage(null);
    }
  };

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if ((!newMessage.trim() && !pendingImage) || !user || sending) return;

    setSending(true);
    const messageContent = newMessage.trim() || null;
    const imageAttachment = pendingImage;
    setNewMessage('');

    try {
      const { error: insertError } = await supabase.from('messages').insert({
        booking_id: bookingId,
        sender_id: user.id,
        sender_name: user.user_metadata?.full_name || user.email || 'User',
        content: messageContent,
        is_admin: isAdmin,
        attachment_url: imageAttachment?.url ?? null,
        attachment_name: imageAttachment?.name ?? null,
        category: 'general',
        priority: 'normal',
      });

      if (insertError) {
        setError(insertError.message);
        setNewMessage(messageContent ?? '');
      } else {
        setPendingImage(null);
      }
    } catch {
      setError('Failed to send message.');
      setNewMessage(messageContent ?? '');
    } finally {
      setSending(false);
    }
  }

  function formatTimestamp(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function isOwnMessage(message: Message) {
    return user?.id === message.sender_id;
  }

  return (
    <div className="flex flex-col h-full max-h-[600px] w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500/20 backdrop-blur-sm">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight">Messages</h3>
            <p className="text-xs text-slate-300 truncate max-w-[180px]">
              Booking #{bookingId.slice(0, 8)}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors duration-200"
            aria-label="Close message thread"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50 scroll-smooth"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-slate-300" />
              <p className="text-sm text-slate-400">Loading messages...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <MessageSquare className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium text-sm">No messages yet</p>
            <p className="text-slate-400 text-xs mt-1">
              Start the conversation by sending a message below.
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const own = isOwnMessage(message);
            const showSenderName =
              index === 0 || messages[index - 1].sender_id !== message.sender_id;

            return (
              <div
                key={message.id}
                className={`flex flex-col ${own ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}
              >
                {showSenderName && (
                  <div
                    className={`flex items-center gap-1.5 mb-1 px-1 ${own ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {message.is_admin && (
                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span className="text-xs font-medium text-slate-500">
                      {own ? 'You' : message.sender_name}
                    </span>
                  </div>
                )}
                <div
                  className={`relative max-w-[80%] px-4 py-2.5 rounded-2xl shadow-sm transition-all duration-200 hover:shadow-md ${
                    own
                      ? 'bg-emerald-600 text-white rounded-br-md'
                      : message.is_admin
                        ? 'bg-white text-slate-800 border border-emerald-200 rounded-bl-md'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'
                  }`}
                >
                  {message.is_admin && !own && (
                    <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200">
                      <Shield className="w-3 h-3 text-emerald-700" />
                    </div>
                  )}
                  {message.attachment_url && (
                    <div className="mb-2">
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); openDocument(message.attachment_url!); }}
                        className="block rounded-lg overflow-hidden group/attach"
                      >
                        <SignedImage
                          source={message.attachment_url}
                          alt={message.attachment_name || 'Attachment'}
                          className="max-w-full max-h-48 object-cover transition-transform duration-200 group-hover/attach:scale-105"
                        />
                      </a>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); openDocument(message.attachment_url!); }}
                        className={`inline-flex items-center gap-1 mt-1.5 text-xs ${own ? 'text-emerald-100 hover:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        <Download className="w-3 h-3" />
                        {message.attachment_name || 'Download'}
                      </a>
                    </div>
                  )}
                  {message.content && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[10px] text-slate-400 mt-1 px-1 ${own ? 'text-right' : 'text-left'}`}
                >
                  {formatTimestamp(message.created_at)}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending image preview */}
      {pendingImage && (
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 border-t border-slate-200">
          <SignedImage
            source={pendingImage.url}
            alt="Pending"
            className="w-12 h-12 object-cover rounded-lg border border-slate-300"
          />
          <span className="flex-1 text-xs text-slate-500 truncate">{pendingImage.name}</span>
          <button
            onClick={removePendingImage}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 px-4 py-3 bg-white border-t border-slate-100"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageSelect(file);
            e.target.value = '';
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage || sending}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95"
          aria-label="Attach image"
        >
          {uploadingImage ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )}
        </button>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-full outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all duration-200 placeholder:text-slate-400"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={(!newMessage.trim() && !pendingImage) || sending}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg disabled:shadow-none"
          aria-label="Send message"
        >
          <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
        </button>
      </form>
    </div>
  );
}
