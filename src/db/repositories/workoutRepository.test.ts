import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  query: vi.fn(),
  getDb: vi.fn(),
  saveToStore: vi.fn(),
}));

vi.mock('../database', () => ({
  getDb: mocks.getDb,
  generateId: vi.fn(),
  saveToStore: mocks.saveToStore,
}));

vi.mock('../../lib/sync', () => ({
  flushPendingCloudDeletions: vi.fn(),
  queueCloudDeletion: vi.fn(),
}));

import {
  finishWorkoutSession,
  getLastWorkingLogsForExercise,
  updateWorkoutSessionBodyWeight,
} from './workoutRepository';

describe('workout body-weight persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue({ run: mocks.run, query: mocks.query });
    mocks.query.mockResolvedValue({ values: [{ total: 1250 }] });
  });

  it('updates both measurements locally', async () => {
    await updateWorkoutSessionBodyWeight('session-1', 81.5, 80.75);

    expect(mocks.run).toHaveBeenCalledWith(
      'UPDATE workout_sessions SET weight_before = ?, weight_after = ? WHERE id = ?',
      [81.5, 80.75, 'session-1']
    );
    expect(mocks.saveToStore).toHaveBeenCalledOnce();
  });

  it('uses the corrected starting weight when the workout is finished', async () => {
    await finishWorkoutSession('session-1', 81.5, 80.75, '2026-09-04T12:00:00.000Z');

    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining('SET time_end = ?, weight_before = ?, weight_after = ?, total_kg = ?'),
      ['2026-09-04T12:00:00.000Z', 81.5, 80.75, 1250, 'session-1']
    );
    expect(mocks.saveToStore).toHaveBeenCalledOnce();
  });
});

describe('previous working-set results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue({ run: mocks.run, query: mocks.query });
  });

  it('loads every working set from one latest completed session in set order', async () => {
    mocks.query.mockResolvedValue({
      values: [
        {
          id: 'log-1',
          workout_session_id: 'session-2',
          exercise_id: 'exercise-1',
          set_number: 3,
          set_type: 'working',
          target_reps: 6,
          actual_reps: 6,
          weight: 72.5,
          is_skipped: 0,
          completed_at: '2026-09-03T12:00:00.000Z',
        },
      ],
    });

    const logs = await getLastWorkingLogsForExercise('exercise-1');

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/ws2\.time_end IS NOT NULL[\s\S]*ORDER BY ws2\.time_end DESC[\s\S]*ORDER BY el\.set_number ASC/),
      ['exercise-1', 'exercise-1']
    );
    expect(mocks.query.mock.calls[0]?.[0]).not.toContain('LIMIT 3');
    expect(logs.map((log) => log.actualReps)).toEqual([6]);
  });
});
