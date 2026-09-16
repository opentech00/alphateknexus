import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

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

const IMPACT: Record<'light' | 'medium' | 'heavy', ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

const NOTIFICATION: Record<'success' | 'warning' | 'error', NotificationType> = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
};

export function useHaptics() {
  const vibrate = (pattern: HapticPattern = 'light') => {
    try {
      if (Capacitor.isNativePlatform()) {
        if (pattern === 'selection') {
          void Haptics.selectionStart();
          return;
        }
        if (pattern === 'success' || pattern === 'warning' || pattern === 'error') {
          void Haptics.notification({ type: NOTIFICATION[pattern] });
          return;
        }
        void Haptics.impact({ style: IMPACT[pattern] });
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(PATTERNS[pattern]);
      }
    } catch {
      // Ignore vibration errors on unsupported platforms
    }
  };

  return { vibrate };
}
