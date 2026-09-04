import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate } from './updateChecker';

describe('checkForUpdate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the version and release notes for a newer release', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            version: '9.0.0',
            changes: ['Первое изменение', '', 42, 'Второе изменение'],
          }),
      })
    );

    await expect(checkForUpdate()).resolves.toEqual({
      available: true,
      remoteVersion: '9.0.0',
      changes: ['Первое изменение', 'Второе изменение'],
    });
  });

  it('does not offer the installed version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '0.25.0', changes: ['Без изменений'] }),
      })
    );

    await expect(checkForUpdate()).resolves.toEqual({ available: false });
  });

  it('silently ignores an unavailable network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(checkForUpdate()).resolves.toEqual({ available: false });
  });
});
