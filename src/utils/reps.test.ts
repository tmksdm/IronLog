// src/utils/reps.test.ts
//
// Rep progression must keep two properties at once:
//   - a weighted exercise is capped at maxRepsPerSet (8/8/8 triggers a weight
//     increase and the reps start over at the top of the range);
//   - an exercise without added weight has no weight to progress, so its reps
//     must keep growing instead of sticking at 8/8/8 forever.

import { describe, expect, it } from 'vitest';

import {
  calculateNextTargetReps,
  calculateNextTargetTotal,
  determineWeightChange,
  distributeReps,
} from './reps';

describe('distributeReps', () => {
  it('front-loads the remainder', () => {
    expect(distributeReps(20, 3)).toEqual([7, 7, 6]);
    expect(distributeReps(24, 3)).toEqual([8, 8, 8]);
    expect(distributeReps(12, 3)).toEqual([4, 4, 4]);
    expect(distributeReps(14, 3)).toEqual([5, 5, 4]);
  });

  it('caps the total at maxRepsPerSet * numSets', () => {
    expect(distributeReps(40, 3, 8, 4)).toEqual([8, 8, 8]);
  });

  it('raises the total to minRepsPerSet * numSets', () => {
    expect(distributeReps(1, 3, 8, 4)).toEqual([4, 4, 4]);
  });

  it('has no ceiling when maxRepsPerSet is null', () => {
    expect(distributeReps(30, 3, null, 4)).toEqual([10, 10, 10]);
    expect(distributeReps(45, 3, null, 4)).toEqual([15, 15, 15]);
  });
});

describe('calculateNextTargetTotal', () => {
  it('adds one rep to the previous total', () => {
    expect(calculateNextTargetTotal(19, 3, 8, 4)).toBe(20);
  });

  it('stops at the ceiling for weighted exercises', () => {
    expect(calculateNextTargetTotal(24, 3, 8, 4)).toBe(24);
    expect(calculateNextTargetTotal(30, 3, 8, 4)).toBe(24);
  });

  it('keeps growing without a ceiling', () => {
    expect(calculateNextTargetTotal(24, 3, null, 0)).toBe(25);
    expect(calculateNextTargetTotal(30, 3, null, 0)).toBe(31);
  });
});

describe('calculateNextTargetReps — weighted exercise (max 8 per set)', () => {
  it('progresses towards 8/8/8', () => {
    expect(calculateNextTargetReps(19, 3, 8, 4)).toEqual([7, 7, 6]);
  });

  it('stays at 8/8/8 once the ceiling is reached', () => {
    expect(calculateNextTargetReps(24, 3, 8, 4)).toEqual([8, 8, 8]);
    expect(calculateNextTargetReps(27, 3, 8, 4)).toEqual([8, 8, 8]);
  });
});

describe('calculateNextTargetReps — exercise without added weight', () => {
  // Hyperextension is seeded with max_reps_per_set = 8, min_reps_per_set = 0
  // and has_added_weight = 0. Before the fix it stuck at 8/8/8 forever.
  it('does not stick at 8/8/8', () => {
    expect(calculateNextTargetReps(24, 3, null, 0)).toEqual([9, 8, 8]);
    expect(calculateNextTargetReps(25, 3, null, 0)).toEqual([9, 9, 8]);
    expect(calculateNextTargetReps(26, 3, null, 0)).toEqual([9, 9, 9]);
  });

  it('keeps progressing well past the old ceiling', () => {
    expect(calculateNextTargetReps(29, 3, null, 0)).toEqual([10, 10, 10]);
    expect(calculateNextTargetReps(30, 3, null, 0)).toEqual([11, 10, 10]);
    expect(calculateNextTargetReps(59, 3, null, 0)).toEqual([20, 20, 20]);
  });

  it('still respects a configured minimum per set', () => {
    expect(calculateNextTargetReps(2, 3, null, 4)).toEqual([4, 4, 4]);
  });
});

describe('determineWeightChange', () => {
  it('asks for more weight at 8/8/8', () => {
    expect(determineWeightChange([8, 8, 8], 8, 4)).toBe('increase');
  });

  it('asks for less weight only strictly below the minimum', () => {
    expect(determineWeightChange([4, 4, 4], 8, 4)).toBe('none');
    expect(determineWeightChange([3, 4, 4], 8, 4)).toBe('decrease');
  });

  it('keeps the middle range unchanged', () => {
    expect(determineWeightChange([7, 6, 6], 8, 4)).toBe('none');
  });
});
