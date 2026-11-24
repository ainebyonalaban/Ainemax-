import React, { useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone, X } from 'lucide-react';
import { usePWA } from '../../context/PWAContext';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'sidebar' | 'drawer' | 'settings';
  onActionComplete?: () => void;
}

export function PWAInstallButton({
  variant = 'compact',
  onActionComplete,
}: PWAInstallButtonProps) {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    isInIframe,
    isSecureContext,
    swRegistered,
    install,
  } = usePWA();
  const [showGuideModal, setShowGuideModal] = useState(false);

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
      onActionComplete?.();
      return;
    }
    setShowGuideModal(true);
  };

  if (isInstalled) {
    if (variant !== 'settings') return null;
    return (
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>AINEMAX is installed and running in standalone app mode.</span>
      </div>
    );
  }

  // In navbar/sidebar, only show when the browser natively supports direct install prompt or iOS Safari guide
  if ((variant === 'compact' || variant === 'sidebar') && !isInstallable && !isIOS) {
    return null;
  }

  const buttonMarkup = (() => {
    if (variant === 'compact') {
      return (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          aria-label="Install AINEMAX"
          title="Install AINEMAX app"
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/70 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Install AINEMAX</span>
        </button>
      );
    }

    if (variant === 'sidebar') {
      return (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          title="Install AINEMAX on this device"
          className="w-full flex items-center justify-center lg:justify-start gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="hidden lg:inline">Install AINEMAX</span>
        </button>
      );
    }

    if (variant === 'drawer') {
      return (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="w-full h-12 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Install AINEMAX</span>
        </button>
      );
    }

    // Settings card variant
    return (
      <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/70 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Install AINEMAX App
            </p>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {isInstallable
              ? 'Ready to install directly to your home screen for full-screen standalone launch.'
              : isIOS
                ? 'Install on iPhone or iPad via Safari Share -> Add to Home Screen.'
                : isInIframe
                  ? 'Open AINEMAX directly in Android Chrome or desktop Chrome to trigger the browser install prompt.'
                  : 'Install via your browser menu ("Install app" / "Add to Home screen") for full-screen standalone launch.'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            HTTPS: {isSecureContext ? 'Verified' : 'Required'} · Offline Service Worker:{' '}
            {swRegistered ? 'Active' : 'Initializing'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Install AINEMAX</span>
        </button>
      </div>
    );
  })();

  return (
    <>
      {buttonMarkup}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Install AINEMAX instructions"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Install AINEMAX
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Standalone App Setup
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close install instructions"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {isIOS ? (
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
                <p>To install AINEMAX on your iPhone or iPad:</p>
                <p className="flex items-center gap-1.5">
                  <span>1. Tap the</span>
                  <Share className="w-3.5 h-3.5 text-blue-600 inline shrink-0" aria-hidden="true" />
                  <strong className="text-slate-900 dark:text-white">Share</strong>
                  <span>button in Safari.</span>
                </p>
                <p>
                  2. Scroll down and tap{' '}
                  <strong className="text-slate-900 dark:text-white">Add to Home Screen</strong>,
                  then tap <strong className="text-slate-900 dark:text-white">Add</strong>.
                </p>
              </div>
            ) : (
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
                {isInIframe && (
                  <p className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                    Browsers block app installation inside embedded preview frames. Open the live
                    HTTPS site directly in {isAndroid ? 'Android Chrome' : 'Chrome or Edge'} to
                    install.
                  </p>
                )}
                <p>To install AINEMAX on {isAndroid ? 'Android Chrome / Edge / Samsung Internet' : 'your browser'}:</p>
                <p>
                  1. Open the browser menu (<strong className="text-slate-900 dark:text-white">⋮</strong>{' '}
                  top right).
                </p>
                <p>
                  2. Tap <strong className="text-slate-900 dark:text-white">Install app</strong> or{' '}
                  <strong className="text-slate-900 dark:text-white">Add to Home screen</strong>.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
