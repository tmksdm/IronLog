// src/utils/index.ts

/**
 * Re-exports all utility modules for convenient imports.
 *
 * Usage: import { distributeReps, roundToStep, formatWeight } from '../utils';
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
