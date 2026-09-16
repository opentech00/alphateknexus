import { Clock, LogIn, X } from 'lucide-react';
import { Portal } from '../../lib/portal';

type ClockInPromptModalProps = {
  visible: boolean;
  late: boolean;
  saving: boolean;
  error: string;
  onClockIn: () => void;
  onSnooze: () => void;
};

export function ClockInPromptModal({
  visible,
  late,
  saving,
  error,
  onClockIn,
  onSnooze,
}: ClockInPromptModalProps) {
  if (!visible) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[9980] flex items-center justify-center p-4"
        style={{ height: '100dvh' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clock-in-prompt-title"
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
          <button
            type="button"
            onClick={onSnooze}
            disabled={saving}
            className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
            aria-label="Remind me later"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${
              late ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <Clock className="w-7 h-7" aria-hidden="true" />
            </div>
            <h2 id="clock-in-prompt-title" className="text-lg font-bold text-slate-900 mb-1">
              You have not clocked in today
            </h2>
            <p className="text-sm text-slate-500 mb-1">
              Record your attendance so your hours are captured.
            </p>
            {late && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                Clock-ins after 9:15 are marked late.
              </p>
            )}
            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2 w-full">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2 w-full mt-5">
              <button
                type="button"
                onClick={onClockIn}
                disabled={saving}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                )}
                Clock in
              </button>
              <button
                type="button"
                onClick={onSnooze}
                disabled={saving}
                className="w-full min-h-[44px] py-2.5 px-4 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-40"
              >
                Remind me in 15 minutes
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
