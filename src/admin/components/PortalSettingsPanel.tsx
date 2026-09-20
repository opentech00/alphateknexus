import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Globe, Loader2, Megaphone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  DEFAULT_PORTAL_SETTINGS,
  refreshPortalSettingsCache,
  type PortalSettings,
} from '../../hooks/usePortalSettings';

function sanitizeLocal(value: string, max: number) {
  return value.replace(/<[^>]*>/g, '').slice(0, max);
}

export function PortalSettingsPanel() {
  const [draft, setDraft] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: err } = await supabase
        .from('app_settings')
        .select('portal_enabled, registration_enabled, require_email_verification, require_phone_verification, portal_company_name, portal_tagline, portal_support_email, portal_announcement, portal_announcement_enabled, updated_at')
        .eq('id', 1)
        .maybeSingle();
      if (!mounted) return;
      if (err) {
        setError(err.message.includes('portal_')
          ? 'Apply the latest database migration to enable portal settings.'
          : err.message);
      } else if (data) {
        setDraft({
          portal_enabled: data.portal_enabled !== false,
          registration_enabled: data.registration_enabled !== false,
          require_email_verification: data.require_email_verification !== false,
          require_phone_verification: data.require_phone_verification !== false,
          portal_company_name: data.portal_company_name || DEFAULT_PORTAL_SETTINGS.portal_company_name,
          portal_tagline: data.portal_tagline || '',
          portal_support_email: data.portal_support_email || '',
          portal_announcement: data.portal_announcement || '',
          portal_announcement_enabled: data.portal_announcement_enabled === true,
        });
        setUpdatedAt(data.updated_at);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    const company = sanitizeLocal(draft.portal_company_name, 80).trim();
    if (!company) {
      setError('Company name is required.');
      setSaving(false);
      return;
    }
    const email = sanitizeLocal(draft.portal_support_email, 120).trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid support email or leave it blank.');
      setSaving(false);
      return;
    }
    if (!draft.portal_enabled && !window.confirm('Close the client portal for all customers? Admins can still use this dashboard to reopen it.')) {
      setSaving(false);
      return;
    }
    if (!draft.registration_enabled && !window.confirm('Stop new client registrations? Existing accounts can still sign in.')) {
      setSaving(false);
      return;
    }

    const { data, error: rpcErr } = await supabase.rpc('update_portal_settings', {
      p_patch: {
        portal_enabled: draft.portal_enabled,
        registration_enabled: draft.registration_enabled,
        require_email_verification: draft.require_email_verification,
        require_phone_verification: draft.require_phone_verification,
        portal_announcement_enabled: draft.portal_announcement_enabled,
        portal_company_name: company,
        portal_tagline: sanitizeLocal(draft.portal_tagline, 160),
        portal_support_email: email.toLowerCase(),
        portal_announcement: sanitizeLocal(draft.portal_announcement, 280),
      },
    });

    if (rpcErr) {
      setError(rpcErr.message);
      setSaving(false);
      return;
    }

    const next = (data || {}) as Partial<PortalSettings> & { updated_at?: string };
    setDraft((prev) => ({
      ...prev,
      ...next,
      portal_company_name: next.portal_company_name || company,
    }));
    if (next.updated_at) setUpdatedAt(next.updated_at);
    refreshPortalSettingsCache();
    setSuccess('Portal settings saved. Clients pick up changes on their next page load.');
    setTimeout(() => setSuccess(''), 3500);
    setSaving(false);
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> {success}
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-600" /> Visibility and access
        </h4>
        <p className="text-xs text-slate-500 mt-1">
          These flags are enforced on the client portal and on account creation. Logo images stay in Media Library.
        </p>
        <div className="mt-3 space-y-3">
          <ToggleRow
            title="Client portal open"
            description="When off, customers see a maintenance screen. Admin, employee, and field apps stay available."
            enabled={draft.portal_enabled}
            danger={!draft.portal_enabled}
            onToggle={() => setDraft((s) => ({ ...s, portal_enabled: !s.portal_enabled }))}
          />
          <ToggleRow
            title="Allow new registrations"
            description="When off, the Create account path is hidden and the server rejects new sign-ups."
            enabled={draft.registration_enabled}
            onToggle={() => setDraft((s) => ({ ...s, registration_enabled: !s.registration_enabled }))}
          />
          <ToggleRow
            title="Require email verification"
            description="New clients must confirm their email before using bookings and wallet."
            enabled={draft.require_email_verification}
            onToggle={() => setDraft((s) => ({ ...s, require_email_verification: !s.require_email_verification }))}
          />
          <ToggleRow
            title="Require WhatsApp phone verification"
            description="New sign-ups must prove a unique phone number with a WhatsApp OTP. Meta Cloud API secrets and an Authentication template must be configured or users will be stuck on the code screen."
            enabled={draft.require_phone_verification}
            onToggle={() => setDraft((s) => ({ ...s, require_phone_verification: !s.require_phone_verification }))}
          />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <h4 className="text-sm font-semibold text-slate-800">Branding</h4>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company name</span>
          <input
            value={draft.portal_company_name}
            maxLength={80}
            onChange={(e) => setDraft((s) => ({ ...s, portal_company_name: e.target.value }))}
            className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Login tagline</span>
          <input
            value={draft.portal_tagline}
            maxLength={160}
            onChange={(e) => setDraft((s) => ({ ...s, portal_tagline: e.target.value }))}
            placeholder="Shown under Welcome back"
            className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Support email</span>
          <input
            type="email"
            value={draft.portal_support_email}
            maxLength={120}
            onChange={(e) => setDraft((s) => ({ ...s, portal_support_email: e.target.value }))}
            placeholder="Optional public contact"
            className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
          />
        </label>
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-amber-600" /> Announcement banner
        </h4>
        <ToggleRow
          title="Show banner to signed-in clients"
          description="Plain text only. HTML is stripped on save."
          enabled={draft.portal_announcement_enabled}
          onToggle={() => setDraft((s) => ({ ...s, portal_announcement_enabled: !s.portal_announcement_enabled }))}
        />
        <textarea
          value={draft.portal_announcement}
          maxLength={280}
          rows={3}
          onChange={(e) => setDraft((s) => ({ ...s, portal_announcement: e.target.value }))}
          placeholder="Short notice, for example scheduled maintenance"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
        />
        <p className="text-[11px] text-slate-400 text-right">{draft.portal_announcement.length}/280</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          {updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString()}` : 'Not saved yet'}
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save portal settings
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  enabled,
  onToggle,
  danger,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex items-center h-7 w-12 rounded-full transition-colors flex-shrink-0 ${
          enabled ? (danger ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-300'
        }`}
        aria-pressed={enabled}
      >
        <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
