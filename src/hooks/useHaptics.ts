/**
 * useHaptics — native haptic vibration feedback for mobile.
 * Detects Capacitor native Haptics plugin or falls back to Web Vibration API.
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 8,
  medium: 18,
  heavy: 35,
  selection: 5,
  success: [10, 25, 10],
  warning: [15, 40, 15],
  error: [35, 70, 35, 70, 35],
};

export function useHaptics() {
  const vibrate = (pattern: HapticPattern = 'light') => {
    try {
      // Check Capacitor native Haptics if available on window
      const capacitorWindow = window as any;
      if (capacitorWindow?.Capacitor?.isNativePlatform() && capacitorWindow?.Capacitor?.Plugins?.Haptics) {
        const Haptics = capacitorWindow.Capacitor.Plugins.Haptics;
        if (pattern === 'selection') {
          Haptics.selectionStart();
        } else if (pattern === 'success' || pattern === 'warning' || pattern === 'error') {
          Haptics.notification({ type: pattern.toUpperCase() });
        } else {
          Haptics.impact({ style: pattern === 'heavy' ? 'HEAVY' : pattern === 'medium' ? 'MEDIUM' : 'LIGHT' });
        }
        return;
      }

      // Web Vibration API fallback
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(PATTERNS[pattern]);
      }
    } catch {
      // Ignore vibration errors gracefully on unsupported platforms
    }
  };

  return { vibrate };
}

