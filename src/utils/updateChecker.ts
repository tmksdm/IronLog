// src/utils/updateChecker.ts

/**
 * Checks for app updates by comparing local version with remote version.json.
 * Works for GitHub Pages (PWA) deployment.
 */

import { APP_VERSION } from '../version';

/** How often to check for updates (in milliseconds) */
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** Compare two semver strings. Returns true if remote is newer. */
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

/** Resolve the base URL for version.json */
function getVersionUrl(): string {
  // Use the same base as the app (handles both /IronLog/ and ./)
  const base = import.meta.env.BASE_URL || './';
  return `${base}version.json`;
}

export type UpdateStatus =
  | { available: false }
  | { available: true; remoteVersion: string };

/** Single check: fetch version.json and compare */
export async function checkForUpdate(): Promise<UpdateStatus> {
  try {
    const url = `${getVersionUrl()}?_=${Date.now()}`; // cache-bust
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { available: false };

    const data = await res.json();
    const remoteVersion = data?.version;
    if (typeof remoteVersion !== 'string') return { available: false };

    if (isNewer(remoteVersion, APP_VERSION)) {
      return { available: true, remoteVersion };
    }

    return { available: false };
  } catch {
    // Network error, offline, etc. — silently ignore
    return { available: false };
  }
}

/** Force reload bypassing cache */
export function applyUpdate(): void {
  // Clear any service worker caches if they exist
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }

  // Hard reload — bypass browser cache
  window.location.reload();
}

/** Start periodic checking. Returns a cleanup function. */
export function startUpdateChecker(
  onUpdateAvailable: (remoteVersion: string) => void
): () => void {
  let stopped = false;

  const doCheck = async () => {
    if (stopped) return;
    const result = await checkForUpdate();
    if (result.available) {
      onUpdateAvailable(result.remoteVersion);
    }
  };

  // First check after a short delay (let the app finish loading)
  const initialTimeout = setTimeout(doCheck, 5000);

  // Then check periodically
  const interval = setInterval(doCheck, CHECK_INTERVAL);

  return () => {
    stopped = true;
    clearTimeout(initialTimeout);
    clearInterval(interval);
  };
}
