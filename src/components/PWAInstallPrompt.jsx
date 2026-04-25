import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';

const DISMISS_KEY = 'hopeCity_pwaPromptDismissed';

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isWebkit = /webkit/i.test(ua);
  const isCriOS = /crios/i.test(ua);
  return isIos && isWebkit && !isCriOS;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function PWAInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DISMISS_KEY) === 'true';
  });
  const [showIosHint, setShowIosHint] = useState(false);

  const dismissPrompt = () => {
    setDismissed(true);
    window.localStorage.setItem(DISMISS_KEY, 'true');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (isStandalone()) {
      window.localStorage.setItem(DISMISS_KEY, 'true');
      return undefined;
    }
    setShowIosHint(isIosSafari());

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
    };

    const onInstalled = () => {
      setPromptEvent(null);
      setShowIosHint(false);
      setDismissed(true);
      window.localStorage.setItem(DISMISS_KEY, 'true');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (dismissed || isStandalone() || (!promptEvent && !showIosHint)) return null;

  const handleInstall = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome !== 'accepted') {
      dismissPrompt();
      return;
    }
    dismissPrompt();
    setPromptEvent(null);
  };

  return (
    <div className="rounded-3xl border border-teal-900/10 bg-white/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-900 text-white">
          {promptEvent ? <Download className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-teal-900">Install Hope City</p>
          {promptEvent ? (
            <p className="mt-1 text-sm text-slate-600">
              Add the app to your home screen for faster launches, offline access, and a cleaner full-screen experience.
            </p>
          ) : (
            <div className="mt-1 text-sm text-slate-600">
              <p>On iPhone:</p>
              <p>1. Tap the Share button in Safari.</p>
              <p>2. Tap <span className="font-semibold text-teal-900">Add to Home Screen</span>.</p>
              <p>3. Tap <span className="font-semibold text-teal-900">Add</span>.</p>
            </div>
          )}
          {promptEvent ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex items-center rounded-full bg-teal-900 px-4 py-2 text-sm font-bold text-white"
              >
                Install App
              </button>
              <button
                type="button"
                onClick={dismissPrompt}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
              >
                Don&apos;t Show Again
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={dismissPrompt}
              className="mt-3 inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
            >
              Don&apos;t Show Again
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismissPrompt}
          className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
