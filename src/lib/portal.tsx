import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children on document.body so overlays are not clipped or
 * scrolled by MobileShell's overflow container.
 */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export const MOBILE_OVERLAY_CLASS =
  'fixed inset-0 z-[200]';
