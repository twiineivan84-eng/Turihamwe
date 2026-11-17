import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 max-w-sm flex items-start gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg border border-amber-500"
    >
      <WifiOff className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
      <div>
        <span className="font-semibold block">Offline Mode Active</span>
        <span className="text-[11px] text-amber-50">
          Installed app shell &amp; local branch queue available. SMS &amp; server sync require internet.
        </span>
      </div>
    </div>
  );
};
