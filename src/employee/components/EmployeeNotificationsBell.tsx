import { useState, useRef, useEffect } from 'react';
import {
  Bell, Calendar, MessageCircle, Info, Check, CheckCheck, X,
  Briefcase, Banknote, Shield, AlertTriangle, Star, Package, ArrowRight,
} from 'lucide-react';
import { useEmployeeNotifications, type EmployeeNotification } from '../contexts/EmployeeNotificationsContext';

const TYPE_ICON: Record<string, typeof Bell> = {
  booking_update: Calendar,
  message: MessageCircle,
  system: Info,
  hr_update: Briefcase,
  payment: Banknote,
  field_dispatch: Package,
  incident: AlertTriangle,
  review_prompt: Star,
  subscription: Package,
};

const TYPE_COLOR: Record<string, string> = {
  booking_update: 'text-emerald-500',
  message: 'text-blue-500',
  system: 'text-amber-500',
  hr_update: 'text-violet-500',
  payment: 'text-emerald-600',
  field_dispatch: 'text-cyan-500',
  incident: 'text-red-500',
  review_prompt: 'text-amber-400',
  subscription: 'text-cyan-600',
};

const TYPE_LABEL: Record<string, string> = {
  booking_update: 'Booking',
  message: 'Message',
  system: 'System',
  hr_update: 'HR',
  payment: 'Payment',
  field_dispatch: 'Dispatch',
  incident: 'Incident',
  review_prompt: 'Review',
  subscription: 'Subscription',
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
  return date.toLocaleDateString();
}

function getIcon(type: string) {
  const Icon = TYPE_ICON[type] ?? Bell;
  const color = TYPE_COLOR[type] ?? 'text-slate-400';
  return <Icon className={`w-5 h-5 ${color}`} />;
}

export function EmployeeNotificationsBell({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useEmployeeNotifications();
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

  const handleClick = (n: EmployeeNotification) => {
    if (!n.read) markAsRead(n.id);
    setIsOpen(false);
    if (onNavigate) onNavigate('notifications');
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-emerald-500 rounded-full ring-2 ring-white shadow-sm">
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
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded-full border border-emerald-200">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-emerald-600 rounded-md hover:bg-emerald-50 transition-colors"
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
                <Bell className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 text-center">No notifications yet</p>
              <p className="text-xs text-slate-400 text-center mt-1">You'll see updates here as they happen</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`group flex gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 ${
                    n.read ? 'bg-white hover:bg-slate-50' : 'bg-emerald-50/50 hover:bg-emerald-50'
                  }`}
                  onClick={() => handleClick(n)}
                  role="menuitem"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-9 h-9 flex items-center justify-center bg-slate-100 rounded-lg">
                      {getIcon(n.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-tight truncate ${n.read ? 'text-slate-600 font-normal' : 'text-slate-900 font-medium'}`}>
                        {n.title}
                      </p>
                      {!n.read && <span className="flex-shrink-0 w-2 h-2 mt-1.5 bg-emerald-500 rounded-full" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                      {TYPE_LABEL[n.type] && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 rounded">
                          {TYPE_LABEL[n.type]}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-0.5 text-[10px] text-slate-400 group-hover:text-emerald-600 transition-colors">
                        Open <ArrowRight className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  </div>
                  {!n.read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
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
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200">
            <p className="text-[11px] text-slate-400 text-center">
              Showing latest {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
