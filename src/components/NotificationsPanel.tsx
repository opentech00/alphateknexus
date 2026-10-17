import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Calendar, MessageCircle, Info, Check, CheckCheck, X, Trash2, Megaphone } from 'lucide-react';
import { campaignIdFromNotification, trackCampaignEvent } from '../lib/campaigns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { openIncomingNotification } from './toast/toast';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  booking_id: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toLocaleDateString();
}

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'booking_update':
      return <Calendar className="w-5 h-5 text-emerald-500" />;
    case 'message':
      return <MessageCircle className="w-5 h-5 text-blue-500" />;
    case 'announcement':
      return <Megaphone className="w-5 h-5 text-violet-500" />;
    case 'system':
      return <Info className="w-5 h-5 text-amber-500" />;
    default:
      return <Bell className="w-5 h-5 text-slate-400" />;
  }
}

export function NotificationsPanel({ dark }: { dark?: boolean } = {}) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setNotifications(data as Notification[]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-realtime-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications((prev) => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications((prev) =>
              prev.map((n) => (n.id === (payload.new as Notification).id ? (payload.new as Notification) : n))
            );
          } else if (payload.eventType === 'DELETE') {
            setNotifications((prev) => prev.filter((n) => n.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) fetchNotifications();
  };

  const clearAll = async () => {
    if (!user || notifications.length === 0) return;
    setNotifications([]);
    const { error } = await supabase.from('notifications').delete().eq('user_id', user.id);
    if (error) fetchNotifications();
  };

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    if (!isOpen) return;
    document.addEventListener('keydown', handleEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const openNotification = (notification: Notification) => {
    if (!notification.read) markAsRead(notification.id);
    const campaignId = campaignIdFromNotification(notification);
    if (campaignId) trackCampaignEvent(campaignId, 'click', 'notification');
    setIsOpen(false);
    openIncomingNotification(notification);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
          dark ? 'text-slate-400 hover:text-white hover:bg-slate-700/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
        }`}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className={`absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/30 ${
            dark ? 'ring-2 ring-slate-900' : 'ring-2 ring-white'
          }`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[200]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close notifications"
            onClick={() => setIsOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="absolute flex flex-col bg-white border border-slate-200 shadow-2xl overflow-hidden
              inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] rounded-2xl
              sm:inset-x-auto sm:right-3 sm:top-[max(4.5rem,env(safe-area-inset-top))] sm:bottom-auto sm:w-[min(24rem,calc(100vw-1.5rem))] sm:max-h-[min(32rem,calc(100dvh-6rem))] sm:rounded-xl
              lg:right-6"
          >
            <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-slate-800">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full whitespace-nowrap">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 ml-auto">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="inline-flex items-center justify-center gap-1 min-h-[44px] px-2 text-xs text-slate-600 hover:text-emerald-700 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Mark read</span>
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex items-center justify-center gap-1 min-h-[44px] px-2 text-xs text-red-600 hover:text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear all</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                  aria-label="Close notifications"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <div className="w-12 h-12 flex items-center justify-center bg-slate-100 rounded-full mb-3">
                    <Bell className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-500 text-center">No notifications yet</p>
                  <p className="text-xs text-slate-400 text-center mt-1">We'll notify you when something happens</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`flex items-stretch gap-1 sm:gap-2 px-2 sm:px-3 py-2 ${
                        notification.read ? 'bg-white' : 'bg-emerald-50/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openNotification(notification)}
                        className="flex flex-1 min-w-0 gap-3 px-1 py-1 text-left rounded-lg hover:bg-slate-50/80"
                      >
                        <span className={`mt-0.5 w-9 h-9 shrink-0 flex items-center justify-center rounded-lg ${
                          notification.read ? 'bg-slate-100' : 'bg-emerald-100'
                        }`}>
                          {getNotificationIcon(notification.type)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className={`text-sm leading-tight break-words ${notification.read ? 'text-slate-600 font-normal' : 'text-slate-900 font-medium'}`}>
                              {notification.title}
                            </span>
                            {!notification.read && <span className="mt-1.5 w-2 h-2 shrink-0 bg-emerald-500 rounded-full" />}
                          </span>
                          <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{notification.body}</span>
                          <span className="block text-[11px] text-slate-400 mt-1">{timeAgo(notification.created_at)}</span>
                        </span>
                      </button>
                      <div className="flex flex-col justify-center shrink-0">
                        {!notification.read && (
                          <button
                            type="button"
                            onClick={() => markAsRead(notification.id)}
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-slate-400 hover:text-emerald-600 rounded-lg"
                            aria-label="Mark as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteNotification(notification.id)}
                          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-slate-400 hover:text-red-600 rounded-lg"
                          aria-label="Delete notification"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
                <p className="text-[11px] text-slate-400 text-center">
                  Showing latest {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
