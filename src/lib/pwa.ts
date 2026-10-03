import { isPublicHttpsOrigin } from './site';

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua) || iPadOs;
}

export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isApple = isIosDevice() || /Macintosh/.test(ua);
  const isWebkit = /WebKit/i.test(ua);
  const isOther = /CriOS|FxiOS|OPiOS|EdgiOS|Chrome|Android|Firefox/i.test(ua);
  return isApple && isWebkit && !isOther;
}

export function isIosSafari(): boolean {
  return isIosDevice() && isSafari();
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|LinkedInApp|WhatsApp|Messenger/i.test(navigator.userAgent);
}

export function isAndroidWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Android/i.test(ua) && /; wv\)/.test(ua);
}

/** Keep the React app mounted while Monime runs, so cancel cannot strand the user on a DNS error page. */
export function shouldKeepCheckoutShell(): boolean {
  return isStandalone() || isInAppBrowser() || isAndroidWebView();
}

export function isIosPwa(): boolean {
  return isIosDevice() && isStandalone();
}

/** Add to Home Screen only works over public HTTPS in Safari on a real iPhone. */
export function canInstallIosPwa(): boolean {
  return isPublicHttpsOrigin() && isIosDevice() && !isStandalone();
}

export const CLIENT_PWA_PAGES = [
  'home',
  'services',
  'bookings',
  'account',
  'calendar',
  'billing',
  'quotes',
  'support',
] as const;

export type ClientPwaPage = (typeof CLIENT_PWA_PAGES)[number];

export function isClientPwaPage(value: string | null | undefined): value is ClientPwaPage {
  return !!value && (CLIENT_PWA_PAGES as readonly string[]).includes(value);
}
