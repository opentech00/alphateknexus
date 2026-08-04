import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from './supabase';

const PUBLIC_MARKER = '/storage/v1/object/public/documents/';
const PLAIN_MARKER = '/storage/v1/object/documents/';
const SIGN_MARKER = '/storage/v1/object/sign/documents/';

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

/**
 * Exchange a stored document reference for a short-lived signed URL. Returns
 * null when the current session is not allowed to read the object.
 */
export async function signedDocumentUrl(
  urlOrPath: string,
  expiresIn = 300,
  client: SupabaseClient = defaultClient,
): Promise<string | null> {
  const path = documentObjectPath(urlOrPath);
  if (!path) return null;
  const { data, error } = await client.storage
    .from('documents')
    .createSignedUrl(path, expiresIn);
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
