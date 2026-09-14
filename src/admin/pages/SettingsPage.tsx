import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Bell, Globe, Shield, Database, Gift, Wallet, Loader2, Check, ChevronDown, Banknote,
} from 'lucide-react';
import { PageHeader } from '../components/ui';
import { supabase } from '../../lib/supabase';
import { NotificationPreferencesPanel } from '../../components/NotificationPreferencesPanel';
import { CURRENCY_META, DISPLAY_CURRENCIES, isDisplayCurrency, type DisplayCurrency } from '../../lib/currency';

interface AppSettings {
  referral_enabled: boolean;
  wallet_enabled: boolean;
  default_display_currency: DisplayCurrency;
}

interface FxRateRow {
  id: string;
  currency_code: string;
  rate_to_sle: number;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [fxRates, setFxRates] = useState<FxRateRow[]>([]);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [savingCurrency, setSavingCurrency] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    const [{ data, error: settingsErr }, { data: fx, error: fxErr }] = await Promise.all([
      supabase
        .from('app_settings')
        .select('referral_enabled, wallet_enabled, default_display_currency')
        .eq('id', 1)
        .maybeSingle(),
      supabase
        .from('fx_rates')
        .select('id, currency_code, rate_to_sle')
        .in('currency_code', ['SLE', 'USD', 'EUR'])
        .order('currency_code'),
    ]);

    if (settingsErr) {
      const fallback = await supabase
        .from('app_settings')
        .select('referral_enabled, wallet_enabled')
        .eq('id', 1)
        .maybeSingle();
      if (fallback.data) {
        setSettings({
          referral_enabled: fallback.data.referral_enabled,
          wallet_enabled: fallback.data.wallet_enabled,
          default_display_currency: 'SLE',
        });
        setError('Currency column is missing. Apply the latest database migration to save a default currency.');
      } else {
        setError(settingsErr.message);
      }
    } else if (data) {
      const code = isDisplayCurrency(data.default_display_currency) ? data.default_display_currency : 'SLE';
      setSettings({
        referral_enabled: data.referral_enabled,
        wallet_enabled: data.wallet_enabled,
        default_display_currency: code,
      });
    }
    if (fxErr) {
      setError((prev) => prev || fxErr.message);
    } else {
      const rows = (fx || []) as FxRateRow[];
      setFxRates(rows);
      const drafts: Record<string, string> = {};
      rows.forEach((row) => {
        drafts[row.currency_code] = String(row.rate_to_sle);
      });
      setRateDrafts(drafts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const toggleFeature = async (key: 'referral_enabled' | 'wallet_enabled') => {
    if (!settings) return;
    const newValue = !settings[key];
    setSaving(key);
    setError('');
    setSuccessMsg('');

    const { error } = await supabase
      .from('app_settings')
      .update({ [key]: newValue, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) {
      setError(`Failed to update: ${error.message}`);
    } else {
      setSettings({ ...settings, [key]: newValue });
      setSuccessMsg(`${key === 'referral_enabled' ? 'Referral' : 'Wallet'} feature is now ${newValue ? 'enabled' : 'disabled'}`);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
    setSaving(null);
  };

  const saveCurrency = async () => {
    if (!settings) return;
    setSavingCurrency(true);
    setError('');
    setSuccessMsg('');

    const { error: settingsErr } = await supabase
      .from('app_settings')
      .update({
        default_display_currency: settings.default_display_currency,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (settingsErr) {
      setError(`Failed to update currency: ${settingsErr.message}`);
      setSavingCurrency(false);
      return;
    }

    for (const row of fxRates) {
      if (row.currency_code === 'SLE') continue;
      const next = Number(rateDrafts[row.currency_code]);
      if (!Number.isFinite(next) || next <= 0) {
        setError(`Enter a valid ${row.currency_code} rate greater than 0.`);
        setSavingCurrency(false);
        return;
      }
      if (next === Number(row.rate_to_sle)) continue;
      const { error: fxErr } = await supabase
        .from('fx_rates')
        .update({
          rate_to_sle: next,
          updated_at: new Date().toISOString(),
          updated_by: 'admin',
        })
        .eq('id', row.id);
      if (fxErr) {
        setError(`Failed to update ${row.currency_code} rate: ${fxErr.message}`);
        setSavingCurrency(false);
        return;
      }
    }

    setSuccessMsg(`Default currency is now ${settings.default_display_currency}. Exchange rates saved.`);
    setTimeout(() => setSuccessMsg(''), 3000);
    setSavingCurrency(false);
    await fetchSettings();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Settings"
        description="Configure system preferences and admin options"
        icon={Settings}
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <span className="w-1 h-4 bg-red-500 rounded-full flex-shrink-0" />
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <Check className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Feature Toggles */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Client Feature Toggles</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading || !settings ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : (
            <>
              <FeatureToggleRow
                icon={<Gift className="w-5 h-5 text-rose-600" />}
                iconBg="bg-rose-50"
                title="Referral Program"
                description="Allow clients to view referral codes, invite friends, and earn referral credits"
                enabled={settings.referral_enabled}
                onToggle={() => toggleFeature('referral_enabled')}
                saving={saving === 'referral_enabled'}
              />
              <div className="border-t border-slate-100" />
              <FeatureToggleRow
                icon={<Wallet className="w-5 h-5 text-blue-600" />}
                iconBg="bg-blue-50"
                title="Wallet"
                description="Allow clients to view wallet balance, transaction history, and pay with wallet credits"
                enabled={settings.wallet_enabled}
                onToggle={() => toggleFeature('wallet_enabled')}
                saving={saving === 'wallet_enabled'}
              />
            </>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2 px-1">
          Disabling a feature hides it from all client-facing pages immediately. Existing data is preserved.
        </p>
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Currency</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading || !settings ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : (
            <div className="p-5 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Banknote className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900">Default display currency</h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Used for clients who have not chosen a currency. Wallet and invoices stay stored in SLE.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {DISPLAY_CURRENCIES.map((code) => {
                      const active = settings.default_display_currency === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setSettings({ ...settings, default_display_currency: code })}
                          className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {CURRENCY_META[code].label} · {CURRENCY_META[code].name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-sm font-semibold text-slate-800">Exchange rates</h4>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">1 foreign unit equals this many SLE.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['SLE', 'USD', 'EUR'] as const).map((code) => {
                    const locked = code === 'SLE';
                    return (
                      <label key={code} className="block">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{code}</span>
                        <input
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          disabled={locked || savingCurrency}
                          value={locked ? '1' : (rateDrafts[code] ?? '')}
                          onChange={(e) => setRateDrafts((prev) => ({ ...prev, [code]: e.target.value }))}
                          className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm disabled:bg-slate-50"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveCurrency()}
                  disabled={savingCurrency}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingCurrency ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save currency
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Other Settings */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">System</h2>
      <div className="space-y-3">
        <button
          onClick={() => setShowNotifPrefs(!showNotifPrefs)}
          className="w-full bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer group text-left"
        >
          <div className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Notifications</h3>
            <p className="text-sm text-slate-500 mt-0.5">Configure email and push notification preferences for admin alerts</p>
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-transform flex-shrink-0 ${showNotifPrefs ? 'rotate-180' : ''}`} />
        </button>
        {showNotifPrefs && (
          <div className="mt-2">
            <NotificationPreferencesPanel />
          </div>
        )}
        <SettingCard
          icon={<Globe className="w-5 h-5 text-emerald-600" />}
          title="Portal Settings"
          description="Manage client portal visibility, branding, and access controls"
        />
        <SettingCard
          icon={<Shield className="w-5 h-5 text-amber-600" />}
          title="Security"
          description="Two-factor authentication, session management, and audit logs"
        />
        <SettingCard
          icon={<Database className="w-5 h-5 text-slate-600" />}
          title="Data & Exports"
          description="Export reports, manage backups, and configure data retention policies"
        />
        <SettingCard
          icon={<Settings className="w-5 h-5 text-rose-600" />}
          title="System"
          description="API keys, webhook configuration, and integrations"
        />
      </div>
    </div>
  );
}

function FeatureToggleRow({
  icon,
  iconBg,
  title,
  description,
  enabled,
  onToggle,
  saving,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  saving: boolean;
}) {
  return (
    <div className="p-5 flex items-center gap-4">
      <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={saving}
        className={`relative inline-flex items-center h-7 w-12 rounded-full transition-colors duration-200 flex-shrink-0 disabled:opacity-50 ${
          enabled ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
        {saving && (
          <Loader2 className="absolute inset-0 m-auto w-4 h-4 text-slate-600 animate-spin" />
        )}
      </button>
      <span className={`text-xs font-semibold uppercase tracking-wide w-16 text-right ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
        {enabled ? 'On' : 'Off'}
      </span>
    </div>
  );
}

function SettingCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer group">
      <div className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className="text-slate-300 group-hover:text-slate-500 transition-colors">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
