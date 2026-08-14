import { useRef, useState, useCallback } from 'react';
import { RotateCcw, Ban } from 'lucide-react';
import { useHaptics } from '../../hooks/useHaptics';

interface SwipeableBookingCardProps {
  children: React.ReactNode;
  onRebook?: () => void;
  onCancel?: () => void;
  showRebook?: boolean;
  showCancel?: boolean;
}

const ACTION_WIDTH = 72;
const TRIGGER_WIDTH = 56;

/**
 * SwipeableBookingCard — wraps booking card content with a swipe-left gesture
 * that reveals quick-action buttons (Rebook / Cancel).
 * Tap the card body to expand; swipe left to reveal actions.
 */
export function SwipeableBookingCard({
  children,
  onRebook,
  onCancel,
  showRebook = false,
  showCancel = false,
}: SwipeableBookingCardProps) {
  const { vibrate } = useHaptics();
  const startX = useRef(0);
  const currentX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const maxOffset = (showRebook ? 1 : 0) + (showCancel ? 1 : 0);
  const maxReveal = maxOffset * ACTION_WIDTH;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = e.touches[0].clientX;
    setDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging) return;
    currentX.current = e.touches[0].clientX;
    const delta = currentX.current - startX.current;
    let next = revealed ? delta - maxReveal : delta;
    if (next > 0) next = next * 0.3;
    if (next < -maxReveal) next = -maxReveal - (next + maxReveal) * 0.3;
    setOffset(next);
  }, [dragging, revealed, maxReveal]);

  const handleTouchEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    const delta = currentX.current - startX.current;
    const shouldReveal = revealed ? delta > -TRIGGER_WIDTH : delta < -TRIGGER_WIDTH;
    if (shouldReveal !== revealed) vibrate('light');
    setRevealed(shouldReveal);
    setOffset(shouldReveal ? -maxReveal : 0);
  }, [dragging, revealed, maxReveal, vibrate]);

  const handleAction = (action: 'rebook' | 'cancel') => {
    vibrate('medium');
    setRevealed(false);
    setOffset(0);
    if (action === 'rebook') onRebook?.();
    else onCancel?.();
  };

  if (!showRebook && !showCancel) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Action buttons behind the card */}
      <div className="absolute top-0 right-0 bottom-0 flex items-stretch">
        {showRebook && (
          <button
            onClick={() => handleAction('rebook')}
            className="flex flex-col items-center justify-center w-[72px] bg-emerald-500 text-white gap-1 active:bg-emerald-600 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="text-[10px] font-semibold">Rebook</span>
          </button>
        )}
        {showCancel && (
          <button
            onClick={() => handleAction('cancel')}
            className="flex flex-col items-center justify-center w-[72px] bg-amber-500 text-white gap-1 active:bg-amber-600 transition-colors"
          >
            <Ban className="w-4 h-4" />
            <span className="text-[10px] font-semibold">Cancel</span>
          </button>
        )}
      </div>

      {/* Card content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm"
      >
        {children}
      </div>
    </div>
  );
}
