import { PHONE_COUNTRIES, DEFAULT_COUNTRY_DIGITS } from '../../lib/phone';

interface PhoneInputProps {
  countryDigits: string;
  localNumber: string;
  onCountryChange: (digits: string) => void;
  onLocalChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  id?: string;
}

export function PhoneInput({
  countryDigits,
  localNumber,
  onCountryChange,
  onLocalChange,
  disabled,
  error,
  id = 'phone',
}: PhoneInputProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800 mb-1.5">
        WhatsApp number
      </label>
      <div className="flex gap-2">
        <select
          value={countryDigits}
          onChange={(e) => onCountryChange(e.target.value)}
          disabled={disabled}
          aria-label="Country code"
          className="w-[7.5rem] px-2 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm"
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.digits} value={c.digits}>
              {c.dial}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={localNumber}
          onChange={(e) => onLocalChange(e.target.value.replace(/[^\d\s-]/g, ''))}
          disabled={disabled}
          placeholder={countryDigits === DEFAULT_COUNTRY_DIGITS ? '76 123456' : 'Local number'}
          className={`flex-1 px-4 py-3 bg-slate-50 border rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm ${
            error ? 'border-red-300' : 'border-slate-200'
          }`}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">We’ll send a one-time code on WhatsApp to this number.</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
