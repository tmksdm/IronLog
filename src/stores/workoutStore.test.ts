import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkoutSession: vi.fn(),
  deleteWorkoutSession: vi.fn(),
  getExercisesByDayType: vi.fn(),
  updateExercise: vi.fn(),
  getLastWorkingLogsForExercise: vi.fn(),
  wasExerciseSkippedLastSession: vi.fn(),
  clearWorkoutState: vi.fn(),
  saveWorkoutState: vi.fn(),
}));

vi.mock('../db', () => ({
  exerciseRepo: {
    getExercisesByDayType: mocks.getExercisesByDayType,
    updateExercise: mocks.updateExercise,
  },
  workoutRepo: {
    createWorkoutSession: mocks.createWorkoutSession,
    deleteWorkoutSession: mocks.deleteWorkoutSession,
    getLastWorkingLogsForExercise: mocks.getLastWorkingLogsForExercise,
    wasExerciseSkippedLastSession: mocks.wasExerciseSkippedLastSession,
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

describe('previous working-set results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createWorkoutSession.mockResolvedValue({
      id: 'session-2',
      dayTypeId: 1,
      direction: 'normal',
      date: '2026-09-05T10:00:00.000Z',
      timeStart: '2026-09-05T10:00:00.000Z',
      timeEnd: null,
      weightBefore: null,
      weightAfter: null,
      totalKg: 0,
      notes: null,
    });
    mocks.getExercisesByDayType.mockResolvedValue([{
      id: 'exercise-1',
      dayTypeId: 1,
      name: 'Жим лёжа',
      sortOrder: 1,
      hasAddedWeight: true,
      workingWeight: 52.5,
      weightIncrement: 2.5,
      warmup1Percent: null,
      warmup2Percent: null,
      warmup1Reps: 12,
      warmup2Reps: 10,
      maxRepsPerSet: 8,
      minRepsPerSet: 4,
      numWorkingSets: 3,
      isTimed: false,
      timerDurationSeconds: null,
      timerPrepSeconds: null,
      isActive: true,
    }]);
    mocks.wasExerciseSkippedLastSession.mockResolvedValue(false);
    mocks.getLastWorkingLogsForExercise.mockResolvedValue([
      { weight: 50, actualReps: 7 },
      { weight: 50, actualReps: 7 },
      { weight: 50, actualReps: 6 },
    ]);
  });

  it('keeps the previous working weight together with its reps', async () => {
    await useWorkoutStore.getState().startWorkout(1, 'normal', null);

    expect(useWorkoutStore.getState().exercises[0]).toMatchObject({
      previousWorkingWeight: 50,
      previousWorkingReps: [7, 7, 6],
    });
  });
});

describe('exercise rename during workout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateExercise.mockResolvedValue(undefined);
    mocks.saveWorkoutState.mockResolvedValue(undefined);
    useWorkoutStore.setState({
      session: {
        id: 'session-rename',
        dayTypeId: 1,
        direction: 'normal',
        date: '2026-09-05T10:00:00.000Z',
        timeStart: '2026-09-05T10:00:00.000Z',
        timeEnd: null,
        weightBefore: null,
        weightAfter: null,
        totalKg: 0,
        notes: null,
      },
      isActive: true,
      exercises: [{
        exercise: {
          id: 'exercise-rename',
          dayTypeId: 1,
          name: 'Жим лежа',
          sortOrder: 1,
          hasAddedWeight: true,
          workingWeight: 50,
          weightIncrement: 2.5,
          warmup1Percent: null,
          warmup2Percent: null,
          warmup1Reps: 12,
          warmup2Reps: 10,
          maxRepsPerSet: 8,
          minRepsPerSet: 4,
          numWorkingSets: 3,
          isTimed: false,
          timerDurationSeconds: null,
          timerPrepSeconds: null,
          isActive: true,
        },
        sets: [],
        status: 'not_started',
        isPriority: false,
        originalSets: null,
      }],
      currentExerciseIndex: 0,
      _isRestoring: false,
    });
  });

  it('updates the exercise repository and active workout snapshot', async () => {
    await useWorkoutStore.getState().renameExercise(0, '  Жим лёжа  ');

    expect(mocks.updateExercise).toHaveBeenCalledWith('exercise-rename', {
      name: 'Жим лёжа',
    });
    expect(useWorkoutStore.getState().exercises[0]?.exercise.name).toBe('Жим лёжа');
    await vi.waitFor(() => expect(mocks.saveWorkoutState).toHaveBeenCalled());
    expect(mocks.saveWorkoutState.mock.calls.at(-1)?.[1].exercises[0].exercise.name)
      .toBe('Жим лёжа');
  });

  it('keeps the active name unchanged when local saving fails', async () => {
    mocks.updateExercise.mockRejectedValueOnce(new Error('SQLite failure'));

    await expect(useWorkoutStore.getState().renameExercise(0, 'Новое название'))
      .rejects.toThrow('SQLite failure');
    expect(useWorkoutStore.getState().exercises[0]?.exercise.name).toBe('Жим лежа');
  });
});
