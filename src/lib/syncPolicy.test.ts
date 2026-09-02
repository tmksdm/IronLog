import { describe, expect, it } from 'vitest';
import { hasMeaningfulLocalData, isCloudBackupEmpty } from './syncPolicy';

const emptyLocal = {
  workoutSessions: 0,
  userExercises: 0,
  cardioLogs: 0,
  pullupLogs: 0,
  activeWorkouts: 0,
  activePullups: 0,
  pendingDeletes: 0,
};

describe('hasMeaningfulLocalData', () => {
  it('treats a fresh database with seed exercises as empty', () => {
    expect(hasMeaningfulLocalData(emptyLocal)).toBe(false);
  });

  it.each(['cardioLogs', 'pullupLogs', 'activeWorkouts', 'activePullups'] as const)(
    'protects local %s from a cloud restore',
    (key) => {
      expect(hasMeaningfulLocalData({ ...emptyLocal, [key]: 1 })).toBe(true);
    }
  );

  it('blocks restore while an offline deletion is waiting to sync', () => {
    expect(hasMeaningfulLocalData({ ...emptyLocal, pendingDeletes: 1 })).toBe(true);
  });
});

describe('isCloudBackupEmpty', () => {
  it('recognizes a completely empty cloud backup', () => {
    expect(
      isCloudBackupEmpty({
        exercises: 0,
        workoutSessions: 0,
        exerciseLogs: 0,
        cardioLogs: 0,
        pullupLogs: 0,
      })
    ).toBe(true);
  });

  it('does not ignore standalone-only cloud data', () => {
    expect(
      isCloudBackupEmpty({
        exercises: 0,
        workoutSessions: 0,
        exerciseLogs: 0,
        cardioLogs: 1,
        pullupLogs: 0,
      })
    ).toBe(false);
  });
});
