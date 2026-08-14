/**
 * useHaptics — lightweight vibration feedback for mobile.
 * Falls back to a no-op on devices without the Vibration API (iOS Safari, desktop).
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [10, 30, 10],
  warning: [20, 50, 20],
  error: [40, 80, 40, 80, 40],
};

export function useHaptics() {
  const vibrate = (pattern: HapticPattern = 'light') => {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    navigator.vibrate(PATTERNS[pattern]);
  };

  return { vibrate };
}
