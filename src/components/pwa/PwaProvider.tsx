import { useEffect, useState } from 'react';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaProvider() {
  if (Capacitor.isNativePlatform()) return null;
  return (
    <>
      <PwaInstallBanner />
      <PwaUpdateToast />
    </>
  );
}

function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (sessionStorage.getItem('atn-pwa-install-dismissed') === '1') {
        setHidden(true);
        return;
      }
    } catch { /* ignore */ }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    if (isIos()) setIosHint(true);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    setHidden(true);
    setDeferred(null);
    setIosHint(false);
    try { sessionStorage.setItem('atn-pwa-install-dismissed', '1'); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') dismiss();
    setDeferred(null);
  };

  if (hidden || isStandalone() || (!deferred && !iosHint)) return null;

  return (
    <div className="fixed left-3 right-3 z-[120] md:left-auto md:right-4 md:w-96"
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="flex items-start gap-3 rounded-2xl bg-slate-900 text-white shadow-2xl p-3.5">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          {deferred ? <Download className="w-5 h-5 text-emerald-400" /> : <Share className="w-5 h-5 text-emerald-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install AlphaTek Nexus</p>
          <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
            {deferred
              ? 'Add to your home screen for a faster, app-like experience.'
              : 'Tap Share, then Add to Home Screen.'}
          </p>
          {deferred && (
            <button
              onClick={install}
              className="mt-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-xs font-bold rounded-lg"
            >
              Install app
            </button>
          )}
        </div>
        <button onClick={dismiss} className="p-1 rounded-lg text-slate-400 hover:text-white" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
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
    <div className="fixed top-3 left-3 right-3 z-[130] md:left-auto md:right-4 md:w-96"
      style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
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
