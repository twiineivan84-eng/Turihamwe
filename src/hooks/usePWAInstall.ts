import { useEffect, useState, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PWAInstallStatus = 'idle' | 'installing' | 'installed' | 'dismissed' | 'failed';

// Capture early beforeinstallprompt events fired before React mounts
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((cb) => cb());
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    promptListeners.forEach((cb) => cb());
  });
}

export function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandaloneMode());
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [installStatus, setInstallStatus] = useState<PWAInstallStatus>('idle');
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    setIsInstalled(detectStandaloneMode());

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setInstallStatus('installed');
      }
    };

    const syncGlobalPrompt = () => {
      setDeferredPrompt(globalDeferredPrompt);
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(globalDeferredPrompt);
      setInstallStatus('idle');
      setInstallError(null);
    };

    const handleAppInstalled = () => {
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
      setInstallStatus('installed');
      setInstallError(null);
    };

    promptListeners.add(syncGlobalPrompt);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      promptListeners.delete(syncGlobalPrompt);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const activePrompt = deferredPrompt || globalDeferredPrompt;
    if (!activePrompt) {
      setInstallStatus('failed');
      setInstallError('Browser install prompt is not ready yet. Use Chrome or Edge address bar Install icon or Apps menu.');
      return false;
    }

    setInstallStatus('installing');
    setInstallError(null);

    try {
      await activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      if (outcome === 'accepted') {
        globalDeferredPrompt = null;
        setDeferredPrompt(null);
        setIsInstalled(true);
        setInstallStatus('installed');
        return true;
      }

      setInstallStatus('dismissed');
      setInstallError('Installation was cancelled. You can install Turihamwe anytime from the Install button.');
      return false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to complete browser installation.';
      setInstallStatus('failed');
      setInstallError(message);
      return false;
    }
  }, [deferredPrompt]);

  const clearFeedback = useCallback(() => {
    setInstallError(null);
    if (installStatus !== 'installed') {
      setInstallStatus('idle');
    }
  }, [installStatus]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    installStatus,
    installError,
    install,
    clearFeedback,
  };
}
