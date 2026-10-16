// src/components/ui/HostGuard.tsx

/**
 * Entry gate that runs before anything else: it checks the hostname against the
 * build kind and, on a mismatch, renders a blocking screen instead of the app.
 *
 * Because the children are never rendered, no store effect runs: the local
 * database is not opened, no authentication is attempted and no sync is started.
 *
 * `BlockedHostScreen` is also what src/main.tsx renders when the earlier host
 * check (src/lib/entryGate.ts) refuses the hostname and the application module is
 * not imported at all. It is exported so both layers show exactly the same screen
 * instead of keeping two copies of it.
 */

import type { ReactNode } from 'react';
import { currentBuildKind, decideHost, type BuildKind } from '../../lib/buildTarget';

interface BlockedHostScreenProps {
  hostname: string;
  reason: string;
  buildKind: BuildKind;
}

export function BlockedHostScreen({ hostname, reason, buildKind }: BlockedHostScreenProps) {
  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center px-6">
      <div className="w-full max-w-120 text-center">
        <h1 className="text-xl font-bold text-white mb-3">Сборка остановлена</h1>
        <p className="text-sm text-[#B0B0B0] mb-4">{reason}</p>
        <div className="bg-[#1E1E1E] rounded-xl p-4 text-left space-y-1 mb-4">
          <p className="text-xs text-[#707070]">
            адрес: <span className="text-[#B0B0B0]">{hostname || '—'}</span>
          </p>
          <p className="text-xs text-[#707070]">
            сборка: <span className="text-[#B0B0B0]">{buildKind === 'test' ? 'тестовая' : 'production'}</span>
          </p>
        </div>
        <p className="text-xs text-[#707070]">
          База, авторизация и синхронизация не запускались, данные на устройстве не изменялись.
        </p>
      </div>
    </div>
  );
}

export function HostGuard({ children }: { children: ReactNode }) {
  const buildKind = currentBuildKind();
  const decision = decideHost(window.location.hostname, buildKind);

  if (!decision.allowed) {
    return (
      <BlockedHostScreen
        hostname={decision.hostname}
        reason={decision.reason}
        buildKind={buildKind}
      />
    );
  }

  return <>{children}</>;
}
