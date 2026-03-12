// src/utils/index.ts

/**
 * Re-exports all utility modules for convenient imports.
 */

export {
  distributeReps,
  calculateNextTargetTotal,
  calculateNextTargetReps,
  getDefaultTargetReps,
  determineWeightChange,
  type WeightChangeDecision,
} from './reps';

export {
  roundToStep,
  calculateNewWeight,
  getResetTargetTotal,
  calculateWarmupWeights,
  calculateExerciseTotalKg,
  calculateWorkoutTotalKg,
  calculateAverageBodyWeight,
} from './weight';

export {
  sortByDirection,
  buildExerciseOrder,
  getNextDirection,
  getDirectionForNextSession,
} from './exerciseOrder';

export {
  generateSetsForExercise,
  generateSetsForWeightedExercise,
  generateSetsForBodyweightExercise,
  getTimedExerciseConfig,
  type PlannedSet,
  type TimedExerciseConfig,
} from './sets';

export {
  formatDecimal,
  formatWeight,
  formatTonnage,
  formatDurationMinutes,
  formatWorkoutDuration,
  formatTimeMMSS,
  formatCountdown,
  formatDate,
  formatDateShort,
  formatRepsSum,
  formatDayOfWeek,
} from './format';

export {
  buildBackupData,
  exportAsJSON,
  exportAsCSV,
} from './exportData';

export {
  pickAndParseBackup,
  parseBackupJSON,
  restoreFromBackup,
  type ImportPreview,
} from './importData';

export {
  loadRunningProgram,
  saveRunningProgram,
  initRunningProgram,
  applyRunResult,
  updateRunningProgram,
  buildRunPlan,
  formatRunPlan,
  getNextState,
  SEGMENTS,
  type RunningProgramState,
  type RunSegment,
} from './runningProgram';
