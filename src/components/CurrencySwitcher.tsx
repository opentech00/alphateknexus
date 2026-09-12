import { DISPLAY_CURRENCIES, type DisplayCurrency } from '../lib/currency';

export function CurrencySwitcher({
  value,
  onChange,
  compact = false,
}: {
  value: DisplayCurrency;
  onChange: (code: DisplayCurrency) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-full border border-slate-200/80 bg-white/90 dark:bg-slate-800 dark:border-slate-700 shadow-sm ${
        compact ? 'p-0.5' : 'p-1'
      }`}
      role="group"
      aria-label="Display currency"
    >
      {DISPLAY_CURRENCIES.map((code) => {
        const active = value === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            className={`${compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} rounded-full font-bold transition-colors ${
              active
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            {code === 'EUR' ? 'EUR' : code}
          </button>
        );
      })}
    </div>
  );
}
