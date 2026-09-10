import { useEffect, useId, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import {
  formatSuggestion,
  reverseGeocode,
  searchAddresses,
  type AddressSuggestion,
} from '../lib/addressSearch';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  inputClassName?: string;
  countryCodes?: string;
  showLocate?: boolean;
  autoComplete?: string;
  disabled?: boolean;
}

export function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Start typing an address…',
  inputClassName = 'w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all',
  countryCodes = 'sl',
  showLocate = false,
  autoComplete = 'street-address',
  disabled = false,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSearch = useRef(false);

  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const next = await searchAddresses(q, countryCodes);
        setResults(next);
        setOpen(next.length > 0);
        setActiveIndex(-1);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, countryCodes]);

  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, []);

  const applySuggestion = (s: AddressSuggestion) => {
    skipSearch.current = true;
    const formatted = formatSuggestion(s);
    onChange(formatted);
    onSelect?.(s);
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    setError('');
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not available on this device');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const found = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (found) applySuggestion(found);
          else setError('Could not find an address for your location');
        } catch {
          setError('Could not look up your location');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setError('Allow location access to fill this field');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      applySuggestion(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={value}
            disabled={disabled}
            autoComplete={autoComplete}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            placeholder={placeholder}
            className={inputClassName}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            onKeyDown={onKeyDown}
          />
          {(searching || locating) && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 animate-spin" />
          )}
        </div>
        {showLocate && (
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating || disabled}
            className="px-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex-shrink-0 disabled:opacity-50"
            title="Use current location"
            aria-label="Use current location"
          >
            <Crosshair className="w-4 h-4 text-slate-500" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-56 overflow-y-auto"
        >
          {results.map((r, i) => (
            <li key={`${r.display_name}-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applySuggestion(r)}
                className={`flex items-start gap-2 w-full px-4 py-2.5 text-left transition-colors border-b border-slate-50 dark:border-slate-700 last:border-0 ${
                  i === activeIndex ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-emerald-50 dark:hover:bg-slate-700'
                }`}
              >
                <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-amber-600 mt-1">{error}</p>}
    </div>
  );
}
