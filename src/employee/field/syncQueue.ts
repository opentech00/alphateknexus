import type { SyncQueueItem } from './types';

const STORAGE_KEY = 'field_staff_sync_queue';

function readQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as SyncQueueItem[] : [];
  } catch {
    return [];
  }
}

function writeQueue(items: SyncQueueItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage full or unavailable — silently drop
  }
}

export function enqueueSync(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'attempts' | 'status'>): SyncQueueItem {
  const full: SyncQueueItem = {
    ...item,
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  };
  const q = readQueue();
  q.push(full);
  writeQueue(q);
  return full;
}

export function getQueue(): SyncQueueItem[] {
  return readQueue();
}

export function updateQueueItem(id: string, patch: Partial<SyncQueueItem>): void {
  const q = readQueue().map(item => item.id === id ? { ...item, ...patch } : item);
  writeQueue(q);
}

export function removeQueueItem(id: string): void {
  writeQueue(readQueue().filter(item => item.id !== id));
}

export function clearQueue(): void {
  writeQueue([]);
}

export function getPendingCount(): number {
  return readQueue().filter(i => i.status === 'pending' || i.status === 'failed').length;
}
