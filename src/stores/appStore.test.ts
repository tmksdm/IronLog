import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllDayTypes: vi.fn(),
  getNextDayTypeId: vi.fn(),
  getAllSessions: vi.fn(),
  loadWorkoutState: vi.fn(),
  pullFromCloud: vi.fn(),
}));

vi.mock('../db', () => ({
  dayTypeRepo: {
    getAllDayTypes: mocks.getAllDayTypes,
    getNextDayTypeId: mocks.getNextDayTypeId,
  },
  exerciseRepo: {},
  workoutRepo: {
    getAllSessions: mocks.getAllSessions,
  },
  workoutStateRepo: {
    loadWorkoutState: mocks.loadWorkoutState,
  },
}));

vi.mock('../lib/sync', () => ({
  pullFromCloud: mocks.pullFromCloud,
}));

import { useAppStore } from './appStore';

describe('app initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      isLoading: false,
      isInitialized: false,
      initializationError: null,
    });
    mocks.getNextDayTypeId.mockResolvedValue(1);
    mocks.getAllSessions.mockResolvedValue([]);
    mocks.loadWorkoutState.mockResolvedValue(null);
    mocks.pullFromCloud.mockResolvedValue(false);
  });

  it('does not open SQLite twice during concurrent startup effects', async () => {
    let finishLoad!: (value: []) => void;
    mocks.getAllDayTypes.mockImplementation(
      () => new Promise<[]>((resolve) => {
        finishLoad = resolve;
      })
    );

    const first = useAppStore.getState().initialize();
    const second = useAppStore.getState().initialize();
    finishLoad([]);
    await Promise.all([first, second]);

    expect(mocks.getAllDayTypes).toHaveBeenCalledOnce();
    expect(useAppStore.getState().isInitialized).toBe(true);
  });

  it('exposes a retryable error instead of leaving a permanent loading screen', async () => {
    mocks.getAllDayTypes.mockRejectedValue(new Error('database unavailable'));

    await useAppStore.getState().initialize();

    expect(useAppStore.getState()).toMatchObject({
      isLoading: false,
      isInitialized: false,
      initializationError: 'database unavailable',
    });
  });
});
