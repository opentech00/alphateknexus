import { Capacitor } from '@capacitor/core';

/**
 * Ensures notch / status-bar insets exist when the WebView overlays the
 * system UI (Capacitor) or when installed as a standalone PWA.
 */
export function applySafeAreaFallback(): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const native = Capacitor.isNativePlatform();
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

  if (native || standalone) {
    root.classList.add('is-standalone');
  }
  if (native) {
    root.classList.add('is-native');
    // Android overlay WebViews often report 0 for env(safe-area-inset-top).
    root.style.setProperty('--sat-fallback', '28px');
  }
}
