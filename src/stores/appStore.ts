// src/stores/appStore.ts

/**
 * Global application store.
 *
 * App always starts on LOCAL data (instant).
 * Cloud pull only happens if local DB is empty (new device / reinstall).
 * Cloud push happens after workout finish, import, exercise edits.
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
      // 1. Load from LOCAL data first — instant, no network
      const dayTypes = await dayTypeRepo.getAllDayTypes();
      const nextDayTypeId = await dayTypeRepo.getNextDayTypeId();

      const allSessions = await workoutRepo.getAllSessions(1);
      const lastSession = allSessions.length > 0 ? allSessions[0] : null;
      const nextDirection = getDirectionForNextSession(
        lastSession?.direction ?? null
      );

      // Check for crash-resilience snapshot
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

      // Show the app immediately
      set({
        dayTypes,
        nextDayTypeId,
        nextDirection,
        lastSession,
        isLoading: false,
        isInitialized: true,
        pendingRestore,
      });

      // 2. Try cloud pull in background.
      // pullFromCloud() internally checks: if local has data → skips.
      // Only pulls if local is empty (new device / reinstall).
      set({ isSyncing: true, lastSyncError: null });
      pullFromCloud()
        .then(async (hadChanges) => {
          if (hadChanges) {
            // Restored from cloud into empty local DB — refresh UI
            await get().refreshNextDayInfo();
            console.log('Restored data from cloud (local was empty)');
          }
        })
        .catch((err: any) => {
          // Server unreachable — no problem, local data is fine
          console.error('Cloud sync failed:', err);
          set({ lastSyncError: err?.message ?? 'Sync failed' });
        })
        .finally(() => {
          set({ isSyncing: false });
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
