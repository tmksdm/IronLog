// src/lib/entryGate.test.ts
//
// The entry gate must keep the application from being loaded at all on a hostname
// that does not belong to the build. These tests assert the property directly:
// on a blocked host the loader is never called, on an allowed host it runs once.

import { describe, expect, it, vi } from 'vitest';

import { PRODUCTION_HOSTNAME } from './buildTarget';
import { resolveEntry } from './entryGate';

const APP_MODULE = { default: 'ironlog-app' };
const TEST_HOST = 'ironlog-test.github.io';

const load = () => vi.fn(async () => APP_MODULE);

describe('resolveEntry — blocked hostnames', () => {
  it('never loads the application on a foreign hostname', async () => {
    const loader = load();
    const result = await resolveEntry('evil.example.com', 'production', loader);

    expect(loader).not.toHaveBeenCalled();
    expect(result.module).toBeNull();
    expect(result.error).toBeNull();
    expect(result.decision.allowed).toBe(false);
  });

  it('never loads the application for the test build while no test host is set', async () => {
    // Fail-closed configuration: with an empty test hostname only local addresses run.
    const loader = load();
    const result = await resolveEntry('ironlog-test.github.io', 'test', loader, {
      testHostname: '',
    });

    expect(loader).not.toHaveBeenCalled();
    expect(result.decision.allowed).toBe(false);
  });

  it('never loads the application when the hostname is empty', async () => {
    const loader = load();
    const result = await resolveEntry('', 'production', loader);

    expect(loader).not.toHaveBeenCalled();
    expect(result.decision.allowed).toBe(false);
  });

  it('never loads the application on a hostname that only looks similar', async () => {
    const loader = load();
    const result = await resolveEntry('tmksdm.github.io.evil.com', 'production', loader);

    expect(loader).not.toHaveBeenCalled();
    expect(result.decision.allowed).toBe(false);
  });
});

describe('resolveEntry — allowed hostnames', () => {
  it('loads the application once on the production hostname', async () => {
    const loader = load();
    const result = await resolveEntry(PRODUCTION_HOSTNAME, 'production', loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.module).toBe(APP_MODULE);
    expect(result.error).toBeNull();
  });

  it('loads the application on localhost for both builds (Android WebView)', async () => {
    for (const kind of ['production', 'test'] as const) {
      for (const hostname of ['localhost', '127.0.0.1', '[::1]', '192.168.1.40']) {
        const loader = load();
        const result = await resolveEntry(hostname, kind, loader);
        expect(loader, `${kind} / ${hostname}`).toHaveBeenCalledTimes(1);
        expect(result.module, `${kind} / ${hostname}`).toBe(APP_MODULE);
      }
    }
  });

  it('loads the application on the approved test hostname', async () => {
    const loader = load();
    const result = await resolveEntry(TEST_HOST, 'test', loader, { testHostname: TEST_HOST });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.module).toBe(APP_MODULE);
  });

  it('still refuses the test hostname for the production build', async () => {
    const loader = load();
    const result = await resolveEntry(TEST_HOST, 'production', loader, {
      testHostname: TEST_HOST,
    });

    expect(loader).not.toHaveBeenCalled();
    expect(result.decision.allowed).toBe(false);
  });
});

describe('resolveEntry — failures', () => {
  it('returns the import failure instead of throwing', async () => {
    const failure = new Error('chunk load failed');
    const loader = vi.fn(async () => {
      throw failure;
    });

    const result = await resolveEntry(PRODUCTION_HOSTNAME, 'production', loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.module).toBeNull();
    expect(result.error).toBe(failure);
    expect(result.decision.allowed).toBe(true);
  });

  it('resolves for a blocked host without ever touching the loader', async () => {
    const loader = vi.fn(async () => {
      throw new Error('must not be called');
    });

    await expect(resolveEntry('evil.example.com', 'production', loader)).resolves.toMatchObject({
      module: null,
      error: null,
    });
    expect(loader).not.toHaveBeenCalled();
  });
});
