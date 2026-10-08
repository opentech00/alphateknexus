import { isIosDevice } from './pwa';

const COMPACT_MQ = '(max-width: 767px)';
const TOUCH_TABLET_MQ = '(pointer: coarse) and (max-width: 1023px)';

export function subscribeMediaQuery(mq: MediaQueryList, handler: () => void): () => void {
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }
  const legacy = mq as MediaQueryList & {
    addListener?: (cb: () => void) => void;
    removeListener?: (cb: () => void) => void;
  };
  legacy.addListener?.(handler);
  return () => legacy.removeListener?.(handler);
}

/** iPhone (any orientation, including Pro Max landscape) always uses the mobile shell. */
export function isCompactViewport(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (isIosDevice() && /iPhone|iPod/i.test(navigator.userAgent)) return true;
    return window.matchMedia(COMPACT_MQ).matches
      || window.matchMedia(TOUCH_TABLET_MQ).matches;
  } catch {
    return window.innerWidth < 768;
  }
}

export function subscribeCompactViewport(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const compact = window.matchMedia(COMPACT_MQ);
  const tablet = window.matchMedia(TOUCH_TABLET_MQ);
  const unsubA = subscribeMediaQuery(compact, handler);
  const unsubB = subscribeMediaQuery(tablet, handler);
  window.addEventListener('orientationchange', handler);
  window.addEventListener('resize', handler);
  return () => {
    unsubA();
    unsubB();
    window.removeEventListener('orientationchange', handler);
    window.removeEventListener('resize', handler);
  };
}
