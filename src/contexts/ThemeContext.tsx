import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import { supabase } from '../lib/supabase';

export type ThemeMode = 'light' | 'dark' | 'black' | 'system';
export type AccentColor = 'emerald' | 'blue' | 'rose' | 'amber' | 'cyan' | 'violet';

interface ThemeContextValue {
  theme: ThemeMode;
  accentColor: AccentColor;
  reducedMotion: boolean;
  compactMode: boolean;
  /** The resolved effective theme (system → light or dark) */
  resolvedTheme: 'light' | 'dark' | 'black';
  setTheme: (t: ThemeMode) => void;
  setAccentColor: (a: AccentColor) => void;
  setReducedMotion: (v: boolean) => void;
  setCompactMode: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'atn-theme-prefs';

interface StoredPrefs {
  theme: ThemeMode;
  accent_color: AccentColor;
  reduced_motion: boolean;
  compact_mode: boolean;
}

const DEFAULT_PREFS: StoredPrefs = {
  theme: 'light',
  accent_color: 'emerald',
  reduced_motion: false,
  compact_mode: false,
};

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' | 'black' {
  if (mode === 'system') {
    return getSystemTheme() === 'dark' ? 'dark' : 'light';
  }
  return mode;
}

function applyThemeToDOM(mode: ThemeMode, accent: AccentColor, reducedMotion: boolean, compactMode: boolean) {
  const root = document.documentElement;
  root.classList.remove('dark', 'black', 'system', 'light', 'reduced-motion', 'compact-mode');
  const resolved = resolveTheme(mode);
  root.classList.add(resolved);
  root.classList.add(mode);
  root.setAttribute('data-accent', accent);
  if (reducedMotion) root.classList.add('reduced-motion');
  if (compactMode) root.classList.add('compact-mode');
  root.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user ?? null;
  const [prefs, setPrefs] = useState<StoredPrefs>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...DEFAULT_PREFS, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return DEFAULT_PREFS;
  });

  const resolvedTheme = resolveTheme(prefs.theme);

  // Apply to DOM immediately whenever prefs change
  useEffect(() => {
    applyThemeToDOM(prefs.theme, prefs.accent_color, prefs.reduced_motion, prefs.compact_mode);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs]);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (prefs.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyThemeToDOM(prefs.theme, prefs.accent_color, prefs.reduced_motion, prefs.compact_mode);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [prefs]);

  // Load from user_preferences table when user logs in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_preferences')
        .select('theme, accent_color, reduced_motion, compact_mode')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled && data) {
        setPrefs({ ...DEFAULT_PREFS, ...(data as Partial<StoredPrefs>) });
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const persistToDB = useCallback(async (next: StoredPrefs) => {
    if (!user) return;
    await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        theme: next.theme,
        accent_color: next.accent_color,
        reduced_motion: next.reduced_motion,
        compact_mode: next.compact_mode,
        updated_at: new Date().toISOString(),
      });
  }, [user]);

  const setTheme = useCallback((t: ThemeMode) => {
    setPrefs((prev) => {
      const next = { ...prev, theme: t };
      persistToDB(next);
      return next;
    });
  }, [persistToDB]);

  const setAccentColor = useCallback((a: AccentColor) => {
    setPrefs((prev) => {
      const next = { ...prev, accent_color: a };
      persistToDB(next);
      return next;
    });
  }, [persistToDB]);

  const setReducedMotion = useCallback((v: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, reduced_motion: v };
      persistToDB(next);
      return next;
    });
  }, [persistToDB]);

  const setCompactMode = useCallback((v: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, compact_mode: v };
      persistToDB(next);
      return next;
    });
  }, [persistToDB]);

  return (
    <ThemeContext.Provider
      value={{
        theme: prefs.theme,
        accentColor: prefs.accent_color,
        reducedMotion: prefs.reduced_motion,
        compactMode: prefs.compact_mode,
        resolvedTheme,
        setTheme,
        setAccentColor,
        setReducedMotion,
        setCompactMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
