import { supabase } from './supabase';
import type { MediaAsset } from '../types';
import { canonicalizeMediaKey, SERVICE_MEDIA_KEYS } from './media';

function serviceLabel(slug: string): string {
  const key = canonicalizeMediaKey(slug);
  return SERVICE_MEDIA_KEYS.find((k) => k.value === key)?.label || slug;
}

/** Static surfaces this asset drives, based on category + key. */
export function getMediaUsageLabels(asset: MediaAsset, campaignTitles: string[] = []): string[] {
  const key = canonicalizeMediaKey(asset.key);
  switch (asset.category) {
    case 'app_logo':
      return ['App nav', 'Admin', 'Employee dashboard', 'Field', 'Invoices', 'Splash', 'Employee login'];
    case 'service_branding':
      return [`Dashboards (${serviceLabel(key)})`, 'Bookings', 'Mobile', 'Splash service slides'];
    case 'login_carousel':
      return ['Login carousel'];
    case 'splash':
      return key === 'splash-hero' ? ['Splash welcome slide'] : [`Splash (${serviceLabel(key)})`];
    case 'campaign':
    case 'general':
      return campaignTitles.map((t) => `Campaign: ${t}`);
  }
}

/** Match campaigns that reuse a library file URL or storage path. */
export async function fetchCampaignTitlesByAsset(
  assets: MediaAsset[],
): Promise<Record<string, string[]>> {
  const relevant = assets.filter((a) => a.category === 'campaign' || a.category === 'general');
  if (relevant.length === 0) return {};

  const { data, error } = await supabase
    .from('campaigns')
    .select('title, media_url, media_path');
  if (error || !data) return {};

  const map: Record<string, string[]> = {};
  for (const asset of relevant) {
    const titles = data
      .filter((c) => c.media_url === asset.file_url || c.media_path === asset.file_path)
      .map((c) => (c.title as string) || 'Untitled');
    if (titles.length) map[asset.id] = titles;
  }
  return map;
}
