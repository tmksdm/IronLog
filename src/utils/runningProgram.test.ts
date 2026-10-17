// src/utils/runningProgram.test.ts
//
// Treadmill progression is a segment model: 7x400 m + 1x200 m. Success raises the
// load from the END of the distance (200 m first, because the last segment is
// short), failure lowers it from the START (400 m per step — a step may end up
// taking the remaining 200 m). The opposite change only starts once the speed is
// uniform again.
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

/**
 * `count` segments at `end` over the rest of the distance at `main`: the last
 * ones when `end` is higher, the first ones when it is lower.
 */
const withEnd = (
  main: number,
  end: number,
  count: number
): RunningProgramState => ({
  mainSpeed: main,
  endSpeed: end,
  endSegments: count,
});

/** Raised load: the last `count` segments one km/h faster. */
const raised = (main: number, count: number): RunningProgramState =>
  withEnd(main, main + 1, count);

/** Lowered load: the first `count` segments one km/h slower. */
const lowered = (main: number, count: number): RunningProgramState =>
  withEnd(main, main - 1, count);

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
    const next = getNextState(raised(12, 2), false);
    expect(plan(next)).toBe('2800@12 + 200@13');
  });

  it('lowers the load from the start when failing at a uniform speed', () => {
    const next = getNextState(uniform(13), false);
    expect(plan(next)).toBe('400@12 + 2600@13');
  });

  it('widens the lowered start on repeated failures and then demotes', () => {
    let state = getNextState(uniform(13), false);
    expect(plan(state)).toBe('400@12 + 2600@13');

    state = getNextState(state, false);
    expect(plan(state)).toBe('800@12 + 2200@13');

    for (let i = 0; i < 6; i += 1) state = getNextState(state, false);
    expect(plan(state)).toBe('3000@12');
  });

  it('keeps stepping down whole speeds, never skipping a level', () => {
    let state = uniform(12);
    for (let i = 0; i < 8; i += 1) state = getNextState(state, false);
    expect(plan(state)).toBe('3000@11');
  });
});

// ---- The approved load changes, step by step ----

describe('running program — approved load changes', () => {
  it('raises from the end: 200 m, then 400 m per step', () => {
    let state = uniform(12);
    state = getNextState(state, true);
    expect(plan(state)).toBe('2800@12 + 200@13');
    state = getNextState(state, true);
    expect(plan(state)).toBe('2400@12 + 600@13');
    state = getNextState(state, true);
    expect(plan(state)).toBe('2000@12 + 1000@13');
  });

  it('lowers from the start: 400 m per step', () => {
    let state = uniform(12);
    state = getNextState(state, false);
    expect(plan(state)).toBe('400@11 + 2600@12');
    state = getNextState(state, false);
    expect(plan(state)).toBe('800@11 + 2200@12');
  });

  it('cancels a lowering before raising anything', () => {
    let state = lowered(12, 2);
    expect(plan(state)).toBe('800@11 + 2200@12');
    state = getNextState(state, true);
    expect(plan(state)).toBe('400@11 + 2600@12');
    state = getNextState(state, true);
    expect(plan(state)).toBe('3000@12');

    // Only now does a success raise the load.
    expect(plan(getNextState(state, true))).toBe('2800@12 + 200@13');
  });

  it('cancels a raise before lowering anything', () => {
    let state = raised(12, 2);
    expect(plan(state)).toBe('2400@12 + 600@13');
    state = getNextState(state, false);
    expect(plan(state)).toBe('2800@12 + 200@13');
    state = getNextState(state, false);
    expect(plan(state)).toBe('3000@12');

    // Only now does a failure lower the load.
    expect(plan(getNextState(state, false))).toBe('400@11 + 2600@12');
  });

  it('spends the remaining 200 m on the last step down to a uniform speed', () => {
    expect(plan(lowered(12, 7))).toBe('2800@11 + 200@12');
    expect(plan(getNextState(lowered(12, 7), false))).toBe('3000@11');
  });

  it('starts the next whole speed after a promotion', () => {
    let state = uniform(12);
    for (let i = 0; i < 8; i += 1) state = getNextState(state, true);
    expect(plan(state)).toBe('3000@13');

    const next = getNextState(state, true);
    expect(plan(next)).toBe('2800@13 + 200@14');
  });
});

// ---- Existing saves and JSON backups ----

describe('running program — saved states', () => {
  it('reads a lowered step saved by an older build from the start of the distance', () => {
    // Older builds stored the lowered part at the end of the distance, which put
    // the slow 200 m last. The fields are unchanged; only the reading differs.
    localStorage.setItem(
      'ironlog_running_program',
      JSON.stringify({ mainSpeed: 13, endSpeed: 12, endSegments: 1 })
    );

    expect(plan(loadRunningProgram()!)).toBe('400@12 + 2600@13');
    expect(plan(getNextState(loadRunningProgram()!, true))).toBe('3000@13');
  });

  it('undoes a stored result that has no recorded predecessor', () => {
    // Files written before the predecessor was recorded: the rollback falls back
    // to the state model, which must stay exact for the transitions it produced.
    localStorage.setItem(
      'ironlog_running_program',
      JSON.stringify({ mainSpeed: 11, endSpeed: null, endSegments: 0 })
    );

    const previous = getPreviousState(loadRunningProgram()!, false);
    expect(plan(previous)).toBe('2800@11 + 200@12');
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

  it('restores a uniform state that came from removing the last lowered step', () => {
    initRunningProgram(13);
    expect(plan(loadRunningProgram()!)).toBe('3000@13');

    // Fail once: the first 400 m drop to 12.
    applyRunResult(false);
    expect(plan(loadRunningProgram()!)).toBe('400@12 + 2600@13');

    // Succeed: back to uniform 13.
    applyRunResult(true);
    expect(plan(loadRunningProgram()!)).toBe('3000@13');

    // The last record is that success, so deleting it must bring the lowered
    // start back.
    reverseRunResult(true);
    expect(plan(loadRunningProgram()!)).toBe('400@12 + 2600@13');
  });

  it('restores a uniform state that came from demoting', () => {
    initRunningProgram(12);
    for (let i = 0; i < 8; i += 1) applyRunResult(false);
    expect(plan(loadRunningProgram()!)).toBe('3000@11');

    reverseRunResult(false);
    expect(plan(loadRunningProgram()!)).toBe('2800@11 + 200@12');
  });
});

describe('running program — plan invariants', () => {
  /** One speed, or two adjacent speeds with the slower part first. */
  const expectValidPlan = (state: RunningProgramState, where: string): void => {
    const segments = buildRunPlan(state);
    const speeds = [...new Set(segments.map((segment) => segment.speedKmh))];

    expect(
      segments.reduce((sum, segment) => sum + segment.distanceM, 0),
      `${where}: the plan covers the whole distance`
    ).toBe(3000);
    expect(speeds.length, `${where}: at most two speeds in one plan`).toBeLessThanOrEqual(2);

    if (speeds.length === 2) {
      expect(
        Math.abs(speeds[0]! - speeds[1]!),
        `${where}: the two speeds are adjacent`
      ).toBe(1);
      const slower = Math.min(...speeds);
      expect(
        segments.findIndex((segment) => segment.speedKmh === slower),
        `${where}: the slower part comes first`
      ).toBe(0);
    }
  };

  it('holds for every state the progression can reach', () => {
    const seen = new Set<string>();
    const queue: RunningProgramState[] = [uniform(12)];
    seen.add('12|-|0');

    for (let depth = 0; depth < 16 && queue.length > 0; depth += 1) {
      const next: RunningProgramState[] = [];
      for (const state of queue) {
        expectValidPlan(state, `depth ${depth}`);
        for (const succeeded of [true, false]) {
          const child = getNextState(state, succeeded);
          const key = `${child.mainSpeed}|${child.endSpeed ?? '-'}|${child.endSegments}`;
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(child);
        }
      }
      queue.length = 0;
      queue.push(...next);
    }
  });

  it('holds after deleting the last record', () => {
    initRunningProgram(12);
    for (let i = 0; i < 9; i += 1) applyRunResult(true);
    expectValidPlan(loadRunningProgram()!, 'before the rollback');

    reverseRunResult(true);
    expectValidPlan(loadRunningProgram()!, 'after the rollback');
  });

  it('holds for a state read from a backup', () => {
    localStorage.setItem(
      'ironlog_running_program',
      JSON.stringify({ mainSpeed: 12, endSpeed: 11, endSegments: 5, previous: null })
    );
    expectValidPlan(loadRunningProgram()!, 'restored lowering');

    localStorage.setItem(
      'ironlog_running_program',
      JSON.stringify({ mainSpeed: 12, endSpeed: 13, endSegments: 7, previous: null })
    );
    expectValidPlan(loadRunningProgram()!, 'restored raise');
  });

  it('refuses to show a third speed from a foreign or damaged state', () => {
    // Such a state cannot be produced by the program, and a plan like
    // 11x800 + 12x1800 + 13x400 is exactly what must never appear.
    expect(plan(withEnd(12, 15, 4))).toBe('3000@12');
    expect(plan(withEnd(12, 10, 4))).toBe('3000@12');
    expect(plan(withEnd(12, 13, 0))).toBe('3000@12');
    expect(plan(withEnd(12, 13, -3))).toBe('3000@12');
    expect(plan(withEnd(12, 13, 99))).toBe('3000@13');
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
