import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('../database', () => ({
  getDb: mocks.getDb,
}));

import {
  getMonthlyJumpRopeCount,
  getYearlyJumpRopeCount,
} from './analyticsRepository';

describe('jump-rope analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue({ query: mocks.query });
  });

  it('returns the monthly average jump count per session', async () => {
    mocks.query.mockResolvedValue({
      values: [{ year: 2026, month: 9, avg_count: 312.5, session_count: 4 }],
    });

    const result = await getMonthlyJumpRopeCount();

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/AVG\(count\)[\s\S]*type = 'jump_rope'[\s\S]*GROUP BY year, month/)
    );
    expect(result).toEqual([
      { year: 2026, month: 9, label: 'Сен 2026', avgCount: 312, sessionCount: 4 },
    ]);
  });

  it('returns the yearly average jump count per session', async () => {
    mocks.query.mockResolvedValue({
      values: [{ year: 2026, avg_count: 300.9, session_count: 8 }],
    });

    const result = await getYearlyJumpRopeCount();

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/AVG\(count\)[\s\S]*type = 'jump_rope'[\s\S]*GROUP BY year/)
    );
    expect(result).toEqual([{ year: 2026, avgCount: 300, sessionCount: 8 }]);
  });
});
