import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, Calendar, MessageCircle, Info, Check, CheckCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'booking_update' | 'message' | 'system';
  read: boolean;
  booking_id: string | null;
  created_at: string;
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
      return <Calendar className="w-5 h-5 text-emerald-400" />;
    case 'message':
      return <MessageCircle className="w-5 h-5 text-blue-400" />;
    case 'system':
      return <Info className="w-5 h-5 text-amber-400" />;
    default:
      return <Bell className="w-5 h-5 text-slate-400" />;
  }
}

export function NotificationsPanel({ dark }: { dark?: boolean } = {}) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
          dark ? 'text-slate-400 hover:text-white hover:bg-slate-700/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
        }`}
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/30 ${
            dark ? 'ring-2 ring-slate-900' : 'ring-2 ring-white'
          }`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <div
        className={`absolute right-0 mt-2 w-[380px] max-w-[calc(100vw-1rem)] bg-white border border-slate-200 rounded-xl shadow-2xl shadow-slate-300/40 z-50 overflow-hidden transition-all duration-200 origin-top-right ${
          isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        }`}
        role="menu"
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-emerald-600 rounded-md hover:bg-slate-100 transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto overscroll-contain">
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
                  className={`group flex gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 ${
                    notification.read ? 'bg-white hover:bg-slate-50' : 'bg-emerald-50/50 hover:bg-emerald-50'
                  }`}
                  onClick={() => {
                    if (!notification.read) markAsRead(notification.id);
                    setIsOpen(false);
                  }}
                  role="menuitem"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-9 h-9 flex items-center justify-center rounded-lg ${
                      notification.read ? 'bg-slate-100' : 'bg-emerald-100'
                    }`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-tight truncate ${notification.read ? 'text-slate-600 font-normal' : 'text-slate-900 font-medium'}`}>
                        {notification.title}
                      </p>
                      {!notification.read && <span className="flex-shrink-0 w-2 h-2 mt-1.5 bg-emerald-500 rounded-full" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{notification.body}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{timeAgo(notification.created_at)}</p>
                  </div>
                  {!notification.read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notification.id);
                      }}
                      className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-emerald-600 rounded transition-all"
                      title="Mark as read"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
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
    </div>
  );
}
