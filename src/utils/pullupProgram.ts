// src/utils/pullupProgram.ts

/**
 * Pull-up program progression/regression logic.
 *
 * 5-day cycle:
 *   Day 1: Max reps — 5 sets, 90s rest
 *   Day 2: Ladder — 1,2,3,...N (fail) + final max set, rest = reps × 10s
 *   Day 3: Three grips — 9 sets (3 normal + 3 reverse + 3 wide), 60s rest
 *   Day 4: Four grips — 12 sets (3 normal + 3 reverse + 3 wide + 3 normal), 60s rest
 *   Day 5: Rotation — repeats one of days 1–4 in order (1→2→3→4→1→...)
 *
 * Progression for days 3/4:
 *   - Day 3 regression: fewer than 5 sets completed at target → target -= 1
 *   - Day 4 regression: fewer than 7 sets completed at target → target -= 1
 *   - Day 4 full success (all 12): target += 1 for BOTH day 3 and day 4
 *   - Day 3 cannot increase on its own; only day 4's full success raises both
 *
 * Day 5 inherits the program + targets of the day it repeats,
 * and its results affect progression/regression of that day.
 */

// ---- Constants ----

const STORAGE_KEY = 'ironlog_pullup_program';

/** Day types in the 5-day pull-up cycle */
export type PullupDayNumber = 1 | 2 | 3 | 4 | 5;

/** Grip types for days 3/4 */
export type GripType = 'normal' | 'reverse' | 'wide';

/** Rest times in seconds */
export const REST_TIMES = {
  day1: 90,
  day3_4: 60,
} as const;

/** Day 3: 9 sets — grip order */
export const DAY3_GRIPS: GripType[] = [
  'normal', 'normal', 'normal',
  'reverse', 'reverse', 'reverse',
  'wide', 'wide', 'wide',
];

/** Day 4: 12 sets — grip order */
export const DAY4_GRIPS: GripType[] = [
  'normal', 'normal', 'normal',
  'reverse', 'reverse', 'reverse',
  'wide', 'wide', 'wide',
  'normal', 'normal', 'normal',
];

/** Thresholds for progression checks */
export const DAY3_MIN_COMPLETED = 5;  // out of 9
export const DAY4_MIN_COMPLETED = 7;  // out of 12
export const DAY4_TOTAL_SETS = 12;

/** Default starting target reps for days 3/4 */
export const DEFAULT_TARGET_REPS = 4;

// ---- Types ----

export interface PullupProgramState {
  /** Current day in the cycle (1–5). Next pull-up session will be this day. */
  currentDay: PullupDayNumber;
  /** Which day (1–4) day 5 will repeat next */
  day5Rotation: 1 | 2 | 3 | 4;
  /** Target reps per set for day 3 */
  day3TargetReps: number;
  /** Target reps per set for day 4 */
  day4TargetReps: number;
}

/** Result of a single pull-up set */
export interface PullupSetResult {
  /** Set number (1-based) */
  setNumber: number;
  /** Actual reps performed */
  reps: number;
  /** Grip type (for days 3/4/5-as-3/4) */
  grip: GripType | null;
  /** Target reps for this set (null for max-effort sets) */
  targetReps: number | null;
  /** Whether this set met the target */
  succeeded: boolean;
}

/** Full result of a pull-up day */
export interface PullupDayResult {
  /** Which program day was executed (1–5) */
  dayNumber: PullupDayNumber;
  /** If day 5, which day it repeated */
  day5ActualDay: 1 | 2 | 3 | 4 | null;
  /** All sets performed */
  sets: PullupSetResult[];
  /** Total reps across all sets */
  totalReps: number;
  /** Whether the session was skipped */
  skipped: boolean;
}

/** Plan for what the user should do today */
export interface PullupDayPlan {
  /** Day number (1–5) */
  dayNumber: PullupDayNumber;
  /** If day 5, which day it repeats */
  day5ActualDay: 1 | 2 | 3 | 4 | null;
  /** The "effective" day type (resolves day 5 to its actual day) */
  effectiveDay: 1 | 2 | 3 | 4;
  /** Target reps per set (for days 3/4), null for days 1/2 */
  targetReps: number | null;
  /** Grip sequence (for days 3/4), null for days 1/2 */
  grips: GripType[] | null;
  /** Number of sets (for day 1 = 5, day 2 = dynamic, days 3/4 = 9/12) */
  plannedSets: number | null;
  /** Rest time in seconds between sets */
  restSeconds: number | null;
  /** Description for UI */
  description: string;
}

// ---- Core logic ----

/**
 * Get the effective day number (resolves day 5 to its rotation target).
 */
export function getEffectiveDay(
  dayNumber: PullupDayNumber,
  day5Rotation: 1 | 2 | 3 | 4
): 1 | 2 | 3 | 4 {
  return dayNumber === 5 ? day5Rotation : (dayNumber as 1 | 2 | 3 | 4);
}

/**
 * Get the target reps for the effective day (days 3/4 only).
 */
export function getTargetRepsForDay(
  effectiveDay: 1 | 2 | 3 | 4,
  state: PullupProgramState
): number | null {
  if (effectiveDay === 3) return state.day3TargetReps;
  if (effectiveDay === 4) return state.day4TargetReps;
  return null;
}

/**
 * Build the plan for the current pull-up day.
 */
export function buildDayPlan(state: PullupProgramState): PullupDayPlan {
  const { currentDay, day5Rotation } = state;
  const effectiveDay = getEffectiveDay(currentDay, day5Rotation);
  const day5ActualDay = currentDay === 5 ? day5Rotation : null;

  switch (effectiveDay) {
    case 1:
      return {
        dayNumber: currentDay,
        day5ActualDay,
        effectiveDay: 1,
        targetReps: null,
        grips: null,
        plannedSets: 5,
        restSeconds: REST_TIMES.day1,
        description: '5 подходов на максимум, отдых 90 сек',
      };

    case 2:
      return {
        dayNumber: currentDay,
        day5ActualDay,
        effectiveDay: 2,
        targetReps: null,
        grips: null,
        plannedSets: null, // dynamic — determined during execution
        restSeconds: null, // dynamic — reps × 10s
        description: 'Лесенка: 1, 2, 3, ... + финальный подход на максимум',
      };

    case 3:
      return {
        dayNumber: currentDay,
        day5ActualDay,
        effectiveDay: 3,
        targetReps: state.day3TargetReps,
        grips: [...DAY3_GRIPS],
        plannedSets: 9,
        restSeconds: REST_TIMES.day3_4,
        description: `9 подходов по ${state.day3TargetReps} (3 обычн. + 3 обратн. + 3 широк.), отдых 60 сек`,
      };

    case 4:
      return {
        dayNumber: currentDay,
        day5ActualDay,
        effectiveDay: 4,
        targetReps: state.day4TargetReps,
        grips: [...DAY4_GRIPS],
        plannedSets: 12,
        restSeconds: REST_TIMES.day3_4,
        description: `12 подходов по ${state.day4TargetReps} (3 обычн. + 3 обратн. + 3 широк. + 3 обычн.), отдых 60 сек`,
      };
  }
}

/**
 * Apply the result of a pull-up session to the program state.
 * Returns the new state. Does NOT save — caller must save.
 *
 * Rules:
 *   Day 3: < 5 sets at target → day3TargetReps -= 1 (min 1)
 *   Day 4: < 7 sets at target → day4TargetReps -= 1 (min 1)
 *   Day 4: all 12 at target → day3TargetReps += 1, day4TargetReps += 1
 *   Day 5: applies the rules of whichever day it repeated
 *   Days 1, 2: no progression changes
 */
export function applyDayResult(
  state: PullupProgramState,
  result: PullupDayResult
): PullupProgramState {
  let { day3TargetReps, day4TargetReps } = state;

  // Determine which day's rules to apply
  const effectiveDay = result.day5ActualDay ?? result.dayNumber;

  if (!result.skipped) {
    if (effectiveDay === 3) {
      const completedSets = result.sets.filter((s) => s.succeeded).length;
      if (completedSets < DAY3_MIN_COMPLETED) {
        day3TargetReps = Math.max(1, day3TargetReps - 1);
      }
      // Day 3 cannot increase on its own
    }

    if (effectiveDay === 4) {
      const completedSets = result.sets.filter((s) => s.succeeded).length;
      if (completedSets < DAY4_MIN_COMPLETED) {
        day4TargetReps = Math.max(1, day4TargetReps - 1);
      } else if (completedSets >= DAY4_TOTAL_SETS) {
        // Full success! Raise both
        day3TargetReps += 1;
        day4TargetReps += 1;
      }
    }
  }

  // Advance to next day (only if not skipped)
  let nextDay: PullupDayNumber = state.currentDay;
  let nextDay5Rotation = state.day5Rotation;

  if (!result.skipped) {
    // Advance day5 rotation if day 5 was completed
    if (state.currentDay === 5) {
      nextDay5Rotation = ((state.day5Rotation % 4) + 1) as 1 | 2 | 3 | 4;
    }
    // Move to next day in cycle
    nextDay = ((state.currentDay % 5) + 1) as PullupDayNumber;
  }

  return {
    currentDay: nextDay,
    day5Rotation: nextDay5Rotation,
    day3TargetReps,
    day4TargetReps,
  };
}

/**
 * Calculate total reps from a set of results.
 */
export function calculateTotalReps(sets: PullupSetResult[]): number {
  return sets.reduce((sum, s) => sum + s.reps, 0);
}

/**
 * Calculate rest time for a ladder step (Day 2).
 * Rest = actual reps performed × 10 seconds.
 */
export function getLadderRestTime(repsPerformed: number): number {
  return repsPerformed * 10;
}

/**
 * Check if a ladder step is a failure (performed fewer reps than step number).
 */
export function isLadderFail(stepNumber: number, repsPerformed: number): boolean {
  return repsPerformed < stepNumber;
}

// ---- Grip display names ----

const GRIP_NAMES: Record<GripType, string> = {
  normal: 'Обычный',
  reverse: 'Обратный',
  wide: 'Широкий',
};

export function getGripName(grip: GripType): string {
  return GRIP_NAMES[grip];
}

// ---- Day display names ----

const DAY_NAMES: Record<number, string> = {
  1: 'Максимумы',
  2: 'Лесенка',
  3: 'Три хвата',
  4: 'Четыре хвата',
};

export function getPullupDayName(dayNumber: PullupDayNumber, day5Rotation?: 1 | 2 | 3 | 4): string {
  if (dayNumber === 5) {
    const actualDay = day5Rotation ?? 1;
    return `Повтор: ${DAY_NAMES[actualDay]}`;
  }
  return DAY_NAMES[dayNumber] ?? `День ${dayNumber}`;
}

// ---- Persistence (localStorage) ----

/**
 * Get the default initial state.
 */
export function getDefaultPullupState(): PullupProgramState {
  return {
    currentDay: 1,
    day5Rotation: 1,
    day3TargetReps: DEFAULT_TARGET_REPS,
    day4TargetReps: DEFAULT_TARGET_REPS,
  };
}

/**
 * Load pull-up program state from localStorage.
 * Returns default state if not found or corrupted.
 */
export function loadPullupProgram(): PullupProgramState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultPullupState();
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.currentDay !== 'number' ||
      parsed.currentDay < 1 ||
      parsed.currentDay > 5
    ) {
      return getDefaultPullupState();
    }
    return {
      currentDay: parsed.currentDay as PullupDayNumber,
      day5Rotation: (parsed.day5Rotation ?? 1) as 1 | 2 | 3 | 4,
      day3TargetReps: parsed.day3TargetReps ?? DEFAULT_TARGET_REPS,
      day4TargetReps: parsed.day4TargetReps ?? DEFAULT_TARGET_REPS,
    };
  } catch {
    return getDefaultPullupState();
  }
}

/**
 * Save pull-up program state to localStorage.
 */
export function savePullupProgram(state: PullupProgramState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Apply day result and persist the new state.
 * Convenience wrapper around applyDayResult + savePullupProgram.
 */
export function applyAndSaveDayResult(result: PullupDayResult): PullupProgramState {
  const current = loadPullupProgram();
  const next = applyDayResult(current, result);
  savePullupProgram(next);
  return next;
}

/**
 * Reverse the effect of a completed pull-up day on the program state.
 * Used when deleting the last workout to undo progression.
 *
 * This is the inverse of applyDayResult():
 *   - Moves currentDay backward by 1 in the cycle
 *   - Reverses day5Rotation if the deleted day was day 5
 *   - Reverses target reps changes for days 3/4
 */
export function reverseDayResult(
  state: PullupProgramState,
  result: PullupDayResult
): PullupProgramState {
  if (result.skipped) {
    // Skipped sessions don't change state, nothing to reverse
    return state;
  }

  // Reverse day advancement: current day was advanced AFTER the result,
  // so we need to go back. currentDay is where we ARE now (next day).
  // The day that was completed = previous day in cycle.
  let prevDay: PullupDayNumber = ((((state.currentDay - 1) - 1 + 5) % 5) + 1) as PullupDayNumber;
  let prevDay5Rotation = state.day5Rotation;

  // If the completed day was day 5, day5Rotation was advanced too
  if (prevDay === 5) {
    prevDay5Rotation = ((((state.day5Rotation - 1) - 1 + 4) % 4) + 1) as 1 | 2 | 3 | 4;
  }

  // Reverse target reps changes
  let { day3TargetReps, day4TargetReps } = state;
  const effectiveDay = result.day5ActualDay ?? result.dayNumber;

  if (effectiveDay === 3) {
    const completedSets = result.sets.filter((s) => s.succeeded).length;
    if (completedSets < DAY3_MIN_COMPLETED) {
      // Was decreased — restore by adding 1
      day3TargetReps += 1;
    }
  }

  if (effectiveDay === 4) {
    const completedSets = result.sets.filter((s) => s.succeeded).length;
    if (completedSets < DAY4_MIN_COMPLETED) {
      // Was decreased — restore
      day4TargetReps += 1;
    } else if (completedSets >= DAY4_TOTAL_SETS) {
      // Both were increased — restore by subtracting
      day3TargetReps = Math.max(1, day3TargetReps - 1);
      day4TargetReps = Math.max(1, day4TargetReps - 1);
    }
  }

  return {
    currentDay: prevDay,
    day5Rotation: prevDay5Rotation,
    day3TargetReps,
    day4TargetReps,
  };
}



/**
 * Manually override the program state (for settings / debugging).
 */
export function resetPullupProgram(overrides?: Partial<PullupProgramState>): PullupProgramState {
  const state: PullupProgramState = {
    ...getDefaultPullupState(),
    ...overrides,
  };
  savePullupProgram(state);
  return state;
}
