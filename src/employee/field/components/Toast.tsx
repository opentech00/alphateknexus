import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Briefcase, X } from 'lucide-react';

export interface Toast {
  id: string;
  type: 'job' | 'approval' | 'rejection' | 'info';
  title: string;
  body: string;
}

let listeners: ((toast: Toast) => void)[] = [];

export function pushToast(toast: Omit<Toast, 'id'>) {
  const full: Toast = { ...toast, id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
  listeners.forEach(fn => fn(full));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const listener = (toast: Toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => remove(toast.id), 5000);
    };
    listeners.push(listener);
    return () => { listeners = listeners.filter(l => l !== listener); };
  }, [remove]);

  const iconFor = (type: Toast['type']) => {
    switch (type) {
      case 'job':       return <Briefcase className="w-5 h-5 text-blue-500" />;
      case 'approval':  return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'rejection': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default:          return <CheckCircle2 className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="bg-white rounded-xl shadow-lg border border-slate-200 p-3.5 flex items-start gap-3 animate-[slideIn_0.2s_ease-out] pointer-events-auto"
        >
          <div className="flex-shrink-0 mt-0.5">{iconFor(toast.type)}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{toast.body}</p>
          </div>
          <button onClick={() => remove(toast.id)} className="flex-shrink-0 text-slate-300 hover:text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
