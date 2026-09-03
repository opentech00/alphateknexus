import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useHaptics } from '../../hooks/useHaptics';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  showHandle?: boolean;
  children: React.ReactNode;
  maxHeightClass?: string;
}

export function BottomSheet({ open, onClose, title, showHandle = true, children, maxHeightClass = 'max-h-[90vh]' }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { vibrate } = useHaptics();
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);
  const lastTouchY = useRef(0);
  const touchStartTime = useRef(0);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      setTranslateY(0);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    lastTouchY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;
    lastTouchY.current = currentY;

    if (deltaY > 0) {
      // Pulling down to dismiss
      setTranslateY(deltaY);
    } else {
      // Rubber-banding upward resistance
      setTranslateY(deltaY * 0.15);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const duration = Date.now() - touchStartTime.current;
    const distance = lastTouchY.current - touchStartY.current;
    const velocity = distance / Math.max(duration, 1);

    // Dismiss if pulled down past 120px or fling velocity > 0.5 px/ms
    if (distance > 120 || velocity > 0.5) {
      vibrate('medium');
      onClose();
    } else {
      setTranslateY(0);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-fadeIn transition-opacity duration-300"
        style={{ opacity: Math.max(0.2, 1 - translateY / 300) }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`relative bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-2xl flex flex-col ${maxHeightClass} transition-transform ${isDragging ? 'duration-0' : 'duration-300 cubic-bezier(0.16, 1, 0.3, 1)'} animate-slideUp border-t border-slate-200/50 dark:border-slate-800`}
        style={{
          transform: `translateY(${Math.max(0, translateY)}px)`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Touch Drag Area */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="cursor-grab active:cursor-grabbing select-none"
        >
          {showHandle && (
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 transition-colors" />
            </div>
          )}
          {title && (
            <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all"
              >
                <X className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

