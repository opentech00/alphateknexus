import { useTheme, ThemeMode, AccentColor } from '../contexts/ThemeContext';
import { Sun, Moon, Monitor, Contrast, Sparkles, Zap, BellOff, Layout } from 'lucide-react';

const THEMES: { id: ThemeMode; label: string; icon: typeof Sun; desc: string }[] = [
  { id: 'light', label: 'Light', icon: Sun, desc: 'Bright & clean' },
  { id: 'dark', label: 'Dark', icon: Moon, desc: 'Soft dark grey' },
  { id: 'black', label: 'Black', icon: Contrast, desc: 'True OLED black' },
  { id: 'system', label: 'System', icon: Monitor, desc: 'Follow OS setting' },
];

const ACCENTS: { id: AccentColor; label: string; ring: string; dot: string }[] = [
  { id: 'emerald', label: 'Emerald', ring: 'ring-emerald-500', dot: 'bg-emerald-500' },
  { id: 'blue', label: 'Blue', ring: 'ring-blue-500', dot: 'bg-blue-500' },
  { id: 'rose', label: 'Rose', ring: 'ring-rose-500', dot: 'bg-rose-500' },
  { id: 'amber', label: 'Amber', ring: 'ring-amber-500', dot: 'bg-amber-500' },
  { id: 'cyan', label: 'Cyan', ring: 'ring-cyan-500', dot: 'bg-cyan-500' },
  { id: 'violet', label: 'Violet', ring: 'ring-violet-500', dot: 'bg-violet-500' },
];

export function AppearancePanel() {
  const {
    theme, accentColor, reducedMotion, compactMode,
    resolvedTheme, setTheme, setAccentColor, setReducedMotion, setCompactMode,
  } = useTheme();

  return (
    <div className="space-y-6">
      {/* Theme picker */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Theme</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {THEMES.map(({ id, label, icon: Icon, desc }) => {
            const active = theme === id;
            return (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                  active
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500/30'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                }`}
              >
                <Icon className={`w-6 h-6 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`} />
                <span className={`text-sm font-semibold ${active ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>{label}</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-tight">{desc}</span>
              </button>
            );
          })}
        </div>
        {theme === 'system' && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Currently resolving to <span className="font-medium">{resolvedTheme}</span> based on your OS.
          </p>
        )}
      </section>

      {/* Accent color picker */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Accent Color</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map(({ id, label, ring, dot }) => {
            const active = accentColor === id;
            return (
              <button
                key={id}
                onClick={() => setAccentColor(id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                  active
                    ? `border-transparent ring-2 ${ring} bg-white dark:bg-slate-800`
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                }`}
              >
                <span className={`w-5 h-5 rounded-full ${dot} ${active ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-800' : ''}`} />
                <span className={`text-sm font-medium ${active ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Toggles */}
      <section className="space-y-3">
        <ToggleRow
          icon={BellOff}
          label="Reduced Motion"
          desc="Minimize animations and transitions"
          checked={reducedMotion}
          onChange={setReducedMotion}
        />
        <ToggleRow
          icon={Layout}
          label="Compact Mode"
          desc="Tighter spacing for denser layouts"
          checked={compactMode}
          onChange={setCompactMode}
        />
      </section>
    </div>
  );
}

function ToggleRow({
  icon: Icon, label, desc, checked, onChange,
}: {
  icon: typeof Sun; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{desc}</p>
      </div>
      <span
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}
