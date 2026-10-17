// src/main.tsx

/**
 * Application entry point.
 *
 * The host check runs here, before the application is imported: on a hostname
 * that does not belong to this build only the blocking screen is loaded, so the
 * application code, the local database and the service-worker
 * registration are never evaluated there. `HostGuard` checks the same decision
 * again at render time as the second line of defence.
 *
 * Imports are intentionally direct instead of going through the `components/ui`
 * barrel: the barrel also re-exports modules with side effects, and the entry
 * closure is verified against an explicit list (scripts/ci/check-artifacts.mjs).
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { EntryLoadErrorScreen } from './components/ui/EntryLoadErrorScreen';
import { BlockedHostScreen, HostGuard } from './components/ui/HostGuard';
import { currentBuildKind } from './lib/buildTarget';
import { resolveEntry } from './lib/entryGate';
import './index.css';

const buildKind = currentBuildKind();
const root = ReactDOM.createRoot(document.getElementById('root')!);

void resolveEntry(window.location.hostname, buildKind, () => import('./App')).then(
  ({ decision, module, error }) => {
    if (!decision.allowed) {
      root.render(
        <BlockedHostScreen
          hostname={decision.hostname}
          reason={decision.reason}
          buildKind={buildKind}
        />
      );
      return;
    }

    // The application chunk can fail to load (a dropped connection, a stale
    // cache). This screen always renders, so the app never sits on a blank page.
    if (!module) {
      console.error('Failed to load the application module:', error);
      root.render(<EntryLoadErrorScreen />);
      return;
    }

    const App = module.default;

    root.render(
      <React.StrictMode>
        <AppErrorBoundary>
          <HostGuard>
            <App />
          </HostGuard>
        </AppErrorBoundary>
      </React.StrictMode>
    );
  }
);
