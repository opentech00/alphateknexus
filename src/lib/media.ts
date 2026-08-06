import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { MediaAsset, MediaCategory } from '../types';

// Fallback static paths — used when the media library has no active asset
// for a given key, so the app never shows a broken image during transition.
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
  'smart-sort': '/login-smart-sort.webp',
  'clearing-forwarding': '/login-clearing-forwarding.webp',
  'private-security': '/login-private-security.webp',
  'cleaning-janitorial': '/login-cleaning-janitorial.webp',
  'procurement': '/login-procurement.webp',
};

export function fallbackLogo(): string {
  return FALLBACK_LOGO;
}

export function fallbackServiceImage(slug: string): string {
  return FALLBACK_SERVICE_IMAGES[slug] || FALLBACK_SERVICE_IMAGES['smart-sort'];
}

export function fallbackLoginImage(slug: string): string {
  return FALLBACK_LOGIN_SLIDES[slug] || FALLBACK_LOGIN_SLIDES['smart-sort'];
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

  if (key) query = query.eq('key', key);

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

/**
 * Hook: returns the app logo URL from the media library, falling back to the static file.
 */
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

/**
 * Hook: returns a map of service slug → branding image URL.
 * Uses the services table branding_image_url if set, otherwise checks the media
 * library, otherwise falls back to the static file.
 */
export function useServiceBrandingImages(): {
  images: Record<string, string>;
  loading: boolean;
} {
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Fetch all services to get their slugs + branding_image_url
      const { data: services } = await supabase
        .from('services')
        .select('slug, branding_image_url')
        .eq('is_active', true);

      // Fetch service_branding assets from media library
      const mediaAssets = await fetchMediaAssets('service_branding');

      const map: Record<string, string> = {};
      for (const svc of services || []) {
        // Priority: services.branding_image_url → media library → static fallback
        if (svc.branding_image_url) {
          map[svc.slug] = svc.branding_image_url;
        } else {
          const mediaMatch = mediaAssets.find((a) => a.key === svc.slug);
          if (mediaMatch) {
            map[svc.slug] = mediaMatch.file_url;
          } else {
            map[svc.slug] = fallbackServiceImage(svc.slug);
          }
        }
      }

      if (!cancelled) {
        setImages(map);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { images, loading };
}

/**
 * Hook: returns a map of service slug → login carousel image URL.
 * Uses the services table login_image_url if set, otherwise checks the media
 * library, otherwise falls back to the static file.
 */
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
        .eq('is_active', true);

      const mediaAssets = await fetchMediaAssets('login_carousel');

      const map: Record<string, string> = {};
      for (const svc of services || []) {
        if (svc.login_image_url) {
          map[svc.slug] = svc.login_image_url;
        } else {
          const mediaMatch = mediaAssets.find((a) => a.key === svc.slug);
          if (mediaMatch) {
            map[svc.slug] = mediaMatch.file_url;
          } else {
            map[svc.slug] = fallbackLoginImage(svc.slug);
          }
        }
      }

      if (!cancelled) {
        setImages(map);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { images, loading };
}

/**
 * Upload a file to the media storage bucket and return the public URL + path.
 */
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

/**
 * Delete a file from the media storage bucket.
 */
export async function deleteMediaFile(filePath: string): Promise<boolean> {
  const { error } = await supabase.storage.from('media').remove([filePath]);
  return !error;
}

/**
 * Get image dimensions from a File (for images/videos only).
 */
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
