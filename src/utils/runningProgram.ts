// src/utils/runningProgram.ts

/**
 * Running program progression/regression logic.
 *
 * Distance: 3 km = 7 laps of 400 m + a final 200 m segment.
 *
 * State:
 *   mainSpeed   — speed of the distance as long as nothing is modified
 *   endSpeed    — the other speed: mainSpeed + 1 (raised) or mainSpeed - 1 (lowered)
 *   endSegments — how many segments run at endSpeed; 0 means uniform
 *
 * Approved rules:
 *   - success raises the load from the end of the distance;
 *   - failure lowers it from the start;
 *   - success first cancels a lowering and failure first cancels a raise, so the
 *     change only starts in the other direction once the speed is uniform again;
 *   - the speed has no ceiling.
 *
 * Geometry: the last segment is only 200 m, so a raise covers 200 m first and
 * 400 m per step afterwards (200, 600, 1000, … 2600 m at the end), while a
 * lowering covers 400 m per step (400, 800, … 2800 m at the start). The last
 * step to a uniform speed may take what remains of the distance.
 *
 * Plan invariants: a plan is either one speed or two adjacent speeds differing
 * by 1 km/h, the slower part first; three speeds never occur, and the pair of
 * speeds changes only through a uniform distance. These hold after a success, a
 * failure, deleting the last run and restoring a backup — buildRunPlan is the
 * only place that turns a state into a plan, and it refuses anything else.
 *
 * Transitions (see getNextState):
 *   success: uniform → raise 200 m; raised → one more step; eight steps →
 *            uniform at the higher speed; lowered → one step less; the last
 *            step → uniform at mainSpeed
 *   failure: the mirror image — uniform → lower 400 m; lowered → one more step;
 *            eight steps → uniform at the lower speed; raised → one step less
 */

// ---- Constants ----

/** Total distance in meters */
const TOTAL_DISTANCE = 3000;

/** Segment lengths from start to finish: 7×400m + 1×200m */
export const SEGMENTS = [400, 400, 400, 400, 400, 400, 400, 200] as const;

/** Number of segments */
const NUM_SEGMENTS = SEGMENTS.length; // 8

/** localStorage key */
const STORAGE_KEY = 'ironlog_running_program';

// ---- Types ----

export interface RunningProgramState {
  /** Speed of the distance as long as nothing is modified (km/h) */
  mainSpeed: number;
  /**
   * The speed of the modified part: mainSpeed + 1 when the load was raised,
   * mainSpeed - 1 when it was lowered, null when the distance is uniform.
   */
  endSpeed: number | null;
  /**
   * How many segments run at endSpeed: the last ones for a raise, the first ones
   * for a lowering. 0 means the whole distance runs at mainSpeed.
   */
  endSegments: number;
  /**
   * The state this one was produced from, recorded so that deleting the last
   * run restores it exactly. A uniform state can be reached from two different
   * states (a promotion and the removal of the last lowered step), so the
   * previous state cannot be derived from the current one alone.
   */
  previous?: RunningProgramStateSnapshot | null;
}

/** A state without its own rollback snapshot — the stored depth stays bounded. */
export interface RunningProgramStateSnapshot {
  mainSpeed: number;
  endSpeed: number | null;
  endSegments: number;
}

/** Copies the three fields of a state, dropping the rollback snapshot. */
function snapshotOf(state: RunningProgramState): RunningProgramStateSnapshot {
  return {
    mainSpeed: state.mainSpeed,
    endSpeed: state.endSpeed,
    endSegments: state.endSegments,
  };
}

/** Reads a snapshot from persisted JSON, returning null when it is unusable. */
function snapshotFrom(value: unknown): RunningProgramStateSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<RunningProgramStateSnapshot>;
  if (typeof raw.mainSpeed !== 'number') return null;
  return {
    mainSpeed: raw.mainSpeed,
    endSpeed: raw.endSpeed ?? null,
    endSegments: raw.endSegments ?? 0,
  };
}

export interface RunSegment {
  distanceM: number;
  speedKmh: number;
}

// ---- Core logic ----

/**
 * Build the run plan (list of segments with speeds) from the program state.
 * Returns 1 or 2 segments (grouped by speed).
 *
 * A plan is either the whole distance at one speed or two adjacent speeds, the
 * slower part first — the progression can never produce anything else. A stored
 * state that does not describe that (a hand-edited value, a foreign or damaged
 * backup) runs uniformly instead of showing a plan the program would never plan.
 */
export function buildRunPlan(state: RunningProgramState): RunSegment[] {
  const { mainSpeed, endSpeed, endSegments } = state;

  const isModified =
    endSpeed !== null &&
    endSegments >= 1 &&
    Math.abs(endSpeed - mainSpeed) === 1;

  if (!isModified) {
    return [{ distanceM: TOTAL_DISTANCE, speedKmh: mainSpeed }];
  }

  // A raise (endSpeed above mainSpeed) covers the END of the distance and
  // starts with the short 200 m segment; a lowering covers the START of it.
  const isRaise = endSpeed > mainSpeed;
  const count = Math.min(endSegments, NUM_SEGMENTS);
  const changedDistance = (isRaise
    ? SEGMENTS.slice(NUM_SEGMENTS - count)
    : SEGMENTS.slice(0, count)
  ).reduce((sum, segment) => sum + segment, 0);

  if (changedDistance >= TOTAL_DISTANCE) {
    // The modification covers everything: uniform at the modified speed.
    return [{ distanceM: TOTAL_DISTANCE, speedKmh: endSpeed }];
  }

  const restDistance = TOTAL_DISTANCE - changedDistance;
  const rest: RunSegment = { distanceM: restDistance, speedKmh: mainSpeed };
  const changed: RunSegment = { distanceM: changedDistance, speedKmh: endSpeed };

  return isRaise ? [rest, changed] : [changed, rest];
}

/**
 * Calculate the next program state after a run result.
 *
 * SUCCESS:
 *   - uniform (endSegments = 0): start raising the load — one raised segment at
 *     the end of the distance, which is the short 200 m one;
 *   - raised: one more segment joins the raised part; when all eight are raised,
 *     the whole distance runs at the higher speed (mainSpeed becomes endSpeed);
 *   - lowered: one step of the lowering is cancelled; when the last step goes,
 *     the speed is uniform again.
 *
 * FAILURE:
 *   - uniform: start lowering the load — one lowered segment at the start of the
 *     distance (a full 400 m);
 *   - lowered: one more segment joins the lowered part; when all eight are
 *     lowered, the whole distance runs at the lower speed;
 *   - raised: one step of the raise is cancelled; when the last step goes, the
 *     speed is uniform again.
 */
export function getNextState(
  current: RunningProgramState,
  succeeded: boolean
): RunningProgramState {
  return {
    ...computeNextState(current, succeeded),
    previous: snapshotOf(current),
  };
}

/** Pure transition; `getNextState` records the rollback snapshot on top of it. */
function computeNextState(
  current: RunningProgramState,
  succeeded: boolean
): RunningProgramState {
  const { mainSpeed, endSpeed, endSegments } = current;

  if (succeeded) {
    // SUCCESS
    if (endSegments === 0) {
      // Uniform → start adding faster end
      return {
        mainSpeed,
        endSpeed: mainSpeed + 1,
        endSegments: 1,
      };
    }

    if (endSpeed !== null && endSpeed > mainSpeed) {
      // End is faster → add more fast segments
      if (endSegments + 1 >= NUM_SEGMENTS) {
        // All segments now at higher speed → promote
        return {
          mainSpeed: endSpeed,
          endSpeed: null,
          endSegments: 0,
        };
      }
      return {
        mainSpeed,
        endSpeed,
        endSegments: endSegments + 1,
      };
    }

    if (endSpeed !== null && endSpeed < mainSpeed) {
      // End is slower (regression recovery) → remove slow segments
      if (endSegments - 1 <= 0) {
        // All slow removed → back to uniform
        return {
          mainSpeed,
          endSpeed: null,
          endSegments: 0,
        };
      }
      return {
        mainSpeed,
        endSpeed,
        endSegments: endSegments - 1,
      };
    }

    // Fallback (shouldn't reach here)
    return current;
  } else {
    // FAILURE
    if (endSegments === 0) {
      // Uniform → start adding slower end
      return {
        mainSpeed,
        endSpeed: mainSpeed - 1,
        endSegments: 1,
      };
    }

    if (endSpeed !== null && endSpeed < mainSpeed) {
      // End is slower → add more slow segments
      if (endSegments + 1 >= NUM_SEGMENTS) {
        // All segments now at lower speed → demote
        return {
          mainSpeed: endSpeed,
          endSpeed: null,
          endSegments: 0,
        };
      }
      return {
        mainSpeed,
        endSpeed,
        endSegments: endSegments + 1,
      };
    }

    if (endSpeed !== null && endSpeed > mainSpeed) {
      // End is faster (was progressing) → remove fast segments
      if (endSegments - 1 <= 0) {
        // All fast removed → back to uniform
        return {
          mainSpeed,
          endSpeed: null,
          endSegments: 0,
        };
      }
      return {
        mainSpeed,
        endSpeed,
        endSegments: endSegments - 1,
      };
    }

    // Fallback
    return current;
  }
}

// ---- Persistence ----

/**
 * Load the running program state from localStorage.
 * Returns null if not yet configured.
 */
export function loadRunningProgram(): RunningProgramState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.mainSpeed !== 'number') return null;
    return {
      mainSpeed: parsed.mainSpeed,
      endSpeed: parsed.endSpeed ?? null,
      endSegments: parsed.endSegments ?? 0,
      previous: snapshotFrom(parsed.previous),
    };
  } catch {
    return null;
  }
}

/**
 * Save the running program state to localStorage.
 */
export function saveRunningProgram(state: RunningProgramState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Initialize the running program with a starting speed.
 */
export function initRunningProgram(startSpeed: number): RunningProgramState {
  const state: RunningProgramState = {
    mainSpeed: startSpeed,
    endSpeed: null,
    endSegments: 0,
    previous: null,
  };
  saveRunningProgram(state);
  return state;
}

/**
 * Apply a run result and save the new state.
 */
export function applyRunResult(succeeded: boolean): RunningProgramState | null {
  const current = loadRunningProgram();
  if (!current) return null;
  const next = getNextState(current, succeeded);
  saveRunningProgram(next);
  return next;
}

/**
 * Update the program state directly (for manual editing).
 */
export function updateRunningProgram(
  updates: Partial<RunningProgramState>
): RunningProgramState | null {
  const current = loadRunningProgram();
  if (!current) return null;
  // A manual edit invalidates the recorded predecessor: undoing a deleted run
  // on top of hand-edited state would restore a state the user never had.
  const updated = { ...current, ...updates, previous: null };
  saveRunningProgram(updated);
  return updated;
}

/**
 * Format a run plan as a human-readable string.
 * E.g. "2400 м → 12 км/ч, 600 м → 13 км/ч"
 * Or "3000 м → 12 км/ч" for uniform.
 */
export function formatRunPlan(state: RunningProgramState): string {
  const plan = buildRunPlan(state);
  return plan
    .map((seg) => `${seg.distanceM} м → ${seg.speedKmh} км/ч`)
    .join(', ');
}



/**
 * Reverse the effect of a run result on the program state.
 * This is the inverse of getNextState().
 * Used when deleting the last workout to undo progression.
 */
export function reverseRunResult(succeeded: boolean): RunningProgramState | null {
  const current = loadRunningProgram();
  if (!current) return null;
  const prev = getPreviousState(current, succeeded);
  saveRunningProgram(prev);
  return prev;
}

/**
 * Calculate the previous program state (inverse of getNextState).
 *
 * If succeeded was true, we need to undo a success:
 *   - If uniform now → was all at endSpeed that got promoted → restore: mainSpeed-1, endSpeed=mainSpeed, endSegments=8-1=7... no.
 *     Actually: if uniform at X, and last action was success that promoted,
 *     then before promotion state was: mainSpeed=X-1, endSpeed=X, endSegments=7 (about to become 8→promote).
 *     Wait, endSegments=8 triggers promotion. So previous was endSegments=NUM_SEGMENTS-1=7, endSpeed=X, mainSpeed=X-1.
 *     But actually when endSegments reaches 8 it becomes uniform. So the step before was endSegments=7.
 *     Actually the promotion happens when endSegments+1 >= NUM_SEGMENTS. So previous had endSegments = NUM_SEGMENTS - 1.
 *
 *   - If end is faster (endSpeed > mainSpeed) → last success added one fast segment → endSegments - 1
 *     If endSegments would become 0 → was uniform, success started adding → mainSpeed same, endSpeed=null, endSegments=0
 *
 *   - If end is slower (endSpeed < mainSpeed) → last success removed one slow segment → endSegments + 1
 *     But endSegments+1 might exceed 7... Let's cap at NUM_SEGMENTS-1 since 8 would have demoted.
 *
 * If succeeded was false, we need to undo a failure (symmetric logic).
 */
export function getPreviousState(
  current: RunningProgramState,
  succeeded: boolean
): RunningProgramState {
  // Exact when the state remembers where it came from. The reasoning below only
  // has the current state to work with, and a uniform state can be reached from
  // two different states, so it has to guess between them.
  if (current.previous) {
    return { ...current.previous, previous: null };
  }

  const { mainSpeed, endSpeed, endSegments } = current;

  if (succeeded) {
    // Undo a SUCCESS
    if (endSegments === 0) {
      // Uniform now. Two possibilities for how we got here via success:
      // 1. Was uniform at mainSpeed-1 with endSegments=NUM_SEGMENTS-1 at mainSpeed → promoted
      // 2. Was uniform at mainSpeed with endSpeed < mainSpeed, endSegments=1 → removed last slow segment
      // We can't know which one, but promotion (case 1) is more likely when
      // the previous success would have made endSegments reach NUM_SEGMENTS.
      // Heuristic: if mainSpeed > 1, assume promotion happened.
      if (endSpeed === null) {
        // Most likely: was progressing and all segments became fast → promoted
        return {
          mainSpeed: mainSpeed - 1,
          endSpeed: mainSpeed,
          endSegments: NUM_SEGMENTS - 1,
        };
      }
    }

    if (endSpeed !== null && endSpeed > mainSpeed) {
      // End is faster → last success added a fast segment → undo: remove one
      if (endSegments - 1 <= 0) {
        return { mainSpeed, endSpeed: null, endSegments: 0 };
      }
      return { mainSpeed, endSpeed, endSegments: endSegments - 1 };
    }

    if (endSpeed !== null && endSpeed < mainSpeed) {
      // End is slower → last success removed a slow segment → undo: add one back
      return { mainSpeed, endSpeed, endSegments: endSegments + 1 };
    }

    // Fallback: uniform with no endSpeed → undo promotion
    return {
      mainSpeed: mainSpeed - 1,
      endSpeed: mainSpeed,
      endSegments: NUM_SEGMENTS - 1,
    };
  } else {
    // Undo a FAILURE
    if (endSegments === 0) {
      // Uniform now. Via failure this means:
      // Was regressing and all segments became slow → demoted
      if (endSpeed === null) {
        return {
          mainSpeed: mainSpeed + 1,
          endSpeed: mainSpeed,
          endSegments: NUM_SEGMENTS - 1,
        };
      }
    }

    if (endSpeed !== null && endSpeed < mainSpeed) {
      // End is slower → last failure added a slow segment → undo: remove one
      if (endSegments - 1 <= 0) {
        return { mainSpeed, endSpeed: null, endSegments: 0 };
      }
      return { mainSpeed, endSpeed, endSegments: endSegments - 1 };
    }

    if (endSpeed !== null && endSpeed > mainSpeed) {
      // End is faster → last failure removed a fast segment → undo: add one back
      return { mainSpeed, endSpeed, endSegments: endSegments + 1 };
    }

    // Fallback: uniform with no endSpeed → undo demotion
    return {
      mainSpeed: mainSpeed + 1,
      endSpeed: mainSpeed,
      endSegments: NUM_SEGMENTS - 1,
    };
  }
}
