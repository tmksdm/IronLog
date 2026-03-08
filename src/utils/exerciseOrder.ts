// src/utils/exerciseOrder.ts

/**
 * Exercise ordering logic with priority (skipped) exercises and
 * direction-based sorting.
 *
 * Priority exercises: those that were recorded as 0 reps (skipped)
 * in the previous session of the same day type. They are placed first
 * in the current session's exercise list, ordered by the current
 * session's direction.
 *
 * Remaining exercises follow in the current session's direction,
 * excluding those already listed as priorities.
 */

import { type Exercise, type Direction } from '../types';

/**
 * Sorts exercises by sortOrder in the given direction.
 *
 * @param exercises - Array of exercises to sort
 * @param direction - 'normal' (ascending sortOrder) or 'reverse' (descending)
 * @returns New sorted array (original not mutated)
 */
export function sortByDirection(
  exercises: Exercise[],
  direction: Direction
): Exercise[] {
  const sorted = [...exercises].sort((a, b) => a.sortOrder - b.sortOrder);
  if (direction === 'reverse') {
    sorted.reverse();
  }
  return sorted;
}

/**
 * Builds the ordered exercise list for a workout session, incorporating
 * priority (skipped) exercises and the recommended direction.
 *
 * @param allExercises - All active exercises for this day type (unsorted)
 * @param skippedExerciseIds - Set of exercise IDs that were skipped last session
 * @param direction - Recommended direction for this session
 * @returns Ordered array of exercises: priorities first (in direction order),
 *          then remaining (in direction order)
 */
export function buildExerciseOrder(
  allExercises: Exercise[],
  skippedExerciseIds: Set<string>,
  direction: Direction
): Exercise[] {
  const active = allExercises.filter((e) => e.isActive);

  // Separate priority and regular exercises
  const priority = active.filter((e) => skippedExerciseIds.has(e.id));
  const regular = active.filter((e) => !skippedExerciseIds.has(e.id));

  // Sort each group by the current direction
  const sortedPriority = sortByDirection(priority, direction);
  const sortedRegular = sortByDirection(regular, direction);

  // Priority exercises come first, then the rest
  return [...sortedPriority, ...sortedRegular];
}

/**
 * Determines the next direction based on the direction used
 * in the last session (of ANY day type — direction is global).
 *
 * @param lastDirection - Direction used in the previous session
 * @returns The opposite direction
 */
export function getNextDirection(lastDirection: Direction): Direction {
  return lastDirection === 'normal' ? 'reverse' : 'normal';
}

/**
 * Determines which direction to use for the next session.
 * If there's no previous session, defaults to 'normal'.
 *
 * @param lastDirection - Direction from the last session, or null if no history
 * @returns Direction for the upcoming session
 */
export function getDirectionForNextSession(
  lastDirection: Direction | null
): Direction {
  if (lastDirection === null) {
    return 'normal';
  }
  return getNextDirection(lastDirection);
}
