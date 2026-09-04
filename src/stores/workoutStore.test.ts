import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteWorkoutSession: vi.fn(),
  clearWorkoutState: vi.fn(),
  saveWorkoutState: vi.fn(),
}));

vi.mock('../db', () => ({
  exerciseRepo: {},
  workoutRepo: {
    deleteWorkoutSession: mocks.deleteWorkoutSession,
  },
  workoutStateRepo: {
    clearWorkoutState: mocks.clearWorkoutState,
    saveWorkoutState: mocks.saveWorkoutState,
  },
  generateId: vi.fn(() => 'generated-id'),
}));

vi.mock('../lib/sync', () => ({
  pushToCloud: vi.fn(),
}));

import { useWorkoutStore } from './workoutStore';

describe('workout snapshot persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkoutStore.setState({
      session: {
        id: 'session-1',
        dayTypeId: 1,
        direction: 'normal',
        date: '2026-09-04T10:00:00.000Z',
        timeStart: '2026-09-04T10:00:00.000Z',
        timeEnd: null,
        weightBefore: null,
        weightAfter: null,
        totalKg: 0,
        notes: null,
      },
      isActive: true,
      exercises: [],
      currentExerciseIndex: 0,
      _isRestoring: false,
    });
  });

  it('waits for an in-flight snapshot write before clearing a cancelled workout', async () => {
    const events: string[] = [];
    let finishSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      finishSave = resolve;
    });

    mocks.saveWorkoutState.mockImplementation(async () => {
      events.push('save:start');
      await saveGate;
      events.push('save:end');
    });
    mocks.deleteWorkoutSession.mockImplementation(async () => {
      events.push('delete');
    });
    mocks.clearWorkoutState.mockImplementation(async () => {
      events.push('clear');
    });

    useWorkoutStore.getState().setCurrentExercise(0);
    await vi.waitFor(() => expect(events).toEqual(['save:start']));

    const cancellation = useWorkoutStore.getState().cancelWorkout();
    expect(mocks.deleteWorkoutSession).not.toHaveBeenCalled();

    finishSave();
    await cancellation;

    expect(events).toEqual(['save:start', 'save:end', 'delete', 'clear']);
    expect(useWorkoutStore.getState().isActive).toBe(false);
    expect(useWorkoutStore.getState().session).toBeNull();
  });
});
