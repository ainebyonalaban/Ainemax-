import React from 'react';
import { WifiOff } from 'lucide-react';
import { usePWA } from '../../context/PWAContext';

export function OfflineIndicator() {
  const { isOnline } = usePWA();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 text-white px-3.5 py-2 text-xs font-semibold shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Offline Mode — Reconnecting when internet returns</span>
    </div>
  );
}
