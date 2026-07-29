import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-emerald-600" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{title}</h1>
          {description && <p className="text-sm text-slate-400 mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  color = 'text-slate-600',
  accent = 'bg-slate-50',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mt-1.5">{label}</p>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-4">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className="flex justify-center py-16">
      <div className={`w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin ${className}`} />
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
      <span className="w-1 h-4 bg-red-500 rounded-full flex-shrink-0" />
      {message}
    </div>
  );
}

export function TableShell({
  headers,
  children,
  footer,
}: {
  headers: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{headers}{children}</table>
      </div>
      {footer}
    </div>
  );
}
