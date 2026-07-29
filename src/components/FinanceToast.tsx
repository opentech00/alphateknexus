import { useEffect, useState } from 'react';
import { CheckCircle2, X, Info, FileText, Bell } from 'lucide-react';
import { useFinanceRealtimeToasts } from '../contexts/FinanceRealtimeContext';

export function FinanceToastContainer() {
  const { toasts, dismiss } = useFinanceRealtimeToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto pointer-events-none">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: { id: string; title: string; body: string; type: string }; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const iconMap: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
    invoice: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    system: { icon: Info, color: 'text-amber-600', bg: 'bg-amber-50' },
    payment: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  };

  const meta = iconMap[toast.type] || iconMap.system;
  const Icon = meta.icon;

  return (
    <div
      className={`pointer-events-auto bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
          <Icon className={`w-5 h-5 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{toast.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{toast.body}</p>
        </div>
        <button onClick={onDismiss} className="p-1 text-slate-300 hover:text-slate-500 rounded transition-colors flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="h-0.5 bg-slate-100">
        <div className="h-full bg-emerald-500 animate-[shrink_6s_linear]" />
      </div>
    </div>
  );
}
