// src/utils/sets.ts

/**
 * Set generation utilities.
 *
 * Generates the full list of sets (warmup + working) for an exercise,
 * ready to be displayed in the workout UI and saved as ExerciseLog entries.
 */

import { type Exercise } from '../types';
import { getDefaultTargetReps } from './reps';
import { calculateWarmupWeights } from './weight';

/**
 * Represents a single set to be performed (or already performed).
 */
export interface PlannedSet {
  /** Set number (1-based). Warmups first, then working sets. */
  setNumber: number;
  /** Type of set */
  setType: 'warmup' | 'working';
  /** Weight for this set in kg (0 for bodyweight exercises) */
  weight: number;
  /** Target reps for this set */
  targetReps: number;
}

/**
 * Generates the planned sets for a weighted exercise (has warmups).
 *
 * Set structure:
 *   1. Warmup 1: warmup1Percent% of working weight, warmup1Reps
 *   2. Warmup 2: warmup2Percent% of working weight, warmup2Reps
 *   3-5. Working sets: working weight, distributed target reps
 *
 * @param exercise - The exercise entity
 * @param targetRepsPerSet - Array of target reps for each working set.
 *        If null, uses default (6 per set).
 * @returns Array of PlannedSet objects
 */
export function generateSetsForWeightedExercise(
  exercise: Exercise,
  targetRepsPerSet: number[] | null
): PlannedSet[] {
  const workingWeight = exercise.workingWeight ?? 0;
  const numWorkingSets = exercise.numWorkingSets;

  const repsPerSet =
    targetRepsPerSet ?? getDefaultTargetReps(numWorkingSets);

  // Ensure repsPerSet length matches numWorkingSets
  const normalizedReps =
    repsPerSet.length === numWorkingSets
      ? repsPerSet
      : getDefaultTargetReps(numWorkingSets);

  const sets: PlannedSet[] = [];
  let setNumber = 1;

  // Warmup sets (only for weighted exercises with percent defined)
  if (
    exercise.warmup1Percent !== null &&
    exercise.warmup1Percent !== undefined
  ) {
    const warmups = calculateWarmupWeights(
      workingWeight,
      exercise.warmup1Percent ?? 60,
      exercise.warmup2Percent ?? 80
    );

    sets.push({
      setNumber: setNumber++,
      setType: 'warmup',
      weight: warmups.warmup1Weight,
      targetReps: exercise.warmup1Reps,
    });

    sets.push({
      setNumber: setNumber++,
      setType: 'warmup',
      weight: warmups.warmup2Weight,
      targetReps: exercise.warmup2Reps,
    });
  }

  // Working sets
  for (let i = 0; i < numWorkingSets; i++) {
    sets.push({
      setNumber: setNumber++,
      setType: 'working',
      weight: workingWeight,
      targetReps: normalizedReps[i] ?? 6,
    });
  }

  return sets;
}

/**
 * Generates the planned sets for a bodyweight-only exercise (no warmups).
 *
 * @param exercise - The exercise entity (hasAddedWeight = false)
 * @param targetRepsPerSet - Array of target reps for each working set.
 *        If null, uses default.
 * @returns Array of PlannedSet objects (working sets only, weight = 0)
 */
export function generateSetsForBodyweightExercise(
  exercise: Exercise,
  targetRepsPerSet: number[] | null
): PlannedSet[] {
  const numWorkingSets = exercise.numWorkingSets;

  const repsPerSet =
    targetRepsPerSet ?? getDefaultTargetReps(numWorkingSets);

  const normalizedReps =
    repsPerSet.length === numWorkingSets
      ? repsPerSet
      : getDefaultTargetReps(numWorkingSets);

  const sets: PlannedSet[] = [];

  for (let i = 0; i < numWorkingSets; i++) {
    sets.push({
      setNumber: i + 1,
      setType: 'working',
      weight: 0,
      targetReps: normalizedReps[i] ?? 6,
    });
  }

  return sets;
}

/**
 * Generates planned sets for any exercise, choosing the correct strategy
 * based on exercise properties.
 *
 * - Timed exercises (e.g., jump rope): returns empty array — handled separately
 * - Weighted exercises: warmup + working sets
 * - Bodyweight exercises: working sets only
 *
 * @param exercise - The exercise entity
 * @param targetRepsPerSet - Array of target reps for working sets, or null for defaults
 * @returns Array of PlannedSet objects
 */
export function generateSetsForExercise(
  exercise: Exercise,
  targetRepsPerSet: number[] | null
): PlannedSet[] {
  if (exercise.isTimed) {
    return [];
  }

  if (exercise.hasAddedWeight) {
    return generateSetsForWeightedExercise(exercise, targetRepsPerSet);
  }

  return generateSetsForBodyweightExercise(exercise, targetRepsPerSet);
}

/**
 * Represents the timer configuration for a timed exercise.
 */
export interface TimedExerciseConfig {
  prepSeconds: number;
  durationSeconds: number;
  totalSeconds: number;
}

/**
 * Gets the timer configuration for a timed exercise (e.g., jump rope).
 */
export function getTimedExerciseConfig(
  exercise: Exercise
): TimedExerciseConfig | null {
  if (!exercise.isTimed) return null;

  const durationSeconds = exercise.timerDurationSeconds ?? 60;
  const prepSeconds = exercise.timerPrepSeconds ?? 15;

  return {
    prepSeconds,
    durationSeconds,
    totalSeconds: prepSeconds + durationSeconds,
  };
}
