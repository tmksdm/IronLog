// src/components/ui/UpdateBanner.tsx

/**
 * A banner that appears at the top of the screen when a new version is available.
 * Shows the new version number and a button to reload the app.
 */

import { RefreshCw } from 'lucide-react';
import { applyUpdate } from '../../utils/updateChecker';

interface UpdateBannerProps {
  remoteVersion: string;
}

export function UpdateBanner({ remoteVersion }: UpdateBannerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 animate-fade-in">
      <div className="max-w-[480px] mx-auto px-4 pt-2">
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#1B5E20] rounded-xl shadow-lg">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              Доступно обновление v{remoteVersion}
            </p>
          </div>
          <button
            onClick={applyUpdate}
            className="flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30
                       rounded-lg text-white text-sm font-semibold shrink-0
                       active:scale-95 transition-all"
          >
            <RefreshCw size={16} />
            Обновить
          </button>
        </div>
      </div>
    </div>
  );
}
