import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { MediaAsset, MediaCategory } from '../types';

export const MAX_MEDIA_FILE_SIZE = 50 * 1024 * 1024;
export const MEDIA_ACCEPT = 'image/*,video/*,.pdf,.doc,.docx,.txt';
export const FALLBACK_SPLASH = '/splash_screen.png';

const FALLBACK_LOGO = '/alphateknexus_logo_transparent.webp';

const FALLBACK_SERVICE_IMAGES: Record<string, string> = {
  'clearing-forwarding': '/service-clearing-forwarding.webp',
  'procurement': '/service-procurement.webp',
  'private-security': '/service-private-security.webp',
  'cleaning-janitorial': '/service-cleaning-janitorial.webp',
  'waste-management': '/service-smart-sort.webp',
  'smart-sort': '/service-smart-sort.webp',
};

const FALLBACK_LOGIN_SLIDES: Record<string, string> = {
  'waste-management': '/login-smart-sort.webp',
  'smart-sort': '/login-smart-sort.webp',
  'clearing-forwarding': '/login-clearing-forwarding.webp',
  'private-security': '/login-private-security.webp',
  'cleaning-janitorial': '/login-cleaning-janitorial.webp',
  'procurement': '/login-procurement.webp',
};

export const SERVICE_MEDIA_KEYS = [
  { value: 'clearing-forwarding', label: 'Clearing & Forwarding' },
  { value: 'waste-management', label: 'Smart Sort / Recycling' },
  { value: 'cleaning-janitorial', label: 'Cleaning & Janitorial' },
  { value: 'private-security', label: 'Private Security' },
  { value: 'procurement', label: 'Procurement' },
] as const;

export type MediaWriteResult =
  | { ok: true; asset: MediaAsset }
  | { ok: false; error: string };

export interface SaveMediaMeta {
  category: MediaCategory;
  key: string;
  title?: string;
  altText?: string;
  displayOrder?: number;
  isActive?: boolean;
}

/** Canonical service slug: login/legacy `smart-sort` maps to `waste-management`. */
export function canonicalizeMediaKey(key: string): string {
  return key === 'smart-sort' ? 'waste-management' : key;
}

export function aliasKeysForLookup(key: string): string[] {
  const canonical = canonicalizeMediaKey(key);
  if (canonical === 'waste-management') return ['waste-management', 'smart-sort'];
  return [key];
}

export function keysForCategory(category: MediaCategory): { value: string; label: string }[] {
  switch (category) {
    case 'app_logo':
      return [{ value: 'app-logo', label: 'App Logo' }];
    case 'service_branding':
    case 'login_carousel':
      return SERVICE_MEDIA_KEYS.map((k) => ({ value: k.value, label: k.label }));
    case 'splash':
      return [{ value: 'splash-hero', label: 'Splash welcome' }, ...SERVICE_MEDIA_KEYS.map((k) => ({ value: k.value, label: k.label }))];
    case 'campaign':
      return [{ value: 'campaign', label: 'Campaign' }];
    case 'general':
      return [{ value: 'general', label: 'General' }];
  }
}

export function defaultKeyForCategory(category: MediaCategory): string {
  return keysForCategory(category)[0]?.value || 'general';
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageFile(fileType: string | null | undefined, fileName = ''): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return Boolean(fileType?.startsWith('image/')) || ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext);
}

export function isVideoFile(fileType: string | null | undefined, fileName = ''): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return Boolean(fileType?.startsWith('video/')) || ['mp4', 'webm', 'mov', 'avi'].includes(ext);
}

export function validateMediaFile(file: File): string | null {
  if (file.size > MAX_MEDIA_FILE_SIZE) {
    return `File exceeds 50MB limit (${formatFileSize(file.size)})`;
  }
  return null;
}

export function fallbackLogo(): string {
  return FALLBACK_LOGO;
}

export function fallbackServiceImage(slug: string): string {
  return FALLBACK_SERVICE_IMAGES[slug] || FALLBACK_SERVICE_IMAGES['waste-management'];
}

export function fallbackLoginImage(slug: string): string {
  return FALLBACK_LOGIN_SLIDES[slug] || FALLBACK_LOGIN_SLIDES['waste-management'];
}

export function fallbackSplashImage(key = 'splash-hero'): string {
  if (canonicalizeMediaKey(key) === 'splash-hero' || key === 'splash-hero') return FALLBACK_SPLASH;
  return fallbackServiceImage(key);
}

function findAssetByKey(assets: MediaAsset[], key: string): MediaAsset | undefined {
  const canonical = canonicalizeMediaKey(key);
  return assets.find((a) => canonicalizeMediaKey(a.key) === canonical);
}

function withSmartSortAlias(map: Record<string, string>): Record<string, string> {
  if (map['waste-management'] && !map['smart-sort']) {
    map['smart-sort'] = map['waste-management'];
  }
  return map;
}

/**
 * Fetch all active media assets for a given category, optionally filtered by key.
 * Returns an empty array on error (caller should use fallbacks).
 */
export async function fetchMediaAssets(
  category: MediaCategory,
  key?: string,
): Promise<MediaAsset[]> {
  let query = supabase
    .from('media_assets')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (key) {
    const keys = aliasKeysForLookup(key);
    query = keys.length === 1 ? query.eq('key', keys[0]) : query.in('key', keys);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as MediaAsset[];
}

/**
 * Fetch a single active asset by category + key (first by display_order).
 * Returns null if none found.
 */
export async function fetchMediaAsset(
  category: MediaCategory,
  key: string,
): Promise<MediaAsset | null> {
  const assets = await fetchMediaAssets(category, key);
  return assets.length > 0 ? assets[0] : null;
}

export async function nextDisplayOrder(category: MediaCategory, key: string): Promise<number> {
  const { data } = await supabase
    .from('media_assets')
    .select('display_order')
    .eq('category', category)
    .eq('key', key)
    .order('display_order', { ascending: false })
    .limit(1);
  return ((data?.[0] as { display_order?: number } | undefined)?.display_order ?? -1) + 1;
}

export async function saveMediaAsset(file: File, meta: SaveMediaMeta): Promise<MediaWriteResult> {
  const sizeErr = validateMediaFile(file);
  if (sizeErr) return { ok: false, error: sizeErr };

  const key = canonicalizeMediaKey(meta.key) || defaultKeyForCategory(meta.category);
  const uploaded = await uploadMediaFile(file, meta.category);
  if (!uploaded) return { ok: false, error: 'Failed to upload file to storage' };

  let width: number | null = null;
  let height: number | null = null;
  if (file.type.startsWith('image/')) {
    const dims = await getImageDimensions(file);
    width = dims.width || null;
    height = dims.height || null;
  }

  const displayOrder = meta.displayOrder ?? await nextDisplayOrder(meta.category, key);
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('media_assets')
    .insert({
      category: meta.category,
      key,
      title: meta.title || file.name,
      alt_text: meta.altText || '',
      file_name: file.name,
      file_path: uploaded.path,
      file_url: uploaded.url,
      file_type: file.type,
      file_size: file.size,
      width,
      height,
      display_order: displayOrder,
      is_active: meta.isActive ?? true,
      uploaded_by: userData.user?.id || null,
    })
    .select()
    .single();

  if (error || !data) {
    await deleteMediaFile(uploaded.path);
    return { ok: false, error: error?.message || 'Failed to save media record' };
  }
  return { ok: true, asset: data as MediaAsset };
}

export async function replaceMediaAsset(asset: MediaAsset, file: File): Promise<MediaWriteResult> {
  const sizeErr = validateMediaFile(file);
  if (sizeErr) return { ok: false, error: sizeErr };

  const uploaded = await uploadMediaFile(file, asset.category);
  if (!uploaded) return { ok: false, error: 'Failed to upload replacement file' };

  let width: number | null = null;
  let height: number | null = null;
  if (file.type.startsWith('image/')) {
    const dims = await getImageDimensions(file);
    width = dims.width || null;
    height = dims.height || null;
  }

  const { data, error } = await supabase
    .from('media_assets')
    .update({
      file_name: file.name,
      file_path: uploaded.path,
      file_url: uploaded.url,
      file_type: file.type,
      file_size: file.size,
      width,
      height,
    })
    .eq('id', asset.id)
    .select()
    .single();

  if (error || !data) {
    await deleteMediaFile(uploaded.path);
    return { ok: false, error: error?.message || 'Failed to update file reference' };
  }

  await deleteMediaFile(asset.file_path);
  return { ok: true, asset: data as MediaAsset };
}

/** Assign an existing asset to a live slot; hide previous occupants of that category+key. */
export async function assignMediaAssetSlot(
  assetId: string,
  category: MediaCategory,
  key: string,
): Promise<{ error?: string }> {
  const slotKey = canonicalizeMediaKey(key);
  const { error: hideErr } = await supabase
    .from('media_assets')
    .update({ is_active: false })
    .eq('category', category)
    .in('key', aliasKeysForLookup(slotKey))
    .eq('is_active', true)
    .neq('id', assetId);
  if (hideErr) return { error: hideErr.message };

  const { error } = await supabase
    .from('media_assets')
    .update({
      category,
      key: slotKey,
      is_active: true,
      display_order: 0,
    })
    .eq('id', assetId);
  if (error) return { error: error.message };
  return {};
}

export function useAppLogo(): { url: string; loading: boolean } {
  const [url, setUrl] = useState(fallbackLogo());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMediaAsset('app_logo', 'app-logo')
      .then((asset) => {
        if (!cancelled && asset) setUrl(asset.file_url);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { url, loading };
}

export function useServiceBrandingImages(): {
  images: Record<string, string>;
  loading: boolean;
} {
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: services } = await supabase
        .from('services')
        .select('slug, branding_image_url')
        .eq('is_active', true)
        .eq('is_internal', false);

      const mediaAssets = await fetchMediaAssets('service_branding');
      const map: Record<string, string> = {};
      for (const svc of services || []) {
        if (svc.branding_image_url) {
          map[svc.slug] = svc.branding_image_url;
        } else {
          const mediaMatch = findAssetByKey(mediaAssets, svc.slug);
          map[svc.slug] = mediaMatch ? mediaMatch.file_url : fallbackServiceImage(svc.slug);
        }
      }

      if (!cancelled) {
        setImages(withSmartSortAlias(map));
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { images, loading };
}

export function useLoginCarouselImages(): {
  images: Record<string, string>;
  loading: boolean;
} {
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: services } = await supabase
        .from('services')
        .select('slug, login_image_url')
        .eq('is_active', true)
        .eq('is_internal', false);

      const mediaAssets = await fetchMediaAssets('login_carousel');
      const map: Record<string, string> = {};
      for (const svc of services || []) {
        if (svc.login_image_url) {
          map[svc.slug] = svc.login_image_url;
        } else {
          const mediaMatch = findAssetByKey(mediaAssets, svc.slug);
          map[svc.slug] = mediaMatch ? mediaMatch.file_url : fallbackLoginImage(svc.slug);
        }
      }

      if (!cancelled) {
        setImages(withSmartSortAlias(map));
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { images, loading };
}

/** Active splash assets keyed by canonical key. Always includes splash-hero fallback. */
export function useSplashImages(): {
  images: Record<string, string>;
  loading: boolean;
} {
  const [images, setImages] = useState<Record<string, string>>({ 'splash-hero': FALLBACK_SPLASH });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const assets = await fetchMediaAssets('splash');
      const map: Record<string, string> = {};
      for (const asset of assets) {
        const key = canonicalizeMediaKey(asset.key);
        if (!(key in map)) map[key] = asset.file_url;
      }
      if (!map['splash-hero']) map['splash-hero'] = FALLBACK_SPLASH;

      if (!cancelled) {
        setImages(withSmartSortAlias(map));
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { images, loading };
}

export async function uploadMediaFile(
  file: File,
  folder: string = 'general',
): Promise<{ path: string; url: string } | null> {
  const ext = file.name.split('.').pop() || 'bin';
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from('media')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) return null;

  const { data: urlData } = supabase.storage
    .from('media')
    .getPublicUrl(fileName);

  return { path: fileName, url: urlData.publicUrl };
}

export async function deleteMediaFile(filePath: string): Promise<boolean> {
  const { error } = await supabase.storage.from('media').remove([filePath]);
  return !error;
}

export function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
