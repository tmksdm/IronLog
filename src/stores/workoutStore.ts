// src/stores/workoutStore.ts

/**
 * Active workout lifecycle store.
 */

import { create } from 'zustand';
import type {
  DayTypeId,
  Direction,
  ExerciseStatus,
  WorkoutSession,
  WorkoutSnapshot,
  CardioType,
  Exercise,
} from '../types';
import {
  exerciseRepo,
  workoutRepo,
  workoutStateRepo,
  generateId,
} from '../db';
import {
  buildExerciseOrder,
  generateSetsForExercise,
  calculateNextTargetReps,
  getDefaultTargetReps,
  determineWeightChange,
  calculateNewWeight,
  distributeReps,
  type PlannedSet,
} from '../utils';
import { pushToCloud } from '../lib/sync';


// ---- Types ----

export interface ActiveSet extends PlannedSet {
  id: string;
  actualReps: number | null;
  isCompleted: boolean;
}

export interface ActiveExercise {
  exercise: Exercise;
  sets: ActiveSet[];
  status: ExerciseStatus;
  isPriority: boolean;
  originalSets: ActiveSet[] | null;
}

export interface WorkoutState {
  session: WorkoutSession | null;
  isActive: boolean;
  exercises: ActiveExercise[];
  currentExerciseIndex: number;
  restTimerSeconds: number;
  restTimerDefault: number;
  isRestTimerRunning: boolean;
  stopwatchSeconds: number;
  isStopwatchRunning: boolean;
  cardioType: CardioType | null;
  jumpRopeCount: number | null;
  treadmillSeconds: number | null;
  isCardioCompleted: boolean;
  _isRestoring: boolean;

  startWorkout: (
    dayTypeId: DayTypeId,
    direction: Direction,
    weightBefore: number | null
  ) => Promise<void>;
  recordEndTime: () => void;
  finishWorkout: (weightAfter: number | null) => Promise<WorkoutSession | null>;
  cancelWorkout: () => Promise<void>;
  restoreWorkout: (snapshot: WorkoutSnapshot) => void;
  setCurrentExercise: (index: number) => void;
  getCurrentExercise: () => ActiveExercise | null;
  completeSet: (exerciseIndex: number, setIndex: number, actualReps?: number) => void;
  updateSetReps: (exerciseIndex: number, setIndex: number, reps: number) => void;
  skipExercise: (exerciseIndex: number) => void;
  unskipExercise: (exerciseIndex: number) => void;
  saveJumpRope: (count: number) => void;
  saveTreadmill: (seconds: number) => void;
  clearCardio: () => void;
  setRestTimerDefault: (seconds: number) => void;
  startRestTimer: () => void;
  stopRestTimer: () => void;
  tickRestTimer: () => void;
  startStopwatch: () => void;
  stopStopwatch: () => void;
  resetStopwatch: () => void;
  tickStopwatch: () => void;
}

// ---- Helpers ----

function getExerciseStatus(sets: ActiveSet[], isTimed: boolean): ExerciseStatus {
  if (isTimed) return 'not_started';
  if (sets.length === 0) return 'not_started';
  const allCompleted = sets.every((s) => s.isCompleted);
  const anyCompleted = sets.some((s) => s.isCompleted);
  if (allCompleted) return 'completed';
  if (anyCompleted) return 'in_progress';
  return 'not_started';
}

function buildSnapshot(state: WorkoutState): WorkoutSnapshot | null {
  if (!state.session || !state.isActive) return null;
  return {
    session: state.session,
    exercises: state.exercises as any,
    currentExerciseIndex: state.currentExerciseIndex,
    cardioType: state.cardioType,
    jumpRopeCount: state.jumpRopeCount,
    treadmillSeconds: state.treadmillSeconds,
    isCardioCompleted: state.isCardioCompleted,
    restTimerDefault: state.restTimerDefault,
  };
}

function persistState(state: WorkoutState): void {
  if (state._isRestoring) return;
  const snapshot = buildSnapshot(state);
  if (!snapshot) return;
  workoutStateRepo
    .saveWorkoutState(snapshot.session.id, snapshot)
    .catch((err: unknown) => console.error('Failed to persist workout state:', err));
}

/**
 * Safely clone and update an exercise at a given index.
 * Returns a new exercises array, or null if index is out of bounds.
 */
function cloneExerciseAtIndex(
  exercises: ActiveExercise[],
  index: number
): { newExercises: ActiveExercise[]; exercise: ActiveExercise } | null {
  const original = exercises[index];
  if (!original) return null;
  const newExercises = [...exercises];
  const exercise: ActiveExercise = {
    exercise: original.exercise,
    sets: [...original.sets],
    status: original.status,
    isPriority: original.isPriority,
    originalSets: original.originalSets,
  };
  newExercises[index] = exercise;
  return { newExercises, exercise };
}

// ---- Store ----

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  session: null,
  isActive: false,
  exercises: [],
  currentExerciseIndex: 0,
  restTimerSeconds: 0,
  restTimerDefault: 60,
  isRestTimerRunning: false,
  stopwatchSeconds: 0,
  isStopwatchRunning: false,
  cardioType: null,
  jumpRopeCount: null,
  treadmillSeconds: null,
  isCardioCompleted: false,
  _isRestoring: false,

  // =======================================
  // START WORKOUT
  // =======================================
  startWorkout: async (dayTypeId, direction, weightBefore) => {
    try {
      const session = await workoutRepo.createWorkoutSession({
        dayTypeId,
        direction,
        weightBefore,
      });

      const allExercises = await exerciseRepo.getExercisesByDayType(dayTypeId);

      const skippedIds = new Set<string>();
      for (const ex of allExercises) {
        const wasSkipped = await workoutRepo.wasExerciseSkippedLastSession(
          ex.id,
          dayTypeId
        );
        if (wasSkipped) skippedIds.add(ex.id);
      }

      const orderedExercises = buildExerciseOrder(allExercises, skippedIds, direction);

      const activeExercises: ActiveExercise[] = [];
      for (const exercise of orderedExercises) {
        let targetRepsPerSet: number[] | null = null;

        if (!exercise.isTimed) {
          const lastLogs = await workoutRepo.getLastWorkingLogsForExercise(exercise.id);

          if (lastLogs.length > 0) {
            const firstLog = lastLogs[0]!;
            const lastWeight = firstLog.weight;
            const currentWeight = exercise.workingWeight ?? 0;
            const weightChanged = exercise.hasAddedWeight && lastWeight !== currentWeight;

            if (weightChanged) {
              targetRepsPerSet = distributeReps(
                exercise.maxRepsPerSet * exercise.numWorkingSets,
                exercise.numWorkingSets,
                exercise.maxRepsPerSet,
                exercise.minRepsPerSet
              );
            } else {
              const previousTotal = lastLogs.reduce((sum, log) => sum + log.actualReps, 0);
              targetRepsPerSet = calculateNextTargetReps(
                previousTotal,
                exercise.numWorkingSets,
                exercise.maxRepsPerSet,
                exercise.minRepsPerSet
              );
            }
          } else {
            targetRepsPerSet = getDefaultTargetReps(exercise.numWorkingSets);
          }
        }

        const plannedSets = generateSetsForExercise(exercise, targetRepsPerSet);
        const activeSets: ActiveSet[] = plannedSets.map((ps) => ({
          ...ps,
          id: generateId(),
          actualReps: null,
          isCompleted: false,
        }));

        activeExercises.push({
          exercise,
          sets: activeSets,
          status: 'not_started',
          isPriority: skippedIds.has(exercise.id),
          originalSets: null,
        });
      }

      const cardioType: CardioType = dayTypeId === 1 ? 'jump_rope' : 'treadmill_3km';

      set({
        session,
        isActive: true,
        exercises: activeExercises,
        currentExerciseIndex: 0,
        cardioType,
        jumpRopeCount: null,
        treadmillSeconds: null,
        isCardioCompleted: false,
      });

      persistState(get());
    } catch (error) {
      console.error('Failed to start workout:', error);
    }
  },

  // =======================================
  // RESTORE WORKOUT
  // =======================================
  restoreWorkout: (snapshot) => {
    set({
      _isRestoring: true,
      session: snapshot.session,
      isActive: true,
      exercises: snapshot.exercises as any,
      currentExerciseIndex: snapshot.currentExerciseIndex,
      cardioType: snapshot.cardioType,
      jumpRopeCount: snapshot.jumpRopeCount,
      treadmillSeconds: snapshot.treadmillSeconds,
      isCardioCompleted: snapshot.isCardioCompleted,
      restTimerDefault: snapshot.restTimerDefault,
      restTimerSeconds: 0,
      isRestTimerRunning: false,
      stopwatchSeconds: 0,
      isStopwatchRunning: false,
    });
    setTimeout(() => set({ _isRestoring: false }), 0);
  },

  // =======================================
  // RECORD END TIME
  // =======================================
  recordEndTime: () => {
    const { session } = get();
    if (!session || session.timeEnd) return;
    set({ session: { ...session, timeEnd: new Date().toISOString() } });
    persistState(get());
  },

  // =======================================
  // FINISH WORKOUT
  // =======================================
  finishWorkout: async (weightAfter) => {
    const state = get();
    const { session } = state;
    if (!session) return null;

    try {
      for (const activeEx of state.exercises) {
        const isSkippedExercise =
          activeEx.status === 'skipped' ||
          (activeEx.sets.length > 0 && activeEx.sets.every((s) => !s.isCompleted));

        if (isSkippedExercise && activeEx.sets.length > 0) {
          const firstSet = activeEx.sets[0]!;
          await workoutRepo.createExerciseLog({
            workoutSessionId: session.id,
            exerciseId: activeEx.exercise.id,
            setNumber: 1,
            setType: 'working',
            targetReps: firstSet.targetReps,
            actualReps: 0,
            weight: firstSet.weight,
            isSkipped: true,
          });
        } else {
          for (const activeSet of activeEx.sets) {
            if (activeSet.isCompleted) {
              await workoutRepo.createExerciseLog({
                workoutSessionId: session.id,
                exerciseId: activeEx.exercise.id,
                setNumber: activeSet.setNumber,
                setType: activeSet.setType,
                targetReps: activeSet.targetReps,
                actualReps: activeSet.actualReps ?? activeSet.targetReps,
                weight: activeSet.weight,
                isSkipped: false,
              });
            }
          }
        }

        // Weight progression check
        if (activeEx.exercise.hasAddedWeight && activeEx.status === 'completed') {
          const workingSets = activeEx.sets.filter(
            (s) => s.setType === 'working' && s.isCompleted
          );
          const actualReps = workingSets.map((s) => s.actualReps ?? s.targetReps);

          const decision = determineWeightChange(
            actualReps,
            activeEx.exercise.maxRepsPerSet,
            activeEx.exercise.minRepsPerSet
          );

          if (decision !== 'none' && activeEx.exercise.workingWeight !== null) {
            const newWeight = calculateNewWeight(
              activeEx.exercise.workingWeight,
              decision,
              activeEx.exercise.weightIncrement
            );
            await exerciseRepo.updateExercise(activeEx.exercise.id, {
              workingWeight: newWeight,
            });
          }
        }
      }

      // Finish session in DB
      await workoutRepo.finishWorkoutSession(
        session.id,
        weightAfter,
        session.timeEnd ?? new Date().toISOString()
      );

      // Save cardio
      if (state.isCardioCompleted && state.cardioType) {
        await workoutRepo.createCardioLog({
          workoutSessionId: session.id,
          type: state.cardioType,
          durationSeconds:
            state.cardioType === 'treadmill_3km' ? state.treadmillSeconds : null,
          count:
            state.cardioType === 'jump_rope' ? state.jumpRopeCount : null,
        });
      }

      const finishedSession = await workoutRepo.getWorkoutSessionById(session.id);
      await workoutStateRepo.clearWorkoutState();

      // Sync to cloud (fire and forget — don't block UI)
      pushToCloud().catch((err) =>
        console.error('Cloud sync after workout failed:', err)
      );


      set({
        session: finishedSession,
        isActive: false,
        exercises: [],
        currentExerciseIndex: 0,
        isRestTimerRunning: false,
        restTimerSeconds: 0,
        isStopwatchRunning: false,
        stopwatchSeconds: 0,
        cardioType: null,
        jumpRopeCount: null,
        treadmillSeconds: null,
        isCardioCompleted: false,
      });

      return finishedSession;
    } catch (error) {
      console.error('Failed to finish workout:', error);
      return null;
    }
  },

  // =======================================
  // CANCEL WORKOUT
  // =======================================
  cancelWorkout: async () => {
    const { session } = get();
    if (session?.id) {
      try {
        await workoutRepo.deleteWorkoutSession(session.id);
      } catch (error) {
        console.error('Failed to delete cancelled session:', error);
      }
    }
    await workoutStateRepo
      .clearWorkoutState()
      .catch((err: unknown) => console.error('Failed to clear workout state:', err));
    set({
      session: null,
      isActive: false,
      exercises: [],
      currentExerciseIndex: 0,
      isRestTimerRunning: false,
      restTimerSeconds: 0,
      isStopwatchRunning: false,
      stopwatchSeconds: 0,
      cardioType: null,
      jumpRopeCount: null,
      treadmillSeconds: null,
      isCardioCompleted: false,
    });
  },

  // =======================================
  // EXERCISE NAVIGATION
  // =======================================
  setCurrentExercise: (index) => {
    set({ currentExerciseIndex: index });
    persistState(get());
  },

  getCurrentExercise: () => {
    const state = get();
    return state.exercises[state.currentExerciseIndex] ?? null;
  },

  // =======================================
  // SET ACTIONS
  // =======================================
  completeSet: (exerciseIndex, setIndex, actualReps?) => {
    set((state) => {
      const result = cloneExerciseAtIndex(state.exercises, exerciseIndex);
      if (!result) return state;
      const { newExercises, exercise } = result;

      const original = exercise.sets[setIndex];
      if (!original) return state;

      const targetSet: ActiveSet = {
        id: original.id,
        setNumber: original.setNumber,
        setType: original.setType,
        weight: original.weight,
        targetReps: original.targetReps,
        actualReps: actualReps ?? original.targetReps,
        isCompleted: true,
      };
      exercise.sets[setIndex] = targetSet;
      exercise.status = getExerciseStatus(exercise.sets, exercise.exercise.isTimed);

      return { exercises: newExercises };
    });
    persistState(get());
  },

  updateSetReps: (exerciseIndex, setIndex, reps) => {
    set((state) => {
      const result = cloneExerciseAtIndex(state.exercises, exerciseIndex);
      if (!result) return state;
      const { newExercises, exercise } = result;

      const original = exercise.sets[setIndex];
      if (!original) return state;

      const targetSet: ActiveSet = {
        id: original.id,
        setNumber: original.setNumber,
        setType: original.setType,
        weight: original.weight,
        targetReps: original.targetReps,
        actualReps: reps,
        isCompleted: original.isCompleted,
      };
      exercise.sets[setIndex] = targetSet;

      return { exercises: newExercises };
    });
    persistState(get());
  },

  skipExercise: (exerciseIndex) => {
    set((state) => {
      const result = cloneExerciseAtIndex(state.exercises, exerciseIndex);
      if (!result) return state;
      const { newExercises, exercise } = result;

      const currentSets: ActiveSet[] = exercise.sets;
      exercise.originalSets = currentSets.map((s) => {
        const copy: ActiveSet = {
          id: s.id,
          setNumber: s.setNumber,
          setType: s.setType,
          weight: s.weight,
          targetReps: s.targetReps,
          actualReps: s.actualReps,
          isCompleted: s.isCompleted,
        };
        return copy;
      });
      exercise.status = 'skipped';
      exercise.sets = currentSets.map((s) => {
        const copy: ActiveSet = {
          id: s.id,
          setNumber: s.setNumber,
          setType: s.setType,
          weight: s.weight,
          targetReps: s.targetReps,
          actualReps: 0,
          isCompleted: true,
        };
        return copy;
      });

      return { exercises: newExercises };
    });
    persistState(get());
  },

  unskipExercise: (exerciseIndex) => {
    set((state) => {
      const result = cloneExerciseAtIndex(state.exercises, exerciseIndex);
      if (!result) return state;
      const { newExercises, exercise } = result;

      if (exercise.originalSets) {
        exercise.sets = exercise.originalSets;
        exercise.originalSets = null;
      } else {
        const currentSets: ActiveSet[] = exercise.sets;
        exercise.sets = currentSets.map((s) => {
          const copy: ActiveSet = {
            id: s.id,
            setNumber: s.setNumber,
            setType: s.setType,
            weight: s.weight,
            targetReps: s.targetReps,
            actualReps: null,
            isCompleted: false,
          };
          return copy;
        });
      }

      exercise.status = getExerciseStatus(exercise.sets, exercise.exercise.isTimed);
      return { exercises: newExercises };
    });
    persistState(get());
  },


  // =======================================
  // CARDIO
  // =======================================
  saveJumpRope: (count) => {
    set({ jumpRopeCount: count, isCardioCompleted: true });
    persistState(get());
  },

  saveTreadmill: (seconds) => {
    set({ treadmillSeconds: seconds, isCardioCompleted: true });
    persistState(get());
  },

  clearCardio: () => {
    set({ jumpRopeCount: null, treadmillSeconds: null, isCardioCompleted: false });
    persistState(get());
  },

  // =======================================
  // REST TIMER
  // =======================================
  setRestTimerDefault: (seconds) => {
    set({ restTimerDefault: seconds });
    persistState(get());
  },

  startRestTimer: () => {
    const defaultSeconds = get().restTimerDefault;
    set({ restTimerSeconds: defaultSeconds, isRestTimerRunning: true });
  },

  stopRestTimer: () => {
    set({ isRestTimerRunning: false, restTimerSeconds: 0 });
  },

  tickRestTimer: () => {
    set((state) => {
      if (!state.isRestTimerRunning) return state;
      const next = state.restTimerSeconds - 1;
      if (next <= 0) return { restTimerSeconds: 0, isRestTimerRunning: false };
      return { restTimerSeconds: next };
    });
  },

  // =======================================
  // STOPWATCH
  // =======================================
  startStopwatch: () => set({ isStopwatchRunning: true }),
  stopStopwatch: () => set({ isStopwatchRunning: false }),
  resetStopwatch: () => set({ stopwatchSeconds: 0, isStopwatchRunning: false }),
  tickStopwatch: () => {
    set((state) => {
      if (!state.isStopwatchRunning) return state;
      return { stopwatchSeconds: state.stopwatchSeconds + 1 };
    });
  },
}));
