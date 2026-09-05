// ==========================================
// TypeScript type definitions for IronLog
// ==========================================

// --- Day type ---

export type DayTypeId = 1 | 2 | 3;

export type Direction = 'normal' | 'reverse';

export interface DayType {
  id: DayTypeId;
  name: string;
  nameRu: string;
}

// --- Exercise ---

export interface Exercise {
  id: string;
  dayTypeId: DayTypeId;
  name: string;
  sortOrder: number;
  hasAddedWeight: boolean;
  workingWeight: number | null;
  weightIncrement: number;
  warmup1Percent: number | null;
  warmup2Percent: number | null;
  warmup1Reps: number;
  warmup2Reps: number;
  maxRepsPerSet: number;
  minRepsPerSet: number;
  numWorkingSets: number;
  isTimed: boolean;
  timerDurationSeconds: number | null;
  timerPrepSeconds: number | null;
  isActive: boolean;
}

// --- Workout session ---

export interface WorkoutSession {
  id: string;
  dayTypeId: DayTypeId;
  date: string;
  direction: Direction;
  weightBefore: number | null;
  weightAfter: number | null;
  timeStart: string;
  timeEnd: string | null;
  totalKg: number;
  notes: string | null;
}

// --- Exercise log (one set) ---

export type SetType = 'warmup' | 'working';

export interface ExerciseLog {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  setNumber: number;
  setType: SetType;
  targetReps: number;
  actualReps: number;
  weight: number;
  isSkipped: boolean;
  completedAt: string | null;
}

// --- Cardio ---

export type CardioType = 'jump_rope' | 'treadmill_3km';

export interface CardioLog {
  id: string;
  workoutSessionId: string | null;
  date?: string;
  type: CardioType;
  durationSeconds: number | null;
  count: number | null;
  succeeded: boolean | null;
}


// --- UI helper types ---

export type ExerciseStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export interface ExerciseWithStatus extends Exercise {
  status: ExerciseStatus;
  isPriority: boolean;
  sets: ExerciseLog[];
}

// --- Active workout types (used by workoutStore) ---

export interface ActiveExercise extends Exercise {
  status: ExerciseStatus;
  isPriority: boolean;
  sets: ExerciseLog[];
  previousWorkingWeight?: number;
  previousWorkingReps?: number[];
}

// --- Workout snapshot for crash resilience ---

export interface WorkoutSnapshot {
  session: WorkoutSession;
  exercises: ActiveExercise[];
  currentExerciseIndex: number;
  restTimerDefault: number;
  /** post-finish summary mode */
  postFinish?: boolean;
}


// --- Analytics types ---

export interface TonnageDataPoint {
  sessionId: string;
  date: string;
  dayTypeId: DayTypeId;
  totalKg: number;
}

export interface MonthlyTonnage {
  year: number;
  month: number;
  label: string;
  avgTotalKg: number;
  workoutCount: number;
}

export interface YearlyTonnage {
  year: number;
  avgTotalKg: number;
  workoutCount: number;
}

export interface BodyWeightDataPoint {
  date: string;
  avgWeight: number;
}

export interface MonthlyBodyWeight {
  year: number;
  month: number;
  label: string;
  avgWeight: number;
  measurementCount: number;
}

export interface YearlyBodyWeight {
  year: number;
  avgWeight: number;
  measurementCount: number;
}

export interface MonthlyDuration {
  year: number;
  month: number;
  label: string;
  avgDurationMin: number;
  workoutCount: number;
}

export interface YearlyDuration {
  year: number;
  avgDurationMin: number;
  workoutCount: number;
}

export interface MonthlyRunTime {
  year: number;
  month: number;
  label: string;
  avgDurationSec: number;
  runCount: number;
}

export interface YearlyRunTime {
  year: number;
  avgDurationSec: number;
  runCount: number;
}

export interface MonthlyJumpRope {
  year: number;
  month: number;
  label: string;
  avgCount: number;
  sessionCount: number;
}

export interface YearlyJumpRope {
  year: number;
  avgCount: number;
  sessionCount: number;
}

export interface ExerciseProgressPoint {
  date: string;
  sessionId: string;
  workingWeight: number | null;
  workingReps: number[];
  totalWorkingReps: number;
  totalKg: number;
}

export interface ExercisePickerItem {
  id: string;
  name: string;
  dayTypeId: DayTypeId;
  hasAddedWeight: boolean;
}

export interface ExerciseSummary {
  exerciseId: string;
  exerciseName: string;
  hasAddedWeight: boolean;
  workingWeight: number | null;
  sets: ExerciseLog[];
  isSkipped: boolean;
  totalKg: number;
}

// --- Export/Import types ---

export interface BackupData {
  version: number;
  exportedAt: string;
  dayTypes: Array<Record<string, unknown>>;
  exercises: Array<Record<string, unknown>>;
  workoutSessions: Array<Record<string, unknown>>;
  exerciseLogs: Array<Record<string, unknown>>;
  cardioLogs: Array<Record<string, unknown>>;
  pullupLogs?: Array<Record<string, unknown>>;
}

// --- Pull-up system types ---

export interface PullupLog {
  id: string;
  workoutSessionId: string | null;
  pullupDay: number;        // 1‑5
  effectiveDay: number;     // 1‑4 (resolved from day 5)
  setNumber: number;
  reps: number;
  gripType: string | null;  // 'normal' | 'reverse' | 'wide' | null
  targetReps: number | null;
  succeeded: boolean;       // did this set meet target?
  totalReps: number;        // total reps for the whole session (denormalized for easy queries)
  skipped: boolean;         // entire pullup session was skipped
}

export interface MonthlyPullups {
  year: number;
  month: number;
  label: string;
  avgReps: number;
  sessionCount: number;
}

export interface YearlyPullups {
  year: number;
  avgReps: number;
  sessionCount: number;
}


/**
 * A standalone pull-up session (workout_session_id IS NULL), assembled by
 * grouping all set rows that share the same `date`. Used by the History
 * "Турник" filter — one object = one card.
 */
export interface StandalonePullupSession {
  /** Save timestamp shared by all sets of this session (grouping key) */
  date: string;
  /** Program day (1–5) */
  pullupDay: number;
  /** Effective day (1–4, resolves day 5) */
  effectiveDay: number;
  /** Total reps across all sets */
  totalReps: number;
  /** Number of sets performed */
  setCount: number;
  /** ids of all set rows — used for deletion */
  ids: string[];
}


export interface PullupStepResult {
  dayNumber: 1 | 2 | 3 | 4 | 5;
  effectiveDay: 1 | 2 | 3 | 4;
  day5ActualDay: 1 | 2 | 3 | 4 | null;
  sets: Array<{
    setNumber: number;
    reps: number;
    grip: 'normal' | 'reverse' | 'wide' | null;
    targetReps: number | null;
    succeeded: boolean;
  }>;
  totalReps: number;
  skipped: boolean;
}

// --- Post-workout tab types ---

export type PostWorkoutTab = 'exercises' | 'cardio' | 'pullups' | 'summary';

/** 
 * In-progress pullup session state — persisted in snapshot 
 * so that switching tabs or app crash doesn't lose progress.
 */
export interface PullupInProgressState {
  /** The plan for this session (built from program state at start) */
  plan: {
    dayNumber: 1 | 2 | 3 | 4 | 5;
    effectiveDay: 1 | 2 | 3 | 4;
    day5ActualDay: 1 | 2 | 3 | 4 | null;
    targetReps: number | null;
    grips: Array<'normal' | 'reverse' | 'wide'> | null;
    plannedSets: number | null;
    restSeconds: number | null;
  };
  /** Whether user has pressed "Начать" (past the intro screen) */
  started: boolean;
  /** Completed sets so far */
  completedSets: Array<{
    setNumber: number;
    reps: number;
    grip: 'normal' | 'reverse' | 'wide' | null;
    targetReps: number | null;
    succeeded: boolean;
  }>;
  /** Current set index (0-based, for days 3/4) or ladder step (1-based, for day 2) */
  currentSetIndex: number;
  /** Day 2 specific: whether ladder has failed */
  ladderFailed: boolean;
  /** Day 2 specific: whether we're on the final max-effort set */
  ladderFinalSet: boolean;
  /** Whether resting between sets right now */
  isResting: boolean;
  /** Rest timer: seconds remaining (0 = not resting) */
  restSecondsLeft: number;
  /** Rest timer: total seconds for current rest (for progress ring) */
  restSecondsTotal: number;
}

/**
 * Snapshot of a STANDALONE pull-up session for crash resilience.
 * Stored in the `pullup_active_state` table (separate from workout snapshot).
 * `inProgress` reuses the same shape as the in-workout pull-up state.
 */
export interface PullupSessionSnapshot {
  inProgress: PullupInProgressState;
  updatedAt: string;
}
