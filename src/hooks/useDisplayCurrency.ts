import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  type DisplayCurrency,
  detectDisplayCurrency,
  formatFromSle,
  isDisplayCurrency,
  sleToDisplay,
} from '../lib/currency';

const STORAGE_KEY = 'atn-display-currency';

function readStored(): DisplayCurrency | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isDisplayCurrency(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(code: DisplayCurrency) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch {}
}

function envHints() {
  return {
    locale: typeof navigator !== 'undefined' ? navigator.language : null,
    timeZone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
  };
}

export function useDisplayCurrency() {
  const { user, profile } = useAuth();
  const [currency, setCurrencyState] = useState<DisplayCurrency>(() => readStored() || detectDisplayCurrency({
    phone: profile?.phone,
    ...envHints(),
  }));
  const [rates, setRates] = useState<Partial<Record<DisplayCurrency, number>>>({ SLE: 1 });
  const [source, setSource] = useState<'saved' | 'detected'>('detected');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: fx } = await supabase
        .from('fx_rates')
        .select('currency_code, rate_to_sle')
        .eq('is_active', true)
        .in('currency_code', ['SLE', 'USD', 'EUR']);

      if (!cancelled && fx) {
        const next: Partial<Record<DisplayCurrency, number>> = { SLE: 1 };
        fx.forEach((row: { currency_code: string; rate_to_sle: number }) => {
          if (isDisplayCurrency(row.currency_code)) next[row.currency_code] = Number(row.rate_to_sle) || next[row.currency_code];
        });
        setRates(next);
      }

      const stored = readStored();
      let pref: DisplayCurrency | null = stored;
      let country: string | null = null;

      if (user) {
        const [{ data: prefs }, { data: address }] = await Promise.all([
          supabase.from('user_preferences').select('display_currency').eq('user_id', user.id).maybeSingle(),
          supabase.from('user_addresses').select('country').eq('user_id', user.id).order('is_default', { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (isDisplayCurrency((prefs as { display_currency?: string } | null)?.display_currency)) {
          pref = (prefs as { display_currency: DisplayCurrency }).display_currency;
        }
        country = address?.country || null;
      }

      if (cancelled) return;

      if (pref) {
        setCurrencyState(pref);
        setSource('saved');
        writeStored(pref);
        return;
      }

      const detected = detectDisplayCurrency({
        country,
        phone: profile?.phone,
        ...envHints(),
      });
      setCurrencyState(detected);
      setSource('detected');
      writeStored(detected);
    })();

    return () => { cancelled = true; };
  }, [user?.id, profile?.phone]);

  const setCurrency = useCallback(async (next: DisplayCurrency) => {
    setCurrencyState(next);
    setSource('saved');
    writeStored(next);
    if (!user) return;
    await supabase.from('user_preferences').upsert({
      user_id: user.id,
      display_currency: next,
    }, { onConflict: 'user_id' }).then(() => undefined);
  }, [user]);

  const rate = rates[currency] || (currency === 'SLE' ? 1 : undefined);

  return {
    currency,
    setCurrency,
    source,
    rate,
    format: (amountSle: number, opts?: { compact?: boolean }) => formatFromSle(amountSle, currency, rate, opts),
    toDisplay: (amountSle: number) => sleToDisplay(amountSle, currency, rate),
  };
}
