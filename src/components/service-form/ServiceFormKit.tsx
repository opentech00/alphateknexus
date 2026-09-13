import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

export type FormAccent = 'emerald' | 'slate' | 'rose' | 'blue' | 'teal';

const ACCENT_FOCUS: Record<FormAccent, string> = {
  emerald: 'focus:ring-emerald-500 focus:border-emerald-500',
  slate: 'focus:ring-slate-500 focus:border-slate-500',
  rose: 'focus:ring-rose-500 focus:border-rose-500',
  blue: 'focus:ring-blue-500 focus:border-blue-500',
  teal: 'focus:ring-teal-500 focus:border-teal-500',
};

export function inputClass(invalid?: boolean, accent: FormAccent = 'emerald') {
  return [
    'w-full min-h-[44px] px-3.5 py-2.5 border rounded-xl text-sm text-slate-800',
    'placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all bg-white',
    invalid ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : `border-slate-200 ${ACCENT_FOCUS[accent]}`,
  ].join(' ');
}

export function Field({
  name,
  label,
  required,
  hint,
  error,
  children,
  className = '',
}: {
  name?: string;
  label: ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-field={name} className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function FormActions({
  onCancel,
  onSubmit,
  cancelLabel = 'Cancel',
  submitLabel,
  loading,
  disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  cancelLabel?: string;
  submitLabel: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 mt-6 px-4 sm:px-0 py-3 sm:py-0 bg-slate-50/95 sm:bg-transparent backdrop-blur sm:backdrop-blur-none border-t border-slate-200 sm:border-0 safe-area-pb">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] px-5 py-3 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-white transition-colors text-sm"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || disabled}
          className="flex-1 min-h-[48px] py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Please wait…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
