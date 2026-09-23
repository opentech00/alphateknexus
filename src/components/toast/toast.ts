export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastPayload {
  title: string;
  body?: string;
  duration?: number;
  action?: ToastAction;
  id?: string;
}

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  duration: number;
  action?: ToastAction;
}

export interface IncomingNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  booking_id?: string | null;
  service_slug?: string | null;
  metadata?: Record<string, unknown> | null;
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 7000,
};

const MAX_STACK = 3;
const DEDUPE_MS = 1000;
const SUPPRESS_INCOMING_MS = 2000;

type Listener = (toasts: ToastItem[]) => void;

let stack: ToastItem[] = [];
const listeners = new Set<Listener>();
let lastPush = { title: '', at: 0 };
let suppressIncomingUntil = 0;

function emit() {
  const snapshot = stack.slice();
  listeners.forEach((fn) => fn(snapshot));
}

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn);
  fn(stack.slice());
  return () => { listeners.delete(fn); };
}

export function dismissToast(id: string) {
  stack = stack.filter((t) => t.id !== id);
  emit();
}

export function dismissNewestToast() {
  if (stack.length === 0) return;
  stack = stack.slice(1);
  emit();
}

function push(kind: ToastKind, payload: ToastPayload | string) {
  const p: ToastPayload = typeof payload === 'string' ? { title: payload } : payload;
  const now = Date.now();
  if (p.title === lastPush.title && now - lastPush.at < DEDUPE_MS) return;
  lastPush = { title: p.title, at: now };

  if (kind !== 'info') {
    suppressIncomingUntil = now + SUPPRESS_INCOMING_MS;
  }

  const item: ToastItem = {
    id: p.id || `toast_${now}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    title: p.title,
    body: p.body,
    duration: p.duration ?? DEFAULT_DURATION[kind],
    action: p.action,
  };
  stack = [item, ...stack.filter((t) => t.id !== item.id)].slice(0, MAX_STACK);
  emit();
}

export const toast = {
  success: (payload: ToastPayload | string) => push('success', payload),
  error: (payload: ToastPayload | string) => push('error', payload),
  info: (payload: ToastPayload | string) => push('info', payload),
  warning: (payload: ToastPayload | string) => push('warning', payload),
};

export function isIncomingToastSuppressed() {
  return Date.now() < suppressIncomingUntil;
}

type OpenHandler = (n: IncomingNotification) => void;
let openHandler: OpenHandler | null = null;

export function registerToastNotificationOpener(fn: OpenHandler | null) {
  openHandler = fn;
  return () => {
    if (openHandler === fn) openHandler = null;
  };
}

export function openIncomingNotification(n: IncomingNotification) {
  openHandler?.(n);
}
