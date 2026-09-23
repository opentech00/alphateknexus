import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import {
  dismissNewestToast,
  dismissToast,
  subscribeToasts,
  type ToastItem,
  type ToastKind,
} from './toast';
import { useIncomingNotificationToasts } from './useIncomingNotificationToasts';

const KIND_META: Record<ToastKind, { icon: typeof Info; color: string; bg: string; bar: string }> = {
  success: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500' },
  error: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', bar: 'bg-red-500' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', bar: 'bg-blue-500' },
};

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ToastCard({ item }: { item: ToastItem }) {
  const [visible, setVisible] = useState(prefersReducedMotion());
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const live = item.kind === 'error' ? 'assertive' : 'polite';
  const role = item.kind === 'error' ? 'alert' : 'status';

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(() => dismissToast(item.id), item.duration);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [item.id, item.duration]);

  return (
    <div
      role={role}
      aria-live={live}
      aria-atomic="true"
      className={`pointer-events-auto bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden toast-enter ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
          <Icon className={`w-5 h-5 ${meta.color}`} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
          {item.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{item.body}</p>}
          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action?.onClick();
                dismissToast(item.id);
              }}
              className="mt-2 min-h-[44px] text-xs font-semibold text-emerald-700 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg px-1 -ml-1"
            >
              {item.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismissToast(item.id)}
          className="min-h-[44px] min-w-[44px] p-1 text-slate-300 hover:text-slate-600 rounded-lg transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div className="h-0.5 bg-slate-100" aria-hidden="true">
        <div
          className={`h-full ${meta.bar} toast-progress`}
          style={{ animationDuration: `${item.duration}ms` }}
        />
      </div>
    </div>
  );
}

export function ToastContainer({
  position = 'bottom-right',
  enableIncoming = true,
}: {
  position?: 'bottom-right' | 'top-center';
  enableIncoming?: boolean;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useIncomingNotificationToasts(enableIncoming);

  useEffect(() => subscribeToasts(setToasts), []);

  const onKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') dismissNewestToast();
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (toasts.length === 0) return null;

  const posClass = position === 'top-center'
    ? 'top-16 left-1/2 -translate-x-1/2'
    : 'bottom-4 right-4';

  return (
    <div
      className={`fixed ${posClass} z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto pointer-events-none`}
      aria-label="Notifications"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
