import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function SensitiveValue({
  masked,
  full,
  privacy,
  mono = false,
}: {
  masked: string;
  full: string;
  privacy: boolean;
  mono?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shown = !privacy || open ? (full || '—') : masked;
  return (
    <span className="inline-flex items-center gap-1 max-w-full">
      <span className={`truncate ${mono ? 'font-mono text-xs' : 'text-xs'} ${privacy && !open ? 'text-slate-400' : 'text-slate-600'}`}>
        {shown}
      </span>
      {privacy && full && full !== '—' && (
        <button
          type="button"
          title={open ? 'Hide' : 'Reveal'}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          {open ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      )}
    </span>
  );
}

export function PrivacyToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
        on
          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {on ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      {on ? 'Privacy on' : 'Privacy off'}
    </button>
  );
}
