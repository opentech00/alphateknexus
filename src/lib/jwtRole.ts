import type { Session, User } from '@supabase/supabase-js';

function roleFromClaims(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function roleFromAccessToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded)) as { app_role?: unknown };
    return roleFromClaims(payload.app_role);
  } catch {
    return null;
  }
}

/**
 * Reads `app_role` stamped by `custom_access_token_hook`.
 * Until the hook is enabled in Auth, this is null and callers round-trip `profiles.role`.
 */
export function jwtAppRole(session: Session | null | undefined, user?: User | null): string | null {
  const fromJwt = roleFromAccessToken(session?.access_token);
  if (fromJwt) return fromJwt;
  const metaUser = user ?? session?.user;
  return roleFromClaims(metaUser?.app_metadata?.app_role);
}

export function isJwtAdmin(session: Session | null | undefined, user?: User | null): boolean {
  return jwtAppRole(session, user) === 'admin';
}
