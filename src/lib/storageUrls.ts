import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from './supabase';

const PUBLIC_MARKER = '/storage/v1/object/public/documents/';
const PLAIN_MARKER = '/storage/v1/object/documents/';
const SIGN_MARKER = '/storage/v1/object/sign/documents/';

export type ImageTransform = {
  width?: number;
  height?: number;
  quality?: number;
  resize?: 'cover' | 'contain' | 'fill';
};

/**
 * The documents bucket is private. Stored file URLs may still be the legacy
 * public-style URL, so pull the object path back out of whatever we were given.
 */
export function documentObjectPath(urlOrPath: string): string {
  if (!urlOrPath) return '';
  for (const marker of [PUBLIC_MARKER, SIGN_MARKER, PLAIN_MARKER]) {
    const idx = urlOrPath.indexOf(marker);
    if (idx !== -1) {
      const raw = urlOrPath.slice(idx + marker.length).split('?')[0];
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return urlOrPath.replace(/^\/+/, '');
}

function storageObjectPath(urlOrPath: string, bucket: string): string | null {
  if (!urlOrPath) return null;
  if (!urlOrPath.includes('/storage/v1/object/')) {
    return urlOrPath.includes('/') || !urlOrPath.startsWith('http') ? urlOrPath.replace(/^\/+/, '') : null;
  }
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/render/image/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/${bucket}/`,
  ];
  for (const marker of markers) {
    const idx = urlOrPath.indexOf(marker);
    if (idx !== -1) {
      const raw = urlOrPath.slice(idx + marker.length).split('?')[0];
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/**
 * Public-bucket image URL with optional Image Transformation (width/height/quality).
 * External URLs (not on this project's storage) are returned unchanged.
 */
export function transformedMediaUrl(
  urlOrPath: string,
  size = 128,
  bucket = 'media',
  client: SupabaseClient = defaultClient,
): string {
  if (!urlOrPath) return '';
  if (urlOrPath.startsWith('data:') || urlOrPath.startsWith('blob:')) return urlOrPath;
  if (urlOrPath.startsWith('/') && !urlOrPath.includes('/storage/')) return urlOrPath;
  if (urlOrPath.startsWith('http') && !urlOrPath.includes('/storage/v1/')) return urlOrPath;

  const path = storageObjectPath(urlOrPath, bucket);
  if (!path) return urlOrPath;

  const { data } = client.storage.from(bucket).getPublicUrl(path, {
    transform: { width: size, height: size, resize: 'cover', quality: 70 },
  });
  return data.publicUrl || urlOrPath;
}

/**
 * Exchange a stored document reference for a short-lived signed URL. Returns
 * null when the current session is not allowed to read the object.
 */
export async function signedDocumentUrl(
  urlOrPath: string,
  expiresIn = 300,
  client: SupabaseClient = defaultClient,
  transform?: ImageTransform,
): Promise<string | null> {
  const path = documentObjectPath(urlOrPath);
  if (!path) return null;
  const { data, error } = await client.storage
    .from('documents')
    .createSignedUrl(path, expiresIn, transform ? { transform } : undefined);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Open a stored document in a new tab through a short-lived signed URL. */
export async function openDocument(
  urlOrPath: string,
  client: SupabaseClient = defaultClient,
): Promise<boolean> {
  const signed = await signedDocumentUrl(urlOrPath, 300, client);
  if (!signed) return false;
  window.open(signed, '_blank', 'noopener,noreferrer');
  return true;
}
