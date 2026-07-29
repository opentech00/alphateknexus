import { useState, useRef, useEffect } from 'react';
import { Bell, Calendar, MessageCircle, Info, Check, CheckCheck, X, ArrowRight } from 'lucide-react';
import { useAdminNotifications } from '../admin/contexts/AdminNotificationsContext';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'booking_update' | 'message' | 'system';
  read: boolean;
  booking_id: string | null;
  service_slug: string | null;
  created_at: string;
}

const SLUG_TO_PAGE: Record<string, string> = {
  'clearing-forwarding': 'division-cf',
  'waste-management': 'division-smart-sort',
  'cleaning-janitorial': 'division-cleaning',
  'private-security': 'division-security',
  'procurement': 'division-procurement',
};

const SLUG_LABEL: Record<string, string> = {
  'clearing-forwarding': 'Clearing & Forwarding',
  'waste-management': 'Smart Sort',
  'cleaning-janitorial': 'Cleaning',
  'private-security': 'Security',
  'procurement': 'Procurement',
};

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

export function AdminNotificationsBell({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useAdminNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  const handleClickNotification = (notification: Notification) => {
    if (!notification.read) markAsRead(notification.id);
    if (notification.service_slug && onNavigate) {
      const page = SLUG_TO_PAGE[notification.service_slug];
      if (page) onNavigate(page);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-400 hover:text-white hover:bg-slate-700/50"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-emerald-500 rounded-full ring-2 ring-slate-900 shadow-sm shadow-emerald-500/30 animate-pulse-slow">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <div
        className={`absolute right-0 mt-2 w-[380px] max-w-[calc(100vw-1rem)] bg-slate-800 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden transition-all duration-200 origin-top-right ${
          isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        }`}
        role="menu"
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-emerald-400 rounded-md hover:bg-slate-700/50 transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-700/50 transition-colors"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto overscroll-contain">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="w-12 h-12 flex items-center justify-center bg-slate-700/50 rounded-full mb-3">
                <Bell className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400 text-center">No notifications yet</p>
              <p className="text-xs text-slate-500 text-center mt-1">We'll notify you when something happens</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`group flex gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 ${
                    notification.read ? 'bg-transparent hover:bg-slate-700/30' : 'bg-emerald-500/5 hover:bg-emerald-500/10'
                  }`}
                  onClick={() => handleClickNotification(notification)}
                  role="menuitem"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-9 h-9 flex items-center justify-center bg-slate-700/50 rounded-lg">
                      {getNotificationIcon(notification.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-tight truncate ${notification.read ? 'text-slate-300 font-normal' : 'text-white font-medium'}`}>
                        {notification.title}
                      </p>
                      {!notification.read && <span className="flex-shrink-0 w-2 h-2 mt-1.5 bg-emerald-400 rounded-full" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{notification.body}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="text-[11px] text-slate-500">{timeAgo(notification.created_at)}</p>
                      {notification.service_slug && SLUG_LABEL[notification.service_slug] && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 bg-emerald-500/10 rounded">
                          {SLUG_LABEL[notification.service_slug]}
                        </span>
                      )}
                      {notification.service_slug && onNavigate && SLUG_TO_PAGE[notification.service_slug] && (
                        <span className="ml-auto flex items-center gap-0.5 text-[10px] text-slate-500 group-hover:text-emerald-400 transition-colors">
                          Open <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                  {!notification.read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notification.id);
                      }}
                      className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-emerald-400 rounded transition-all"
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
          <div className="px-4 py-2.5 bg-slate-900/40 border-t border-slate-700">
            <p className="text-[11px] text-slate-500 text-center">
              Showing latest {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
