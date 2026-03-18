// src/utils/runningProgram.ts

/**
 * Running program progression/regression logic.
 *
 * Distance: 3 km = 7 laps of 400m + 1 final segment of 200m = 8 segments.
 * Segments are numbered 1..8 from start to finish.
 *
 * State is described by:
 *   baseSpeed  — the lower speed (km/h)
 *   highSegments — how many segments FROM THE END run at baseSpeed + 1
 *
 * When highSegments = 0: entire distance at baseSpeed.
 * When highSegments = 8: entire distance at baseSpeed (which was previously highSpeed).
 *
 * Progression (succeeded = true):
 *   highSegments < 8 → highSegments += 1
 *   highSegments = 8  → baseSpeed += 1, highSegments = 0
 *     (entire distance now at new baseSpeed, next success starts adding +1 from end again)
 *
 * Regression (succeeded = false):
 *   highSegments > 0 → highSegments -= 1
 *   highSegments = 0  → baseSpeed -= 1, highSegments = 8
 *     (entire distance was at baseSpeed, now drop down: full distance at baseSpeed-1...
 *      wait, that's wrong. Let me re-think.)
 *
 * Actually for regression when highSegments = 0 and user fails:
 *   They failed to run all 3km at baseSpeed. So next time we ease off:
 *   The LAST segment (200m) drops to baseSpeed - 1, rest stays at baseSpeed.
 *   That means: baseSpeed stays, but we introduce a SLOWER segment at the end.
 *   But our model only has "base" and "high" where high > base...
 *
 * Re-reading the user's description:
 *   "If entire distance was 13 km/h but couldn't do it, next time:
 *    2800m at 13, last 200m at 12."
 *
 * So when failing at uniform speed X:
 *   → 2800m at X, 200m at X-1.
 *   This means baseSpeed = X-1, highSegments = 7 (7 segments at X from... wait)
 *
 * No. Let me re-model. The segments from the END are the FASTER ones.
 * "2800m at 13, 200m at 12" — here 13 is the faster speed for 7 segments,
 * and 12 is the base for 1 segment (the last 200m).
 *
 * Wait, that contradicts "faster segments from the end". Let me re-read.
 *
 * The user said: "2800m at 13, last 200m at 12."
 * So the BEGINNING is fast (13) and the END is slow (12).
 * But in progression, the END segments get faster first.
 *
 * Hmm, this is actually: when you fail at uniform 13, you can't maintain it
 * for the full distance, so the last part (which is hardest when tired) drops.
 * The slow segment is at the END (where you're most tired).
 *
 * But in progression the pattern was:
 * "2400m at 12, last 600m at 13" — the END gets faster.
 *
 * These seem contradictory but they're not — it's the same model:
 *   base = lower speed, high = higher speed = base + 1
 *   highSegments = number of segments from the END at highSpeed
 *   Remaining segments (from the START) at baseSpeed
 *
 * Progression: 2400m@12 + 600m@13 → highSegments=8 means all@13
 * After success at all@13: baseSpeed becomes 13, highSegments=0 → all@13
 * Next success: highSegments=1 → 2800@13 + 200@14
 *
 * Regression at all@13 (base=13, high=14, highSegments=0):
 *   User says → 2800@13 + 200@12. That means last 200m is SLOWER.
 *   But in our model highSpeed > baseSpeed, and high segments are at the end...
 *
 * OK I need to flip the model:
 *   When highSegments > 0: the last highSegments segments are at highSpeed (= baseSpeed + 1)
 *   When failing at uniform speed and highSegments = 0:
 *     We need: baseSpeed - 1 for the last segment, baseSpeed for the rest
 *     → NEW base = baseSpeed - 1, NEW highSegments = 7
 *       (7 segments from end at (baseSpeed-1)+1 = baseSpeed, 1 segment at baseSpeed-1)
 *     Wait that gives: 1 segment at start = baseSpeed-1, 7 segments at end = baseSpeed
 *     That's: 200m at (baseSpeed-1), 2800m at baseSpeed.
 *     But user wants: 2800m at baseSpeed, 200m at (baseSpeed-1).
 *
 * The issue is that "high segments from the end" in progression means faster at end,
 * but in regression from uniform speed, the LAST part gets slower.
 *
 * Let me re-read the user's example more carefully:
 *
 * REGRESSION example:
 *   "All 3km at 13, failed → next: 2800m at 13, 200m at 12"
 *
 * Wait — is the 200m at 12 at the END or the BEGINNING?
 * Contextually, when you can't maintain speed, you slow down at the END.
 * So: first 2800m at 13, last 200m at 12.
 *
 * But in PROGRESSION:
 *   "All 3km at 12, success → next: first 2800m at 12, last 200m at 13"
 *
 * So in both cases, the change happens FROM THE END.
 * In progression: end segments get FASTER.
 * In regression from uniform: end segments get SLOWER.
 *
 * This means after failing at uniform 13:
 *   → first 2800m at 13, last 200m at 12
 *   If fail again → first 2400m at 13, last 600m at 12
 *   ...continuing to fail → eventually all at 12
 *   Then succeed → first 2800m at 12, last 200m at 13 (back to progression)
 *
 * So the model needs a DIRECTION concept:
 *   ascending: we're adding faster segments from the end (normal progression)
 *   descending: we're adding slower segments from the end (regression mode)
 *
 * Actually no, let me simplify. At any point the plan looks like:
 *   [startDistance @ speedA] + [endDistance @ speedB]
 * where speedB = speedA ± 1, OR the entire distance at one speed.
 *
 * Let me model it differently:
 *   lowSpeed: the slower speed
 *   highSpeed: lowSpeed + 1
 *   highSegmentsFromEnd: how many of the 8 segments (from the end) are at highSpeed
 *
 * Start at lowSpeed = 12, highSegments = 0 → all at 12.
 *
 * PROGRESSION (success):
 *   highSegments < 8 → highSegments += 1 (more fast segments from end)
 *   highSegments = 8 → all at highSpeed → lowSpeed = highSpeed, highSegments = 0
 *     Now all at new lowSpeed (=13). Next success → highSegments = 1 (200m at 14 from end)
 *
 * REGRESSION (failure):
 *   highSegments > 0 → highSegments -= 1 (fewer fast segments from end)
 *   highSegments = 0 → all at lowSpeed, but failed
 *     → need to go below: lowSpeed -= 1, highSegments = 7
 *     Now: 7 segments from end at lowSpeed+1 (= old lowSpeed), 1 segment at new lowSpeed
 *     That is: first 400m at (oldLow - 1), last 2600m at oldLow
 *     But user wants: first 2800m at oldLow, last 200m at (oldLow - 1)
 *
 * THIS DOESN'T MATCH. The user wants the slow segment at the END when regressing
 * past uniform speed, but our model puts the slow segment at the START.
 *
 * SOLUTION: I need TWO models or a state machine with phases.
 *
 * Let me think about this differently. The state is:
 *   speed1, speed2 (where speed2 = speed1 + 1 always)
 *   splitPoint: distance in meters where we switch from speed1 to speed2
 *   splitPoint ranges from 0 to 3000
 *
 * When splitPoint = 0: entire distance at speed2
 * When splitPoint = 3000: entire distance at speed1
 *
 * PROGRESSION: we want more distance at the higher speed → splitPoint decreases
 *   splitPoint goes: 3000 → 2800 → 2400 → 2000 → ... → 0
 *   When splitPoint reaches 0 (all at speed2):
 *     speed1 = speed2, speed2 = speed1 + 1, splitPoint = 3000
 *     But wait, splitPoint=3000 means all at speed1 (=old speed2). Then:
 *     Next success: splitPoint = 2800 (200m of speed2 at the end). ✓
 *
 * REGRESSION: we want more distance at the lower speed → splitPoint increases
 *   splitPoint goes: current → current + 400 (or +200 for first step)
 *   When splitPoint reaches 3000 (all at speed1):
 *     If we fail again: speed2 = speed1, speed1 = speed1 - 1, splitPoint = 0
 *     splitPoint = 0 means all at speed2 (= old speed1). Then:
 *     Next failure: splitPoint = 200 (last 200m slower at speed1). Hmm...
 *
 * Wait let me trace through the regression:
 *   State: speed1=12, speed2=13, splitPoint=0 (all at 13). FAIL.
 *   → splitPoint = 200. Plan: first 200m at 12, last 2800m at 13.
 *   But user wants: first 2800m at 13, last 200m at 12!
 *
 * The issue is that splitPoint means "first X meters at speed1, rest at speed2".
 * speed1 < speed2. So the START is slow, END is fast.
 * But when regressing past uniform, the user wants END to be slow.
 *
 * I think the cleanest model is to think of it as the user described:
 * changes always happen FROM THE END.
 *
 * Let me try a segment array approach mentally, then derive a compact state.
 *
 * The 8 segments from start to end. Each has a speed.
 * At any time, there are at most 2 speeds, and they're always grouped
 * (all of one speed first, then all of the other).
 *
 * State:
 *   speeds: [12,12,12,12,12,12,12,12] — uniform
 *   After success: [12,12,12,12,12,12,12,13] — last segment faster
 *   After success: [12,12,12,12,12,12,13,13] — last 2 faster
 *   ...
 *   After success: [13,13,13,13,13,13,13,13] — uniform at 13
 *   After success: [13,13,13,13,13,13,13,14] — last segment faster
 *
 * Now regression from uniform 13:
 *   [13,13,13,13,13,13,13,13] FAIL
 *   → [13,13,13,13,13,13,13,12] — last segment SLOWER
 *   FAIL again → [13,13,13,13,13,13,12,12]
 *   ... → [12,12,12,12,12,12,12,12] — all at 12
 *   FAIL again → [12,12,12,12,12,12,12,11] — last slower
 *
 * So the segments from the end can be EITHER faster or slower than the start.
 *
 * State: mainSpeed + endSpeed + endCount
 *   where endSpeed = mainSpeed + 1 (progressing) or mainSpeed - 1 (regressing)
 *   and endCount = 0..8 (0 = uniform)
 *
 * When endCount = 0: uniform at mainSpeed.
 * When endCount > 0 and endSpeed > mainSpeed: progressing (fast end).
 * When endCount > 0 and endSpeed < mainSpeed: regressing (slow end).
 *
 * SUCCESS:
 *   if endSpeed > mainSpeed (or endCount=0):
 *     endCount < 8 → endCount += 1, endSpeed = mainSpeed + 1
 *     endCount = 8 → mainSpeed = endSpeed, endCount = 0
 *   if endSpeed < mainSpeed (recovering from regression):
 *     endCount > 0 → endCount -= 1 (removing slow segments = getting faster)
 *     endCount = 0 → uniform at mainSpeed (recovered!)
 *
 * Wait this is getting complex. Let me just use the simplest correct model:
 *   mainSpeed: the speed for the FIRST part of the distance
 *   endSpeed: the speed for the LAST part
 *   endSegments: how many segments from the end are at endSpeed (0 = uniform at mainSpeed)
 *
 * endSpeed is always mainSpeed ± 1.
 *
 * OK actually, I realize there's an elegant way:
 *   Just store: baseSpeed and segments as an array direction.
 *   Actually the user's system is simpler than I'm making it.
 *
 * Let me just store the PLAN directly:
 *   segments: speed[] of length 8
 * That's at most 2 distinct values, always contiguous.
 *
 * Then SUCCESS: change the last segment-from-end that matches the LOWER speed
 *              to the HIGHER speed + 1... no this is wrong too.
 *
 * OK let me RESTART with the simplest possible approach. I'll store:
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
  /** Speed for the first portion of the distance (km/h) */
  mainSpeed: number;
  /** Speed for the end portion, or null if uniform */
  endSpeed: number | null;
  /** Number of segments from the end at endSpeed (0 = entire distance at mainSpeed) */
  endSegments: number;
}

export interface RunSegment {
  distanceM: number;
  speedKmh: number;
}

// ---- Core logic ----

/**
 * Build the run plan (list of segments with speeds) from the program state.
 * Returns 1 or 2 segments (grouped by speed).
 */
export function buildRunPlan(state: RunningProgramState): RunSegment[] {
  if (state.endSegments === 0 || state.endSpeed === null) {
    return [{ distanceM: TOTAL_DISTANCE, speedKmh: state.mainSpeed }];
  }

  const endDistance = SEGMENTS.slice(NUM_SEGMENTS - state.endSegments).reduce(
    (sum, s) => sum + s,
    0
  );
  const mainDistance = TOTAL_DISTANCE - endDistance;

  if (mainDistance <= 0) {
    // All segments at endSpeed — shouldn't normally happen (endSegments < 8)
    return [{ distanceM: TOTAL_DISTANCE, speedKmh: state.endSpeed }];
  }

  return [
    { distanceM: mainDistance, speedKmh: state.mainSpeed },
    { distanceM: endDistance, speedKmh: state.endSpeed },
  ];
}

/**
 * Calculate the next program state after a run result.
 *
 * SUCCESS (+):
 *   - If uniform (endSegments=0): start adding 1 faster segment from end
 *   - If end is faster: add one more fast segment
 *     - If that makes all 8 fast: promote to new uniform (mainSpeed = endSpeed)
 *   - If end is slower (recovering from regression): remove one slow segment
 *     - If that removes all slow: back to uniform at mainSpeed
 *
 * FAILURE (−):
 *   - If uniform (endSegments=0): start adding 1 slower segment from end
 *   - If end is slower: add one more slow segment
 *     - If that makes all 8 slow: demote to new uniform (mainSpeed = endSpeed)
 *   - If end is faster (was progressing): remove one fast segment
 *     - If that removes all fast: back to uniform at mainSpeed
 */
export function getNextState(
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
  const updated = { ...current, ...updates };
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
