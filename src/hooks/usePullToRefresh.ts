import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
  enabled?: boolean;
}

interface PullState {
  pulling: boolean;
  progress: number;
  refreshing: boolean;
}

/**
 * usePullToRefresh — attaches a pull-to-refresh gesture to a scroll container.
 * Returns a ref to attach to the scrollable element and the current pull state.
 */
export function usePullToRefresh({ onRefresh, threshold = 70, maxPull = 120, enabled = true }: Options) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [state, setState] = useState<PullState>({ pulling: false, progress: 0, refreshing: false });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || state.refreshing) return;
    const el = ref.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
  }, [enabled, state.refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || state.refreshing) return;
    const el = ref.current;
    if (!el || el.scrollTop > 0) {
      if (state.pulling) setState(s => ({ ...s, pulling: false, progress: 0 }));
      return;
    }
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      if (state.pulling) setState(s => ({ ...s, pulling: false, progress: 0 }));
      return;
    }
    const progress = Math.min(delta / threshold, 1);
    setState({ pulling: true, progress, refreshing: false });
  }, [enabled, state.refreshing, state.pulling, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!state.pulling) return;
    if (state.progress >= 1) {
      setState({ pulling: false, progress: 0, refreshing: true });
      try {
        await onRefresh();
      } finally {
        setState({ pulling: false, progress: 0, refreshing: false });
      }
    } else {
      setState({ pulling: false, progress: 0, refreshing: false });
    }
  }, [state.pulling, state.progress, onRefresh]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, enabled]);

  return { ref, ...state };
}
