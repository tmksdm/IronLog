import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('../database', () => ({
  getDb: mocks.getDb,
  generateId: vi.fn(),
  saveToStore: vi.fn(),
}));

vi.mock('../../lib/sync', () => ({
  flushPendingCloudDeletions: vi.fn(),
  queueCloudDeletion: vi.fn(),
}));

import { getMonthlyPullups, getYearlyPullups } from './pullupRepository';

describe('pull-up analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue({ query: mocks.query });
  });

  it('averages totals grouped by whole standalone or linked sessions each month', async () => {
    mocks.query.mockResolvedValue({
      values: [{ year: 2026, month: 9, avg_reps: 37.5, session_count: 4 }],
    });

    const result = await getMonthlyPullups();
    const sql = mocks.query.mock.calls[0]?.[0] as string;

    expect(sql).toMatch(/AVG\(session_total_reps\)/);
    expect(sql).toMatch(/'workout:' \|\| workout_session_id/);
    expect(sql).toMatch(/'standalone:' \|\| date/);
    expect(sql).toMatch(/SUM\(reps\) as session_total_reps/);
    expect(sql).toMatch(/GROUP BY year, month, session_key/);
    expect(result).toEqual([
      { year: 2026, month: 9, label: 'Сен 2026', avgReps: 37.5, sessionCount: 4 },
    ]);
  });

  it('averages session totals directly across the year', async () => {
    mocks.query.mockResolvedValue({
      values: [{ year: 2026, avg_reps: 40.25, session_count: 12 }],
    });

    const result = await getYearlyPullups();
    const sql = mocks.query.mock.calls[0]?.[0] as string;

    expect(sql).toMatch(/AVG\(session_total_reps\)/);
    expect(sql).toMatch(/GROUP BY year, session_key/);
    expect(result).toEqual([{ year: 2026, avgReps: 40.25, sessionCount: 12 }]);
  });
});
