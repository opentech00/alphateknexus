import { useState, useEffect, useCallback } from 'react';
import { Clock, X } from 'lucide-react';

interface IdleWarningModalProps {
  visible: boolean;
  secondsLeft: number;
  onStaySignedIn: () => void;
  onSignOut: () => void;
}

export function IdleWarningModal({ visible, secondsLeft, onStaySignedIn, onSignOut }: IdleWarningModalProps) {
  const [localSeconds, setLocalSeconds] = useState(secondsLeft);

  useEffect(() => {
    setLocalSeconds(secondsLeft);
  }, [secondsLeft]);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => {
      setLocalSeconds(prev => {
        if (prev <= 1) {
          clearInterval(t);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [visible]);

  useEffect(() => {
    if (visible && localSeconds <= 0) {
      onSignOut();
    }
  }, [visible, localSeconds, onSignOut]);

  if (!visible) return null;

  const mins = Math.floor(localSeconds / 60);
  const secs = localSeconds % 60;
  const timeDisplay = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  const progress = Math.max(0, localSeconds / 120);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onStaySignedIn}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="relative w-20 h-20 mb-4">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" fill="none" stroke="#e2e8f0" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="36" fill="none"
                stroke={localSeconds <= 30 ? '#ef4444' : '#f59e0b'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - progress)}`}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Clock className={`w-7 h-7 ${localSeconds <= 30 ? 'text-red-500' : 'text-amber-500'}`} />
            </div>
          </div>

          <h3 className="text-lg font-bold text-slate-900 mb-1">Session Expiring</h3>
          <p className="text-sm text-slate-500 mb-1">
            You will be signed out due to inactivity in
          </p>
          <p className={`text-3xl font-bold tabular-nums mb-4 ${localSeconds <= 30 ? 'text-red-600' : 'text-amber-600'}`}>
            {timeDisplay}
          </p>

          <div className="flex gap-3 w-full">
            <button
              onClick={onSignOut}
              className="flex-1 py-2.5 px-4 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
            >
              Sign Out
            </button>
            <button
              onClick={onStaySignedIn}
              className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20"
            >
              Stay Signed In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
