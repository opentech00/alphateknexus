import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface FeatureFlags {
  referral_enabled: boolean;
  wallet_enabled: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  referral_enabled: true,
  wallet_enabled: true,
};

let cachedFlags: FeatureFlags | null = null;

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>(cachedFlags || DEFAULT_FLAGS);
  const [loaded, setLoaded] = useState<boolean>(cachedFlags !== null);

  useEffect(() => {
    if (cachedFlags) {
      setFlags(cachedFlags);
      setLoaded(true);
      return;
    }

    let mounted = true;

    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('referral_enabled, wallet_enabled')
        .eq('id', 1)
        .maybeSingle();

      if (mounted && data) {
        cachedFlags = data as FeatureFlags;
        setFlags(cachedFlags);
      }
      if (mounted) setLoaded(true);
    })();

    return () => { mounted = false; };
  }, []);

  return { ...flags, loaded };
}

export function refreshFeatureFlags() {
  cachedFlags = null;
}
