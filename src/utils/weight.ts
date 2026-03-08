// src/utils/weight.ts

/**
 * Weight progression and warmup calculation utilities.
 */

import { type WeightChangeDecision } from './reps';

/**
 * Rounds a weight to the nearest step (default 2.5 kg).
 *
 * @param weight - Raw weight value
 * @param step - Rounding step (default 2.5)
 * @returns Weight rounded to nearest step
 *
 * @example
 *   roundToStep(48)   → 47.5
 *   roundToStep(49)   → 50
 *   roundToStep(64)   → 65
 *   roundToStep(15.3) → 15
 */
export function roundToStep(weight: number, step: number = 2.5): number {
  return Math.round(weight / step) * step;
}

/**
 * Calculates the new working weight after a weight change decision.
 *
 * @param currentWeight - Current working weight in kg
 * @param decision - 'increase', 'decrease', or 'none'
 * @param weightIncrement - Amount to add/subtract (default 2.5 kg)
 * @param minWeight - Minimum allowed weight (default 0, i.e., bar only)
 * @returns New working weight
 */
export function calculateNewWeight(
  currentWeight: number,
  decision: WeightChangeDecision,
  weightIncrement: number = 2.5,
  minWeight: number = 0
): number {
  switch (decision) {
    case 'increase':
      return currentWeight + weightIncrement;
    case 'decrease':
      return Math.max(minWeight, currentWeight - weightIncrement);
    case 'none':
      return currentWeight;
  }
}

/**
 * Returns the starting target total reps after a weight change.
 *
 * @param numSets - Number of working sets (default 3)
 * @param resetRepsPerSet - Reps per set after weight change (default 6)
 * @returns Target total reps for first session at new weight
 */
export function getResetTargetTotal(
  numSets: number = 3,
  resetRepsPerSet: number = 6
): number {
  return resetRepsPerSet * numSets;
}

/**
 * Calculates warmup weights as percentages of working weight,
 * rounded to the nearest 2.5 kg.
 *
 * @param workingWeight - Current working weight in kg
 * @param warmup1Percent - Percentage for warmup set 1 (e.g., 60 = 60%)
 * @param warmup2Percent - Percentage for warmup set 2 (e.g., 80 = 80%)
 * @param roundingStep - Round to nearest step in kg (default 2.5)
 * @returns Object with warmup1Weight and warmup2Weight (both >= 0)
 *
 * @example
 *   calculateWarmupWeights(80, 60, 80) → { warmup1Weight: 47.5, warmup2Weight: 65 }
 *   calculateWarmupWeights(25, 60, 80) → { warmup1Weight: 15, warmup2Weight: 20 }
 */
export function calculateWarmupWeights(
  workingWeight: number,
  warmup1Percent: number,
  warmup2Percent: number,
  roundingStep: number = 2.5
): { warmup1Weight: number; warmup2Weight: number } {
  const raw1 = workingWeight * (warmup1Percent / 100);
  const raw2 = workingWeight * (warmup2Percent / 100);

  return {
    warmup1Weight: Math.max(0, roundToStep(raw1, roundingStep)),
    warmup2Weight: Math.max(0, roundToStep(raw2, roundingStep)),
  };
}

/**
 * Calculates total kg lifted for a single exercise from its set logs.
 * Only includes sets with weight > 0 and actual reps > 0.
 *
 * @param sets - Array of { weight, actualReps } for each set
 * @returns Total kg lifted (weight × reps summed across all sets)
 */
export function calculateExerciseTotalKg(
  sets: Array<{ weight: number; actualReps: number }>
): number {
  return sets.reduce((total, set) => {
    if (set.weight > 0 && set.actualReps > 0) {
      return total + set.weight * set.actualReps;
    }
    return total;
  }, 0);
}

/**
 * Calculates total kg lifted for an entire workout session.
 * Sums totalKg for each weighted exercise.
 *
 * @param exerciseTotals - Array of total kg per exercise
 * @returns Sum of all exercise totals
 */
export function calculateWorkoutTotalKg(exerciseTotals: number[]): number {
  return exerciseTotals.reduce((sum, kg) => sum + kg, 0);
}

/**
 * Calculates average body weight from pre and post measurements.
 *
 * @param weightBefore - Weight before workout (kg)
 * @param weightAfter - Weight after workout (kg)
 * @returns Average weight, or whichever is available, or null
 */
export function calculateAverageBodyWeight(
  weightBefore: number | null,
  weightAfter: number | null
): number | null {
  if (weightBefore !== null && weightAfter !== null) {
    return (weightBefore + weightAfter) / 2;
  }
  if (weightBefore !== null) return weightBefore;
  if (weightAfter !== null) return weightAfter;
  return null;
}
