// src/stores/appStore.ts

/**
 * Global application store.
 * Holds day types, next workout info, crash resilience state, and sync status.
 */

import { create } from 'zustand';
import type {
  DayType,
  DayTypeId,
  Direction,
  WorkoutSession,
  WorkoutSnapshot,
  Exercise,
} from '../types';
import {
  dayTypeRepo,
  exerciseRepo,
  workoutRepo,
  workoutStateRepo,
} from '../db';
import { getDirectionForNextSession } from '../utils';
import { pullFromCloud } from '../lib/sync';

export interface AppState {
  // --- Data ---
  dayTypes: DayType[];
  nextDayTypeId: DayTypeId;
  nextDirection: Direction;
  lastSession: WorkoutSession | null;
  isLoading: boolean;
  isInitialized: boolean;

  // --- Sync ---
  isSyncing: boolean;
  lastSyncError: string | null;

  // --- Crash resilience ---
  pendingRestore: WorkoutSnapshot | null;

  // --- Actions ---
  initialize: () => Promise<void>;
  refreshNextDayInfo: () => Promise<void>;
  getExercisesForDayType: (dayTypeId: DayTypeId) => Promise<Exercise[]>;
  getRecentSessions: (limit?: number) => Promise<WorkoutSession[]>;
  clearPendingRestore: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // --- Initial state ---
  dayTypes: [],
  nextDayTypeId: 1,
  nextDirection: 'normal',
  lastSession: null,
  isLoading: false,
  isInitialized: false,
  isSyncing: false,
  lastSyncError: null,
  pendingRestore: null,

  initialize: async () => {
    if (get().isInitialized) return;

    set({ isLoading: true });
    try {
      // Pull cloud data first (replaces local if cloud has data)
      set({ isSyncing: true, lastSyncError: null });
      try {
        await pullFromCloud();
      } catch (err: any) {
        console.error('Cloud sync failed, using local data:', err);
        set({ lastSyncError: err?.message ?? 'Sync failed' });
      } finally {
        set({ isSyncing: false });
      }

      const dayTypes = await dayTypeRepo.getAllDayTypes();
      const nextDayTypeId = await dayTypeRepo.getNextDayTypeId();

      // Direction is global: based on the LAST session of ANY type
      const allSessions = await workoutRepo.getAllSessions(1);
      const lastSession = allSessions.length > 0 ? allSessions[0] : null;
      const nextDirection = getDirectionForNextSession(
        lastSession?.direction ?? null
      );

      // Check for saved workout state (crash resilience)
      let pendingRestore: WorkoutSnapshot | null = null;
      try {
        const snapshot = await workoutStateRepo.loadWorkoutState();
        if (snapshot) {
          const sessionExists = await workoutRepo.getWorkoutSessionById(
            snapshot.session.id
          );
          if (sessionExists && !sessionExists.timeEnd) {
            pendingRestore = snapshot;
          } else {
            await workoutStateRepo.clearWorkoutState();
          }
        }
      } catch (err) {
        console.error('Failed to check for saved workout state:', err);
      }

      set({
        dayTypes,
        nextDayTypeId,
        nextDirection,
        lastSession,
        isLoading: false,
        isInitialized: true,
        pendingRestore,
      });
    } catch (error) {
      console.error('Failed to initialize app store:', error);
      set({ isLoading: false });
    }
  },

  refreshNextDayInfo: async () => {
    try {
      const nextDayTypeId = await dayTypeRepo.getNextDayTypeId();
      const allSessions = await workoutRepo.getAllSessions(1);
      const lastSession = allSessions.length > 0 ? allSessions[0] : null;
      const nextDirection = getDirectionForNextSession(
        lastSession?.direction ?? null
      );
      set({ nextDayTypeId, nextDirection, lastSession });
    } catch (error) {
      console.error('Failed to refresh next day info:', error);
    }
  },

  getExercisesForDayType: async (dayTypeId: DayTypeId) => {
    return exerciseRepo.getExercisesByDayType(dayTypeId);
  },

  getRecentSessions: async (limit?: number) => {
    return workoutRepo.getAllSessions(limit);
  },

  clearPendingRestore: () => {
    set({ pendingRestore: null });
  },
}));
