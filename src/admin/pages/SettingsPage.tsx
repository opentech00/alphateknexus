import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Bell, Globe, Shield, Database, Gift, Wallet, Loader2, Check, X, ChevronDown,
} from 'lucide-react';
import { PageHeader } from '../components/ui';
import { supabase } from '../../lib/supabase';
import { NotificationPreferencesPanel } from '../../components/NotificationPreferencesPanel';

interface AppSettings {
  referral_enabled: boolean;
  wallet_enabled: boolean;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('app_settings')
      .select('referral_enabled, wallet_enabled')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      setError(error.message);
    } else if (data) {
      setSettings(data as AppSettings);
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
