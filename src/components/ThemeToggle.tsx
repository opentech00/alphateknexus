import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Monitor, Circle } from 'lucide-react';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';

const OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'black', label: 'Black', icon: Circle },
  { id: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle({
  tone = 'light',
  menuId = 'theme-menu',
}: {
  tone?: 'light' | 'dark';
  menuId?: string;
}) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.id === theme) ?? OPTIONS[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-2 min-h-[44px] min-w-[44px] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
          tone === 'dark'
            ? 'text-slate-300 hover:text-white hover:bg-slate-800'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
        aria-label={`Theme, ${current.label}. Open to change.`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <Sun className="w-5 h-5" aria-hidden="true" />
        <span className="sr-only">Current: {current.label}</span>
      </button>
      <div
        id={menuId}
        role="menu"
        aria-label="Theme"
        className={`absolute right-0 top-full mt-2 w-44 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 origin-top-right transition-all duration-200 motion-reduce:transition-none ${
          open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        aria-hidden={!open}
        {...(!open ? { inert: '' } : {})}
      >
        {OPTIONS.map((opt) => {
          const OptIcon = opt.icon;
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => { setTheme(opt.id); setOpen(false); }}
              className={`w-full flex items-center gap-3 min-h-[44px] px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <OptIcon className={`w-4 h-4 ${opt.id === 'black' ? 'fill-current' : ''}`} aria-hidden="true" />
              {opt.label}
            </button>
          );
        })}
      </div>
      <span className="sr-only" aria-live="polite">{open ? '' : `Theme set to ${current.label}`}</span>
    </div>
  );
}
