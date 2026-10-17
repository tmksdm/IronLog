// src/utils/runningProgram.test.ts
//
// Treadmill progression is a segment model: 7x400 m + 1x200 m, where the
// segments from the end may run one km/h faster (progressing) or one km/h
// slower (regressing) than the rest of the distance.
//
// The documented transitions are pinned here, together with the property that
// matters most in practice: deleting the last run must restore the exact state
// the program had before that run.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyRunResult,
  buildRunPlan,
  getNextState,
  getPreviousState,
  initRunningProgram,
  loadRunningProgram,
  reverseRunResult,
  type RunningProgramState,
} from './runningProgram';

// ---- localStorage stub (the module persists through it) ----

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
    new MemoryStorage();
});

// ---- Helpers ----

/** Uniform state: the whole distance at one speed. */
const uniform = (speed: number): RunningProgramState => ({
  mainSpeed: speed,
  endSpeed: null,
  endSegments: 0,
});

/** 3000 m at 12 km/h + the last `count` segments at `end` km/h. */
const withEnd = (
  main: number,
  end: number,
  count: number
): RunningProgramState => ({
  mainSpeed: main,
  endSpeed: end,
  endSegments: count,
});

/** "2800@12 + 200@13", or "3000@12" when uniform. */
const plan = (state: RunningProgramState): string =>
  buildRunPlan(state)
    .map((segment) => `${segment.distanceM}@${segment.speedKmh}`)
    .join(' + ');

// ---- Required transitions ----

describe('running program — success', () => {
  it('turns 3000 at 12 into 2800 at 12 plus 200 at 13', () => {
    const next = getNextState(uniform(12), true);
    expect(plan(next)).toBe('2800@12 + 200@13');
  });

  it('adds one more fast segment on every further success', () => {
    expect(plan(withEnd(12, 13, 2))).toBe('2400@12 + 600@13');
    expect(plan(getNextState(withEnd(12, 13, 2), true))).toBe('2000@12 + 1000@13');
  });

  it('promotes to the whole distance at the higher speed', () => {
    expect(plan(getNextState(withEnd(12, 13, 7), true))).toBe('3000@13');
  });

  it('keeps promoting through whole speeds without an upper limit', () => {
    let state = uniform(12);
    // Eight successes fill the distance with 13 km/h segments and promote.
    for (let i = 0; i < 8; i += 1) state = getNextState(state, true);
    expect(plan(state)).toBe('3000@13');

    // The next success starts a new cycle one km/h higher.
    state = getNextState(state, true);
    expect(plan(state)).toBe('2800@13 + 200@14');

    for (let i = 0; i < 7; i += 1) state = getNextState(state, true);
    expect(plan(state)).toBe('3000@14');

    state = getNextState(state, true);
    expect(plan(state)).toBe('2800@14 + 200@15');
  });
});

describe('running program — failure', () => {
  it('turns 2400 at 12 plus 600 at 13 into 2800 at 12 plus 200 at 13', () => {
    const next = getNextState(withEnd(12, 13, 2), false);
    expect(plan(next)).toBe('2800@12 + 200@13');
  });

  it('drops the last 200 m to a slower speed when failing at a uniform speed', () => {
    const next = getNextState(uniform(13), false);
    expect(plan(next)).toBe('2800@13 + 200@12');
  });

  it('widens the slow tail on repeated failures and then demotes', () => {
    let state = getNextState(uniform(13), false);
    expect(plan(state)).toBe('2800@13 + 200@12');

    state = getNextState(state, false);
    expect(plan(state)).toBe('2400@13 + 600@12');

    for (let i = 0; i < 6; i += 1) state = getNextState(state, false);
    expect(plan(state)).toBe('3000@12');
  });

  it('drops below zero-speed only in steps, never skipping a whole level', () => {
    let state = uniform(12);
    for (let i = 0; i < 8; i += 1) state = getNextState(state, false);
    expect(plan(state)).toBe('3000@11');
  });
});

// ---- Rollback after deleting the last record ----

describe('running program — rollback', () => {
  it('restores the state that existed before the last successful run', () => {
    initRunningProgram(12);

    // Eight successes promote 12 -> 13; deleting the last one must undo exactly.
    for (let i = 0; i < 8; i += 1) applyRunResult(true);
    expect(plan(loadRunningProgram()!)).toBe('3000@13');

    reverseRunResult(true);
    expect(plan(loadRunningProgram()!)).toBe('400@12 + 2600@13');
  });

  it('restores a uniform state that came from removing the last slow segment', () => {
    initRunningProgram(13);
    expect(plan(loadRunningProgram()!)).toBe('3000@13');

    // Fail once: 2800@13 + 200@12.
    applyRunResult(false);
    expect(plan(loadRunningProgram()!)).toBe('2800@13 + 200@12');

    // Succeed: back to uniform 13.
    applyRunResult(true);
    expect(plan(loadRunningProgram()!)).toBe('3000@13');

    // The last record is that success, so deleting it must bring the slow tail back.
    reverseRunResult(true);
    expect(plan(loadRunningProgram()!)).toBe('2800@13 + 200@12');
  });

  it('restores a uniform state that came from demoting', () => {
    initRunningProgram(12);
    for (let i = 0; i < 8; i += 1) applyRunResult(false);
    expect(plan(loadRunningProgram()!)).toBe('3000@11');

    reverseRunResult(false);
    expect(plan(loadRunningProgram()!)).toBe('400@12 + 2600@11');
  });
});

describe('running program — round trip', () => {
  it('undoes any single reachable transition', () => {
    const seen = new Map<string, RunningProgramState>();
    const queue: RunningProgramState[] = [uniform(12)];
    const key = (s: RunningProgramState) =>
      `${s.mainSpeed}|${s.endSpeed ?? '-'}|${s.endSegments}`;
    seen.set(key(queue[0]!), queue[0]!);

    for (let depth = 0; depth < 12 && queue.length > 0; depth += 1) {
      const next: RunningProgramState[] = [];
      for (const state of queue) {
        for (const succeeded of [true, false]) {
          const child = getNextState(state, succeeded);
          const previous = getPreviousState(child, succeeded);
          expect(
            key(previous),
            `undo ${succeeded ? 'success' : 'failure'} from ${key(child)} (was ${key(state)})`
          ).toBe(key(state));
          if (!seen.has(key(child))) {
            seen.set(key(child), child);
            next.push(child);
          }
        }
      }
      queue.length = 0;
      queue.push(...next);
    }
  });
});
