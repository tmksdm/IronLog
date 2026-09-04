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
