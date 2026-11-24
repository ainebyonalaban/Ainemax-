import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAContextValue {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isInIframe: boolean;
  isOnline: boolean;
  isSecureContext: boolean;
  swRegistered: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

const PWAContext = createContext<PWAContextValue | null>(null);

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandalone());
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [swRegistered, setSwRegistered] = useState(false);

  const userAgent =
    typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
  const isIOS =
    /iphone|ipad|ipod/.test(userAgent) ||
    (typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(userAgent);
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : false;

  useEffect(() => {
    try {
      registerSW({
        immediate: true,
        onRegisteredSW() {
          setSwRegistered(true);
        },
        onRegisterError() {
          setSwRegistered(false);
        },
      });
    } catch {
      // Service worker unavailable in restricted context
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg) setSwRegistered(true);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    setIsInstalled(detectStandalone());

    const mq = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    mq.addEventListener('change', handleDisplayChange);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mq.removeEventListener('change', handleDisplayChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
      return outcome;
    } catch {
      return 'unavailable';
    }
  }, [deferredPrompt]);

  return (
    <PWAContext.Provider
      value={{
        isInstallable: Boolean(deferredPrompt),
        isInstalled,
        isIOS,
        isAndroid,
        isInIframe,
        isOnline,
        isSecureContext,
        swRegistered,
        install,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}

export function usePWA() {
  const ctx = useContext(PWAContext);
  if (!ctx) {
    throw new Error('usePWA must be used within PWAProvider');
  }
  return ctx;
}
