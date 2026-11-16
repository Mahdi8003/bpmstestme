import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __ravandPwaPrompt?: BeforeInstallPromptEvent;
  }
}

type PwaInstallState = {
  canInstall: boolean;
  isStandalone: boolean;
  isIos: boolean;
  isAndroid: boolean;
};

const listeners = new Set<() => void>();
let deferredPrompt: BeforeInstallPromptEvent | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  const media = window.matchMedia?.('(display-mode: standalone)');
  const navigatorStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return Boolean(media?.matches) || navigatorStandalone === true;
}

function currentPrompt() {
  if (typeof window === 'undefined') return null;
  return deferredPrompt ?? window.__ravandPwaPrompt ?? null;
}

function readState(): PwaInstallState {
  if (typeof window === 'undefined') {
    return { canInstall: false, isStandalone: false, isIos: false, isAndroid: false };
  }
  const userAgent = window.navigator.userAgent;
  const isIpadOs = /macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;
  return {
    canInstall: currentPrompt() !== null,
    isStandalone: isStandaloneMode(),
    isIos: /iphone|ipad|ipod/i.test(userAgent) || isIpadOs,
    isAndroid: /android/i.test(userAgent),
  };
}

if (typeof window !== 'undefined') {
  deferredPrompt = window.__ravandPwaPrompt ?? null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    window.__ravandPwaPrompt = deferredPrompt ?? undefined;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.__ravandPwaPrompt = undefined;
    emit();
  });

  window.addEventListener('ravand:install-available', emit);

  const media = window.matchMedia?.('(display-mode: standalone)');
  media?.addEventListener?.('change', emit);
}

export function usePwaInstall() {
  const [state, setState] = useState<PwaInstallState>(() => readState());

  useEffect(() => {
    const update = () => setState(readState());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  return state;
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = currentPrompt();
  if (!event) return 'unavailable';
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') {
      deferredPrompt = null;
      window.__ravandPwaPrompt = undefined;
      emit();
    }
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('[pwa] service worker registration failed', error);
    });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
