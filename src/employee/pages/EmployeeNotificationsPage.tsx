import { useState } from 'react';
import {
  Bell, Calendar, MessageCircle, Info, Check, CheckCheck,
  Briefcase, Banknote, Shield, AlertTriangle, Star, Package, Loader2,
} from 'lucide-react';
import { useEmployeeNotifications, type EmployeeNotification } from '../contexts/EmployeeNotificationsContext';
import { NotificationPreferencesPanel } from '../../components/NotificationPreferencesPanel';

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
  booking_update: 'text-emerald-500 bg-emerald-50',
  message: 'text-blue-500 bg-blue-50',
  system: 'text-amber-500 bg-amber-50',
  hr_update: 'text-violet-500 bg-violet-50',
  payment: 'text-emerald-600 bg-emerald-50',
  field_dispatch: 'text-cyan-500 bg-cyan-50',
  incident: 'text-red-500 bg-red-50',
  review_prompt: 'text-amber-400 bg-amber-50',
  subscription: 'text-cyan-600 bg-cyan-50',
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

function fmtFull(dateString: string): string {
  return new Date(dateString).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function EmployeeNotificationsPage() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useEmployeeNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [showPrefs, setShowPrefs] = useState(false);

  const filtered = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  if (showPrefs) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Notification Settings</h2>
          <button
            onClick={() => setShowPrefs(false)}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Back to notifications
          </button>
        </div>
        <div className="max-w-2xl">
          <NotificationPreferencesPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-slate-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-400">Stay updated on activities across all divisions</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === 'unread' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Unread
            {unreadCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-emerald-500 rounded-full">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-emerald-600 bg-white border border-slate-200 rounded-lg hover:border-emerald-200 transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
          <button
            onClick={() => setShowPrefs(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
          >
            Settings
          </button>
        </div>
      </div>

      {/* List */}
      {loading && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Bell className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </h3>
          <p className="text-sm text-slate-500">
            {filter === 'unread' ? 'You are all caught up.' : 'You will see updates here as they happen.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map((n: EmployeeNotification) => {
              const Icon = TYPE_ICON[n.type] ?? Bell;
              const colorCls = TYPE_COLOR[n.type] ?? 'text-slate-400 bg-slate-100';
              return (
                <div
                  key={n.id}
                  className={`group flex gap-4 px-5 py-4 transition-colors duration-150 ${
                    n.read ? 'hover:bg-slate-50' : 'bg-emerald-50/40 hover:bg-emerald-50/70'
                  }`}
                >
                  <div className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl ${colorCls}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {!n.read && <span className="flex-shrink-0 w-2 h-2 bg-emerald-500 rounded-full" />}
                          <p className={`text-sm truncate ${n.read ? 'text-slate-700 font-normal' : 'text-slate-900 font-semibold'}`}>
                            {n.title}
                          </p>
                        </div>
                        <p className="text-sm text-slate-500 leading-relaxed">{n.body}</p>
                      </div>
                      {!n.read && (
                        <button
                          onClick={() => markAsRead(n.id)}
                          className="flex-shrink-0 p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors opacity-0 group-hover:opacity-100"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] text-slate-400">{fmtFull(n.created_at)}</span>
                      <span className="text-[11px] text-slate-300">·</span>
                      <span className="text-[11px] text-slate-400">{timeAgo(n.created_at)}</span>
                      {TYPE_LABEL[n.type] && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 rounded">
                          {TYPE_LABEL[n.type]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
