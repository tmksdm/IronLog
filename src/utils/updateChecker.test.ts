import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateWaitingServiceWorker, checkForUpdate } from './updateChecker';
import { APP_VERSION } from '../version';

describe('checkForUpdate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns the version and release notes for a newer release', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        version: '9.0.0',
        changes: ['Первое изменение', '', 42, 'Второе изменение'],
      }),
    }));

    await expect(checkForUpdate()).resolves.toEqual({
      available: true,
      remoteVersion: '9.0.0',
      changes: ['Первое изменение', 'Второе изменение'],
    });
  });

  it('does not offer the installed version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '0.26.1', changes: ['Без изменений'] }),
    }));

    await expect(checkForUpdate()).resolves.toEqual({ available: false });
  });

  it('offers a republished build of the installed version', async () => {
    vi.stubEnv('VITE_BUILD_ID', 'local-aaa');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: APP_VERSION, buildId: 'local-bbb', changes: [] }),
    }));

    await expect(checkForUpdate()).resolves.toEqual({
      available: true,
      remoteVersion: APP_VERSION,
      changes: [],
    });
  });

  it('does not offer the build that is already installed', async () => {
    vi.stubEnv('VITE_BUILD_ID', 'local-aaa');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: APP_VERSION, buildId: 'local-aaa', changes: [] }),
    }));

    await expect(checkForUpdate()).resolves.toEqual({ available: false });
  });

  it('ignores a build id while the installed bundle has none', async () => {
    vi.stubEnv('VITE_BUILD_ID', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: APP_VERSION, buildId: 'local-bbb', changes: [] }),
    }));

    await expect(checkForUpdate()).resolves.toEqual({ available: false });
  });

  it('silently ignores an unavailable network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(checkForUpdate()).resolves.toEqual({ available: false });
  });

  it('reloads only after the staged worker takes control', () => {
    const postMessage = vi.fn();
    const reload = vi.fn();
    let controllerChange: (() => void) | undefined;
    const unsubscribe = vi.fn();

    activateWaitingServiceWorker(
      { postMessage },
      (listener) => {
        controllerChange = listener;
        return unsubscribe;
      },
      reload
    );

    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    controllerChange?.();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });
});
