// src/lib/buildTarget.ts

/**
 * Fail-closed host guard.
 *
 * A bundle may only run on a hostname that matches its build kind:
 *   - the production build — on the production hostname (and safe local addresses);
 *   - the test build — on the approved test hostname (and safe local addresses).
 *
 * While the test hostname is not configured, an empty value is a fail-closed
 * configuration: the test build is allowed locally only. A test bundle that ends
 * up on an unknown hostname shows a blocking screen instead of silently running
 * as an app without a cloud.
 *
 * Only hostnames are compared. Different paths on the same hostname belong to
 * one trust domain (the owner's own GitHub account, or a local dev server).
 */

export type BuildKind = 'test' | 'production';

/** Hostname of the production PWA. */
export const PRODUCTION_HOSTNAME = 'tmksdm.github.io';

/**
 * Hostname of the test PWA. It lives in a separate GitHub organisation, which
 * gives it a separate origin. Empty until that organisation exists — an empty
 * value is deliberate fail-closed configuration.
 *
 * TODO(Stage 00 / 4.3): set to '<organisation>.github.io' when it is created.
 */
export const TEST_HOSTNAME = '';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Local addresses: loopback (including the Capacitor WebView hostname
 * `localhost`) and RFC 1918 ranges used for on-device dev server testing.
 */
export function isLocalHostname(hostname: string): boolean {
  if (LOCAL_HOSTNAMES.has(hostname)) return true;
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

export interface HostGuardOptions {
  productionHostname?: string;
  testHostname?: string;
}

export interface HostGuardDecision {
  allowed: boolean;
  /** Normalised hostname that was checked. */
  hostname: string;
  /** Shown on the blocking screen; meaningless when allowed. */
  reason: string;
}

/** Decides whether a build of the given kind may run on the given hostname. */
export function decideHost(
  hostname: string,
  buildKind: BuildKind,
  options: HostGuardOptions = {}
): HostGuardDecision {
  const productionHostname = (options.productionHostname ?? PRODUCTION_HOSTNAME).toLowerCase();
  const testHostname = (options.testHostname ?? TEST_HOSTNAME).toLowerCase();
  const value = (hostname ?? '').trim().toLowerCase();

  if (value === '') {
    return {
      allowed: false,
      hostname: value,
      reason: 'Hostname пуст: приложение открыто не с веб-адреса.',
    };
  }

  if (isLocalHostname(value)) {
    return { allowed: true, hostname: value, reason: 'Локальная разработка.' };
  }

  if (buildKind === 'production') {
    if (value === productionHostname) {
      return { allowed: true, hostname: value, reason: 'Рабочий адрес.' };
    }
    return {
      allowed: false,
      hostname: value,
      reason: `Production-сборка запущена на постороннем адресе «${value}», ожидался «${productionHostname}».`,
    };
  }

  if (testHostname === '') {
    return {
      allowed: false,
      hostname: value,
      reason:
        'Адрес тестового стенда ещё не задан, поэтому тестовая сборка разрешена только локально.',
    };
  }

  if (value === testHostname) {
    return { allowed: true, hostname: value, reason: 'Адрес тестового стенда.' };
  }

  return {
    allowed: false,
    hostname: value,
    reason: `Тестовая сборка запущена на постороннем адресе «${value}», ожидался «${testHostname}».`,
  };
}

/**
 * Build kind of the current bundle. The test build is produced by
 * `npm run build:test` (`--mode testdeploy`); every other mode is production.
 */
export function currentBuildKind(): BuildKind {
  return import.meta.env.MODE === 'testdeploy' ? 'test' : 'production';
}
