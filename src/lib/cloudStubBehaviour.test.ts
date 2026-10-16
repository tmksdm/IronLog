// src/lib/cloudStubBehaviour.test.ts
//
// Behavioural spec of the test build stubs. Signature compatibility is checked
// statically in cloudStubContract.ts; what is left here is what types cannot
// state: the stubs must fail closed, must not talk to the network, and must keep
// the local application working.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLOUD_ENABLED,
  CLOUD_STUB_MARKER,
  SUPABASE_PROJECT_REF,
  supabase,
} from './supabase.disabled';
import * as sync from './sync.disabled';

/**
 * Raw text of every substituted module, read through Vite so the test needs no
 * filesystem access (the project's `types` do not include the Node ones).
 */
const STUB_SOURCES = {
  ...import.meta.glob('./*.disabled.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../components/settings/*.disabled.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
};

/** Every cloud entry point the test build must neutralise. */
const ALL_CLOUD_CALLS: Array<() => unknown> = [
  () => supabase.auth.getSession(),
  () => supabase.auth.onAuthStateChange(() => {}),
  () => supabase.auth.signInWithPassword({ email: 'owner@example.com', password: 'secret' }),
  () => supabase.auth.signOut(),
  () => sync.pushToCloud(),
  () => sync.pullFromCloud(),
  () => sync.queueCloudDeletion('session', 'session-1'),
  () => sync.flushPendingCloudDeletions(),
  () => sync.deleteSessionFromCloud('session-1'),
  () => sync.deleteExerciseFromCloud('exercise-1'),
  () => sync.deleteAllSessionsFromCloud(),
  () => sync.deleteMultipleSessionsFromCloud(['session-1', 'session-2']),
  () => sync.deleteCardioLogFromCloud('cardio-1'),
  () => sync.deletePullupLogsFromCloud(['pullup-1']),
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('test build identity', () => {
  it('reports the cloud as disabled', () => {
    expect(CLOUD_ENABLED).toBe(false);
  });

  it('has no supabase project configured', () => {
    expect(SUPABASE_PROJECT_REF).toBe('');
  });

  it('keeps the marker the CI artifact check looks for', () => {
    expect(CLOUD_STUB_MARKER).toBe('ironlog-cloud-stub');
  });
});

describe('supabase stub fails closed', () => {
  it('throws on every table access instead of pretending the cloud is empty', () => {
    for (const table of ['exercises', 'workout_sessions', 'exercise_logs']) {
      expect(() => supabase.from(table), table).toThrow(CLOUD_STUB_MARKER);
    }
  });

  it('reports no session', async () => {
    const { data, error } = await supabase.auth.getSession();
    expect(data.session).toBeNull();
    expect(error).toBeNull();
  });

  it('refuses to sign in', async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: 'owner@example.com',
      password: 'secret',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(CLOUD_STUB_MARKER);

    const { data } = await supabase.auth.getSession();
    expect(data.session).toBeNull();
  });

  it('never delivers an auth event, so nothing can look signed in', () => {
    const listener = vi.fn();
    const { data } = supabase.auth.onAuthStateChange(listener);
    expect(data.subscription.unsubscribe).toBeTypeOf('function');
    data.subscription.unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('signs out without an error', async () => {
    await expect(supabase.auth.signOut()).resolves.toEqual({ error: null });
  });

  it('never signs out to a real provider', () => {
    // A sign-out that tried to reach Supabase would need the SDK, which the stub
    // does not import — the static check below covers that separately.
    expect(() => supabase.auth.signOut()).not.toThrow();
  });
});

describe('sync stub keeps the local application working', () => {
  it('resolves every operation instead of rejecting', async () => {
    const results = await Promise.all(ALL_CLOUD_CALLS.map((call) => Promise.resolve(call())));
    expect(results).toHaveLength(ALL_CLOUD_CALLS.length);
  });

  it('never reports cloud data', async () => {
    await expect(sync.pullFromCloud()).resolves.toBe(false);
    await expect(sync.flushPendingCloudDeletions()).resolves.toBe(0);
  });

  it('accepts every deletion type without queueing anything remotely', async () => {
    const types = [
      'session',
      'all_sessions',
      'exercise',
      'cardio_log',
      'pullup_log',
    ] as const;
    for (const type of types) {
      await expect(sync.queueCloudDeletion(type, 'id-1'), type).resolves.toBeUndefined();
    }
  });
});

describe('stubs never touch the network', () => {
  it('makes no fetch or XMLHttpRequest call', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('сеть недоступна в тестовой сборке');
    });
    const xhrSpy = vi.fn(() => {
      throw new Error('сеть недоступна в тестовой сборке');
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('XMLHttpRequest', xhrSpy);

    for (const call of ALL_CLOUD_CALLS) {
      try {
        await Promise.resolve(call());
      } catch {
        // `supabase.from` is meant to throw; the point here is the network.
      }
    }
    expect(() => supabase.from('exercises')).toThrow();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('imports no SDK and carries no production credential', () => {
    const files = Object.entries(STUB_SOURCES);
    // A renamed or moved stub would otherwise leave this test asserting nothing.
    expect(files).toHaveLength(3);

    for (const [file, source] of files) {
      expect(source, `${file} imports the SDK`).not.toContain('@supabase');
      expect(source, `${file} embeds a supabase URL`).not.toContain('.supabase.co');
      expect(source, `${file} embeds a JWT`).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
      expect(source, `${file} reaches the network`).not.toMatch(
        /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/
      );
    }
  });
});
