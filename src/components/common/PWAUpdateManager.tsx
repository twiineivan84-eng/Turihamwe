import React, { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { RefreshCw, CheckCircle2, X } from 'lucide-react';

export const PWAUpdateManager: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateHandler, setUpdateHandler] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          setNeedRefresh(true);
        },
        onOfflineReady() {
          setOfflineReady(true);
          setTimeout(() => {
            setOfflineReady(false);
          }, 5000);
        },
        onRegisteredSW(_swUrl, registration) {
          if (registration) {
            // Check for application updates periodically when online without disrupting IndexedDB or active session
            setInterval(() => {
              if (navigator.onLine) {
                registration.update().catch(() => {
                  // Ignore transient offline update check errors
                });
              }
            }, 30 * 60 * 1000);
          }
        },
        onRegisterError(error) {
          console.warn('Service worker registration notice:', error);
        },
      });

      setUpdateHandler(() => updateSW);
    } catch {
      // Service worker registration unavailable in non-supporting contexts
    }
  }, []);

  if (!needRefresh && !offlineReady) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm space-y-2">
      {needRefresh && (
        <div className="rounded-xl border border-blue-200 bg-white p-3.5 shadow-xl text-xs text-slate-800 flex items-start gap-3">
          <RefreshCw className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-slate-900">Application Update Ready</p>
            <p className="mt-0.5 text-slate-600">
              A new version of Turihamwe is available. Updating preserves all local branch records and session state.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateHandler?.(true)}
                className="rounded-lg bg-[#1a44b8] px-3 py-1.5 font-semibold text-white hover:bg-[#153896] transition cursor-pointer"
              >
                Apply Update Now
              </button>
              <button
                type="button"
                onClick={() => setNeedRefresh(false)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {offlineReady && !needRefresh && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 shadow-lg text-xs text-emerald-900 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">Turihamwe installed shell ready for offline use.</span>
          <button
            type="button"
            onClick={() => setOfflineReady(false)}
            aria-label="Dismiss offline ready notice"
            className="text-emerald-700 hover:text-emerald-900 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
