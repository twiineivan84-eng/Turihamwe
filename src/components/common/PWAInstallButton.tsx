import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Monitor, CheckCircle2, AlertCircle, X, Smartphone } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'header' | 'login';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    installStatus,
    installError,
    install,
    clearFeedback,
  } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState(false);

  // When running as an installed standalone PWA, hide the install CTA
  if (isInstalled && installStatus !== 'installed') {
    return null;
  }

  return (
    <>
      {installStatus === 'installed' && (
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>App Installed</span>
        </div>
      )}

      {!isInstalled && isInstallable && (
        <button
          type="button"
          onClick={install}
          disabled={installStatus === 'installing'}
          title="Install Turihamwe Management System as a desktop or mobile application"
          className={
            variant === 'login'
              ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition cursor-pointer disabled:opacity-60'
              : 'inline-flex items-center gap-1.5 rounded-lg bg-[#1a44b8] hover:bg-[#153896] px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition cursor-pointer disabled:opacity-60'
          }
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{installStatus === 'installing' ? 'Installing...' : 'Install App'}</span>
        </button>
      )}

      {!isInstalled && !isInstallable && isIOS && (
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-blue-700" />
          <span>Install on iOS</span>
        </button>
      )}

      {!isInstalled && !isInstallable && !isIOS && (
        <button
          type="button"
          onClick={() => setShowDesktopGuide(true)}
          title="Windows Chrome / Edge Installation Instructions"
          className={
            variant === 'login'
              ? 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition cursor-pointer'
              : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition cursor-pointer'
          }
        >
          <Monitor className="w-3.5 h-3.5 text-blue-700 shrink-0" />
          <span className="hidden lg:inline">Install Desktop App</span>
          <span className="lg:hidden">Install</span>
        </button>
      )}

      {(installStatus === 'dismissed' || installStatus === 'failed') && installError && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-lg text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Installation Notice</p>
            <p className="mt-0.5 text-amber-800">{installError}</p>
          </div>
          <button
            type="button"
            onClick={clearFeedback}
            aria-label="Close installation notice"
            className="text-amber-600 hover:text-amber-900 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Install Turihamwe on iPhone / iPad</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              1. Tap the <strong>Share</strong> icon in the Safari toolbar.<br />
              2. Scroll down and select <strong>Add to Home Screen</strong>.<br />
              3. Confirm <strong>Turihamwe</strong> to launch in standalone mode.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full rounded-lg bg-[#0f2744] py-2 text-xs font-semibold text-white hover:bg-[#1a44b8] transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showDesktopGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Install Turihamwe Management System on Windows
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nyamuyanja SACCO Ltd • Standalone Desktop &amp; Start Menu App
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDesktopGuide(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <p>
                <strong>Microsoft Edge:</strong> Click the <strong>App Available (Install)</strong> icon on the right side of the address bar, or open <strong>Menu (&hellip;) &rarr; Apps &rarr; Install this site as an app</strong>.
              </p>
              <p>
                <strong>Google Chrome:</strong> Click the <strong>Install Turihamwe Management System</strong> icon in the address bar, or open <strong>Menu (&#8942;) &rarr; Save and share &rarr; Install page as app</strong>.
              </p>
              <p className="text-slate-500">
                Once installed, Windows adds a Desktop shortcut and Start Menu entry opening in a clean standalone window. Note: browsers require HTTPS (or localhost) outside embedded preview frames to trigger automatic prompt installation.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDesktopGuide(false)}
              className="mt-4 w-full rounded-lg bg-[#0f2744] py-2 text-xs font-semibold text-white hover:bg-[#1a44b8] transition"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
