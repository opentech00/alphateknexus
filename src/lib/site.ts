/** Canonical production origin. Monime returns and iOS A2HS require public HTTPS. */
export const PRODUCTION_HTTPS_ORIGIN = 'https://atnapp.vercel.app';

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
}

export function isPublicHttpsOrigin(origin = typeof window !== 'undefined' ? window.location.origin : ''): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && !isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}
