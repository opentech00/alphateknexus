import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  showHandle?: boolean;
  children: React.ReactNode;
  maxHeightClass?: string;
}

export function BottomSheet({ open, onClose, title, showHandle, children, maxHeightClass = 'max-h-[90vh]' }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`relative bg-white rounded-t-3xl shadow-2xl flex flex-col ${maxHeightClass} animate-slideUp`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {showHandle && (
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-slate-200" />
          </div>
        )}
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-slate-100 flex-shrink-0">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 transition-all"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
