import { useEffect, useState } from 'react';
import { Download, RefreshCw, Share, WifiOff, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ErrorBoundary } from '../ErrorBoundary';
import {
  canInstallIosPwa,
  isInAppBrowser,
  isIosDevice,
  isIosSafari,
  isStandalone,
} from '../../lib/pwa';
import { isPublicHttpsOrigin } from '../../lib/site';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const IOS_INSTALL_KEY = 'atn-pwa-ios-install';
const IOS_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export function PwaProvider() {
  if (Capacitor.isNativePlatform()) return null;
  return (
    <>
      <StandaloneLaunchSplash />
      <PwaInstallBanner />
      <IosInstallSheet />
      <OfflineBanner />
      <ErrorBoundary fallback={null}>
        <PwaUpdateToast />
      </ErrorBoundary>
    </>
  );
}

function StandaloneLaunchSplash() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (!isIosDevice() || !isStandalone()) return false;
    try {
      return sessionStorage.getItem('atn-ios-launch') !== '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!visible) return;
    try { sessionStorage.setItem('atn-ios-launch', '1'); } catch { /* ignore */ }
    const id = window.setTimeout(() => setVisible(false), 900);
    return () => window.clearTimeout(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="ios-pwa-launch" role="presentation">
      <img src="/icons/apple-touch-icon.png" alt="" width={88} height={88} className="ios-pwa-launch-icon" />
      <p>AlphaTek Nexus</p>
    </div>
  );
}

function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (isStandalone() || isIosDevice() || !isPublicHttpsOrigin()) return;
    try {
      if (localStorage.getItem('atn-pwa-install-dismissed') === '1') {
        setHidden(true);
        return;
      }
    } catch { /* ignore */ }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    setHidden(true);
    setDeferred(null);
    try { localStorage.setItem('atn-pwa-install-dismissed', '1'); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') dismiss();
    setDeferred(null);
  };

  if (hidden || isStandalone() || !deferred) return null;

  return (
    <div
      className="fixed left-3 right-3 z-[120] md:left-auto md:right-4 md:w-96"
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-start gap-3 rounded-2xl bg-slate-900 text-white shadow-2xl p-3.5">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install AlphaTek Nexus</p>
          <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
            Add to your home screen for a faster, app-like experience.
          </p>
          <button
            onClick={install}
            className="mt-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-xs font-bold rounded-lg"
          >
            Install app
          </button>
        </div>
        <button onClick={dismiss} className="p-1 rounded-lg text-slate-400 hover:text-white" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function IosInstallSheet() {
  const [open, setOpen] = useState(false);
  const inApp = isInAppBrowser();
  const safari = isIosSafari();

  useEffect(() => {
    if (!canInstallIosPwa()) return;
    try {
      const raw = localStorage.getItem(IOS_INSTALL_KEY);
      if (raw === 'never') return;
      if (raw && Date.now() - Number(raw) < IOS_SNOOZE_MS) return;
    } catch { /* ignore */ }

    const id = window.setTimeout(() => setOpen(true), 2400);
    return () => window.clearTimeout(id);
  }, []);

  const snooze = () => {
    setOpen(false);
    try { localStorage.setItem(IOS_INSTALL_KEY, String(Date.now())); } catch { /* ignore */ }
  };

  const never = () => {
    setOpen(false);
    try { localStorage.setItem(IOS_INSTALL_KEY, 'never'); } catch { /* ignore */ }
  };

  if (!open || !canInstallIosPwa()) return null;

  return (
    <div className="ios-pwa-sheet" role="dialog" aria-labelledby="ios-pwa-title">
      <button className="ios-pwa-sheet-backdrop" onClick={snooze} aria-label="Dismiss" />
        <div className="ios-pwa-sheet-card">
        <div className="ios-pwa-sheet-handle" />
        <div className="flex items-center gap-3 mb-4">
          <img src="/icons/apple-touch-icon.png" alt="" width={52} height={52} className="rounded-[13px] shadow-lg" />
          <div>
            <p id="ios-pwa-title" className="text-base font-extrabold text-slate-900 dark:text-slate-50">Add to Home Screen</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Safari on this HTTPS site. Not Chrome, in-app browsers, or localhost.</p>
          </div>
        </div>

        {inApp && (
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Open this page in <span className="font-semibold text-slate-900">Safari</span>, then tap Share and Add to Home Screen.
          </p>
        )}

        {!inApp && !safari && (
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            iPhone install works from Safari. Tap the share menu and choose <span className="font-semibold">Open in Safari</span>.
          </p>
        )}

        {safari && !inApp && (
          <ol className="space-y-3 mb-5">
            <li className="flex items-center gap-3">
              <span className="ios-pwa-step">1</span>
              <span className="text-sm text-slate-700 dark:text-slate-300">Tap <Share className="inline w-4 h-4 text-blue-500 align-text-bottom" /> Share at the bottom of Safari</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="ios-pwa-step">2</span>
              <span className="text-sm text-slate-700">Scroll and tap <span className="font-semibold">Add to Home Screen</span></span>
            </li>
            <li className="flex items-center gap-3">
              <span className="ios-pwa-step">3</span>
              <span className="text-sm text-slate-700">Open <span className="font-semibold">AlphaTek</span> from your Home Screen</span>
            </li>
          </ol>
        )}

        <div className="ios-pwa-homescreen" aria-hidden>
          <div className="ios-pwa-homescreen-icon">
            <img src="/icons/apple-touch-icon.png" alt="" width={40} height={40} />
          </div>
          <span>AlphaTek</span>
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={snooze} className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold">
            Got it
          </button>
          <button type="button" onClick={never} className="px-4 py-3 rounded-xl text-sm font-semibold text-slate-500">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="ios-pwa-offline">
      <WifiOff className="w-4 h-4" />
      <p>You're offline. Bookings will sync when you're back.</p>
    </div>
  );
}

function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  });

  if (!needRefresh) return null;

  return (
    <div
      className="fixed top-3 left-3 right-3 z-[130] md:left-auto md:right-4 md:w-96"
      style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-600 text-white shadow-2xl p-3.5">
        <RefreshCw className="w-5 h-5 flex-shrink-0" />
        <p className="flex-1 text-sm font-medium">A new version is ready.</p>
        <button
          onClick={() => updateServiceWorker(true)}
          className="px-3 py-1.5 bg-white text-emerald-700 text-xs font-bold rounded-lg"
        >
          Update
        </button>
        <button onClick={() => setNeedRefresh(false)} className="p-1" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
