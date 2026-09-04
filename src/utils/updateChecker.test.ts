import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateWaitingServiceWorker, checkForUpdate } from './updateChecker';

describe('checkForUpdate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
