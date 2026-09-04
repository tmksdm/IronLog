// src/utils/updateChecker.ts

/**
 * Checks for app updates and stages new PWA assets without activating them.
 * The waiting service worker is activated only after explicit user consent.
 */

import { APP_VERSION } from '../version';

const CHECK_INTERVAL = 5 * 60 * 1000;
let updateRegistration: ServiceWorkerRegistration | null = null;

function isNewer(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);

  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

function getBaseUrl(): string {
  return import.meta.env.BASE_URL || './';
}

export type UpdateStatus =
  | { available: false }
  | { available: true; remoteVersion: string; changes: string[] };

export async function checkForUpdate(): Promise<UpdateStatus> {
  try {
    const url = `${getBaseUrl()}version.json?_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { available: false };

    const data = await res.json();
    const remoteVersion = data?.version;
    if (typeof remoteVersion !== 'string') return { available: false };

    const changes = Array.isArray(data?.changes)
      ? data.changes.filter(
          (change: unknown): change is string =>
            typeof change === 'string' && change.trim().length > 0
        )
      : [];

    if (isNewer(remoteVersion, APP_VERSION)) {
      return { available: true, remoteVersion, changes };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

type ControllerChangeSubscriber = (listener: () => void) => () => void;

export function activateWaitingServiceWorker(
  waitingWorker: Pick<ServiceWorker, 'postMessage'>,
  subscribeToControllerChange: ControllerChangeSubscriber,
  reload: () => void
): void {
  const unsubscribe = subscribeToControllerChange(() => {
    unsubscribe();
    reload();
  });
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export async function applyUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const registration = updateRegistration
    ?? await navigator.serviceWorker.getRegistration(getBaseUrl());
  const waitingWorker = registration?.waiting;
  if (!waitingWorker) return;

  activateWaitingServiceWorker(
    waitingWorker,
    (listener) => {
      navigator.serviceWorker.addEventListener('controllerchange', listener);
      return () => navigator.serviceWorker.removeEventListener('controllerchange', listener);
    },
    () => window.location.reload()
  );
}

async function waitUntilWorkerIsWaiting(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  if (registration.waiting) return true;

  const worker = registration.installing;
  if (!worker) return false;

  return new Promise((resolve) => {
    const onStateChange = () => {
      if (worker.state === 'installed') {
        worker.removeEventListener('statechange', onStateChange);
        resolve(registration.waiting !== null);
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', onStateChange);
        resolve(false);
      }
    };

    worker.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null;

  try {
    updateRegistration ??= await navigator.serviceWorker.register(`${getBaseUrl()}sw.js`, {
      scope: getBaseUrl(),
      updateViaCache: 'none',
    });
    return updateRegistration;
  } catch {
    return null;
  }
}

async function prepareUpdate(): Promise<boolean> {
  const registration = await ensureServiceWorkerRegistration();
  if (!registration) return false;

  try {
    // The first worker only bootstraps controlled updates.
    if (!navigator.serviceWorker.controller) return false;
    if (registration.waiting) return true;

    await registration.update();
    return waitUntilWorkerIsWaiting(registration);
  } catch {
    return false;
  }
}

export function startUpdateChecker(
  onUpdateAvailable: (update: Extract<UpdateStatus, { available: true }>) => void
): () => void {
  let stopped = false;

  // Install the first controlling worker even when this is already the latest release.
  void ensureServiceWorkerRegistration();

  const doCheck = async () => {
    if (stopped) return;
    const result = await checkForUpdate();
    if (result.available && await prepareUpdate()) {
      onUpdateAvailable(result);
    }
  };

  const initialTimeout = setTimeout(doCheck, 5000);
  const interval = setInterval(doCheck, CHECK_INTERVAL);

  return () => {
    stopped = true;
    clearTimeout(initialTimeout);
    clearInterval(interval);
  };
}
