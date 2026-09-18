import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface PortalSettings {
  portal_enabled: boolean;
  registration_enabled: boolean;
  require_email_verification: boolean;
  portal_company_name: string;
  portal_tagline: string;
  portal_support_email: string;
  portal_announcement: string;
  portal_announcement_enabled: boolean;
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  portal_enabled: true,
  registration_enabled: true,
  require_email_verification: true,
  portal_company_name: 'Alphatek Nexus',
  portal_tagline: '',
  portal_support_email: '',
  portal_announcement: '',
  portal_announcement_enabled: false,
};

const SELECT_COLS = [
  'portal_enabled',
  'registration_enabled',
  'require_email_verification',
  'portal_company_name',
  'portal_tagline',
  'portal_support_email',
  'portal_announcement',
  'portal_announcement_enabled',
].join(', ');

let cached: PortalSettings | null = null;

function normalize(row: Partial<PortalSettings> | null | undefined): PortalSettings {
  return {
    portal_enabled: row?.portal_enabled !== false,
    registration_enabled: row?.registration_enabled !== false,
    require_email_verification: row?.require_email_verification !== false,
    portal_company_name: (row?.portal_company_name || DEFAULT_PORTAL_SETTINGS.portal_company_name).trim(),
    portal_tagline: (row?.portal_tagline || '').trim(),
    portal_support_email: (row?.portal_support_email || '').trim(),
    portal_announcement: (row?.portal_announcement || '').trim(),
    portal_announcement_enabled: row?.portal_announcement_enabled === true,
  };
}

export async function fetchPortalSettings(): Promise<PortalSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select(SELECT_COLS)
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    return cached || DEFAULT_PORTAL_SETTINGS;
  }

  cached = normalize(data as Partial<PortalSettings>);
  return cached;
}

export function refreshPortalSettingsCache() {
  cached = null;
}

export function usePortalSettings() {
  const [settings, setSettings] = useState<PortalSettings>(cached || DEFAULT_PORTAL_SETTINGS);
  const [loaded, setLoaded] = useState(cached !== null);

  const reload = useCallback(async () => {
    const next = await fetchPortalSettings();
    setSettings(next);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (cached) {
      setSettings(cached);
      setLoaded(true);
      return;
    }
    let mounted = true;
    (async () => {
      const next = await fetchPortalSettings();
      if (mounted) {
        setSettings(next);
        setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return { ...settings, loaded, reload };
}
