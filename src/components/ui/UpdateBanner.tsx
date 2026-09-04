// src/components/ui/UpdateBanner.tsx

/**
 * Compact confirmation dialog shown when a new version is available.
 * The update is only applied after explicit user consent.
 */

import { RefreshCw } from 'lucide-react';
import { applyUpdate } from '../../utils/updateChecker';
import { Button } from './Button';

interface UpdatePromptProps {
  remoteVersion: string;
  changes: string[];
  onSkip: () => void;
}

export function UpdatePrompt({ remoteVersion, changes, onSkip }: UpdatePromptProps) {
  const visibleChanges = changes.slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-[360px] rounded-2xl bg-[#1E1E1E] p-5 shadow-xl animate-slide-up">
        <h2 id="update-title" className="text-lg font-bold text-white">
          Доступна версия {remoteVersion}
        </h2>

        <div className="mt-2 text-sm text-[#B0B0B0]">
          {visibleChanges.length > 0 ? (
            <ul className="space-y-1">
              {visibleChanges.map((change) => (
                <li key={change} className="flex gap-2">
                  <span className="text-green-500" aria-hidden="true">•</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Исправления и улучшения.</p>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <Button variant="ghost" size="sm" fullWidth onClick={onSkip}>
            Пропустить
          </Button>
          <Button size="sm" fullWidth onClick={() => void applyUpdate()}>
            <RefreshCw size={16} aria-hidden="true" />
            Обновить
          </Button>
        </div>
      </div>
    </div>
  );
}
