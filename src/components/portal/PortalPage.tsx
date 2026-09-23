import { type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

export function PortalPage({
  title,
  subtitle,
  onBack,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="md:hidden inline-flex items-center gap-2 min-h-[44px] text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back
        </button>
      )}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between motion-safe:animate-[fadeInUp_0.35s_ease]">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">{subtitle}</p>
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}
