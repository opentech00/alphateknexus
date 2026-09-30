import type { Session } from '@supabase/supabase-js';

/** Reads `app_role` stamped by `custom_access_token_hook` without an extra profiles round-trip. */
export function jwtAppRole(session: Session | null | undefined): string | null {
  const token = session?.access_token;
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    const payload = JSON.parse(json) as { app_role?: unknown };
    return typeof payload.app_role === 'string' && payload.app_role ? payload.app_role : null;
  } catch {
    return null;
  }
}
