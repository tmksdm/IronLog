// src/utils/reps.ts

/**
 * Rep distribution and target calculation utilities.
 *
 * The "front-loaded" distribution pattern means extra reps are added
 * to earlier sets first. For example, with 3 sets and total 20:
 *   20 / 3 = 6 remainder 2 → 7, 7, 6
 *
 * Target reps for next session = previous actual total + 1.
 * When all sets reach maxRepsPerSet, a weight increase is triggered.
 * When actual total falls strictly below minRepsPerSet * numSets,
 * a weight decrease is triggered.
 */

/**
 * Distributes a total rep count across a given number of sets
 * using a front-loaded pattern: earlier sets get the extra reps.
 *
 * @param totalReps - Total reps to distribute
 * @param numSets - Number of sets (default 3)
 * @param maxRepsPerSet - Maximum allowed reps per set (default 8)
 * @param minRepsPerSet - Minimum allowed reps per set (default 4)
 * @returns Array of rep counts per set, length = numSets
 *
 * @example
 *   distributeReps(20, 3) → [7, 7, 6]
 *   distributeReps(24, 3) → [8, 8, 8]
 *   distributeReps(12, 3) → [4, 4, 4]
 *   distributeReps(14, 3) → [5, 5, 4]
 */
export function distributeReps(
  totalReps: number,
  numSets: number = 3,
  maxRepsPerSet: number = 8,
  minRepsPerSet: number = 4
): number[] {
  if (numSets <= 0) {
    return [];
  }

  // Clamp total to valid range
  const maxTotal = maxRepsPerSet * numSets;
  const minTotal = minRepsPerSet * numSets;
  const clampedTotal = Math.max(minTotal, Math.min(maxTotal, totalReps));

  const baseReps = Math.floor(clampedTotal / numSets);
  const remainder = clampedTotal % numSets;

  const result: number[] = [];
  for (let i = 0; i < numSets; i++) {
    // First `remainder` sets get baseReps + 1, the rest get baseReps
    result.push(i < remainder ? baseReps + 1 : baseReps);
  }

  return result;
}

/**
 * Calculates the target total reps for the next session based on
 * the previous session's actual total reps.
 *
 * Rule: next target = previous actual total + 1
 *
 * The result is clamped to [minRepsPerSet * numSets, maxRepsPerSet * numSets].
 *
 * @param previousActualTotal - Sum of actual reps across all working sets last session
 * @param numSets - Number of working sets (default 3)
 * @param maxRepsPerSet - Maximum allowed reps per set (default 8)
 * @param minRepsPerSet - Minimum allowed reps per set (default 4)
 * @returns Target total reps for next session
 */
export function calculateNextTargetTotal(
  previousActualTotal: number,
  numSets: number = 3,
  maxRepsPerSet: number = 8,
  minRepsPerSet: number = 4
): number {
  const maxTotal = maxRepsPerSet * numSets;
  const minTotal = minRepsPerSet * numSets;

  const nextTarget = previousActualTotal + 1;

  return Math.max(minTotal, Math.min(maxTotal, nextTarget));
}

/**
 * Calculates target reps per set for the next session.
 * Combines calculateNextTargetTotal + distributeReps.
 *
 * @param previousActualTotal - Sum of actual reps from last session's working sets
 * @param numSets - Number of working sets (default 3)
 * @param maxRepsPerSet - Max reps per set (default 8)
 * @param minRepsPerSet - Min reps per set (default 4)
 * @returns Array of target reps per working set
 *
 * @example
 *   // Previous: 7+6+6 = 19, next target = 20 → [7, 7, 6]
 *   calculateNextTargetReps(19) → [7, 7, 6]
 *
 *   // Previous: 7+4+4 = 15, next target = 16 → [6, 5, 5]
 *   calculateNextTargetReps(15) → [6, 5, 5]
 */
export function calculateNextTargetReps(
  previousActualTotal: number,
  numSets: number = 3,
  maxRepsPerSet: number = 8,
  minRepsPerSet: number = 4
): number[] {
  const nextTotal = calculateNextTargetTotal(
    previousActualTotal,
    numSets,
    maxRepsPerSet,
    minRepsPerSet
  );
  return distributeReps(nextTotal, numSets, maxRepsPerSet, minRepsPerSet);
}

/**
 * Determines the default starting target reps for a brand new exercise
 * that has no history. Uses a sensible middle-ground: 6 reps per set.
 *
 * @param numSets - Number of working sets (default 3)
 * @returns Array of default target reps per set
 */
export function getDefaultTargetReps(numSets: number = 3): number[] {
  const defaultRepsPerSet = 6;
  return Array(numSets).fill(defaultRepsPerSet);
}

export type WeightChangeDecision = 'increase' | 'decrease' | 'none';

/**
 * Determines whether a weight change should happen based on the actual
 * reps achieved in a session.
 *
 * - If actual total >= maxRepsPerSet * numSets → INCREASE weight
 * - If actual total < minRepsPerSet * numSets → DECREASE weight (strictly less!)
 * - Otherwise → no change
 *
 * Note: achieving exactly minRepsPerSet * numSets is normal — no decrease.
 *
 * @param actualRepsPerSet - Array of actual reps achieved in each working set
 * @param maxRepsPerSet - Max reps per set (default 8)
 * @param minRepsPerSet - Min reps per set (default 4)
 * @returns 'increase', 'decrease', or 'none'
 */
export function determineWeightChange(
  actualRepsPerSet: number[],
  maxRepsPerSet: number = 8,
  minRepsPerSet: number = 4
): WeightChangeDecision {
  const numSets = actualRepsPerSet.length;
  if (numSets === 0) return 'none';

  const actualTotal = actualRepsPerSet.reduce((sum, r) => sum + r, 0);
  const maxTotal = maxRepsPerSet * numSets;
  const minTotal = minRepsPerSet * numSets;

  if (actualTotal >= maxTotal) return 'increase';
  if (actualTotal < minTotal) return 'decrease';
  return 'none';
}
