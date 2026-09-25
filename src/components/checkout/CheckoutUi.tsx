import type { ReactNode } from 'react';
import { CheckCircle2, Lock } from 'lucide-react';

export const MONIME_CHANNELS = [
  { id: 'om', label: 'Orange', dot: 'bg-orange-500' },
  { id: 'af', label: 'AfriMoney', dot: 'bg-blue-600' },
  { id: 'qm', label: 'QMoney', dot: 'bg-emerald-500' },
  { id: 'card', label: 'Card', dot: 'bg-slate-800' },
  { id: 'bank', label: 'Bank', dot: 'bg-indigo-500' },
] as const;

export function le(amount: number) {
  return `Le ${amount.toLocaleString()}`;
}

export function PayOption({
  selected,
  onSelect,
  icon,
  title,
  hint,
  accent = 'emerald',
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  hint: string;
  accent?: 'emerald' | 'blue';
}) {
  const on = accent === 'blue'
    ? 'border-blue-600 bg-blue-50 shadow-sm shadow-blue-100'
    : 'border-emerald-600 bg-emerald-50 shadow-sm shadow-emerald-100';
  const radio = accent === 'blue' ? 'border-blue-600 bg-blue-600' : 'border-emerald-600 bg-emerald-600';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`group w-full min-h-[64px] flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 ${
        accent === 'blue' ? 'focus-visible:ring-blue-500' : 'focus-visible:ring-emerald-500'
      } ${
        selected ? on : 'border-slate-200 bg-white hover:border-slate-300 hover:-translate-y-0.5'
      }`}
    >
      <span className={`flex-shrink-0 transition-transform duration-200 ${selected ? 'scale-105' : 'group-hover:scale-105'}`}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500 truncate">{hint}</span>
      </span>
      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? radio : 'border-slate-300'}`}>
        {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
      </span>
    </button>
  );
}

export function ChannelPills() {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 animate-fadeIn" aria-label="Available in Monime checkout">
      {MONIME_CHANNELS.map((ch, i) => (
        <span
          key={ch.id}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-emerald-100 text-[11px] font-semibold text-slate-600"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${ch.dot}`} />
          {ch.label}
        </span>
      ))}
    </div>
  );
}

export function AmountFigure({ amount, caption, compact }: { amount: number; caption?: string; compact?: boolean }) {
  return (
    <div className="min-w-0">
      {caption && <p className="text-xs font-medium text-slate-500">{caption}</p>}
      <p key={amount} className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-slate-900 tabular-nums animate-scaleIn`}>
        {le(amount)}
      </p>
    </div>
  );
}

export function SecureNote() {
  return (
    <p className="flex items-center gap-2 text-[11px] text-slate-400">
      <Lock className="w-3.5 h-3.5 flex-shrink-0" />
      Secured checkout. Alphatek never sees your PIN or card number.
    </p>
  );
}

export function StatusOrb({
  tone,
  pulse = false,
  children,
}: {
  tone: 'emerald' | 'amber' | 'red' | 'slate';
  pulse?: boolean;
  children: ReactNode;
}) {
  const ring = {
    emerald: 'bg-emerald-400/25',
    amber: 'bg-amber-400/25',
    red: 'bg-red-400/20',
    slate: 'bg-slate-300/40',
  }[tone];
  const disc = {
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
    slate: 'bg-slate-100 text-slate-500',
  }[tone];
  return (
    <div className="relative w-20 h-20 mx-auto mb-5">
      {pulse && <span className={`absolute inset-0 rounded-full ${ring} motion-safe:animate-ping`} />}
      <span className={`relative w-20 h-20 rounded-full flex items-center justify-center animate-scaleIn ${disc}`}>
        {children}
      </span>
    </div>
  );
}
