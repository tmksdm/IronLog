// src/lib/sync.ts

/**
 * Cloud sync module — pushes local data to Supabase and pulls cloud data to local SQLite.
 * Strategy: Supabase is the source of truth. Full replace on pull, upsert on push.
 */

import { supabase } from './supabase';
import { getDb, saveToStore } from '../db/database';

// ==========================================
// Types for Supabase rows (snake_case + user_id)
// ==========================================

interface SupabaseExercise {
  id: string;
  user_id: string;
  day_type_id: number;
  name: string;
  sort_order: number;
  has_added_weight: number;
  working_weight: number | null;
  weight_increment: number;
  warmup_1_percent: number | null;
  warmup_2_percent: number | null;
  warmup_1_reps: number;
  warmup_2_reps: number;
  max_reps_per_set: number;
  min_reps_per_set: number;
  num_working_sets: number;
  is_timed: number;
  timer_duration_seconds: number | null;
  timer_prep_seconds: number | null;
  is_active: number;
}

interface SupabaseSession {
  id: string;
  user_id: string;
  day_type_id: number;
  date: string;
  direction: string;
  weight_before: number | null;
  weight_after: number | null;
  time_start: string;
  time_end: string | null;
  total_kg: number;
  notes: string | null;
}

interface SupabaseExerciseLog {
  id: string;
  user_id: string;
  workout_session_id: string;
  exercise_id: string;
  set_number: number;
  set_type: string;
  target_reps: number;
  actual_reps: number;
  weight: number;
  is_skipped: number;
  completed_at: string | null;
}

interface SupabaseCardioLog {
  id: string;
  user_id: string;
  workout_session_id: string;
  type: string;
  duration_seconds: number | null;
  count: number | null;
}

// ==========================================
// Get current user ID
// ==========================================

async function getUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// ==========================================
// PUSH: Local SQLite → Supabase
// ==========================================

/**
 * Push all local data to Supabase (upsert = insert or update).
 * Called after import, after finishing a workout, after exercise edits.
 */
export async function pushToCloud(): Promise<void> {
  const userId = await getUserId();
  if (!userId) {
    console.warn('pushToCloud: no authenticated user, skipping');
    return;
  }

  const db = await getDb();

  try {
    // 1. Push exercises
    const exercisesResult = await db.query(
      'SELECT * FROM exercises ORDER BY day_type_id, sort_order'
    );
    const exercises = (exercisesResult.values ?? []) as any[];

    if (exercises.length > 0) {
      const rows: SupabaseExercise[] = exercises.map((e) => ({
        id: e.id,
        user_id: userId,
        day_type_id: e.day_type_id,
        name: e.name,
        sort_order: e.sort_order,
        has_added_weight: e.has_added_weight,
        working_weight: e.working_weight,
        weight_increment: e.weight_increment,
        warmup_1_percent: e.warmup_1_percent,
        warmup_2_percent: e.warmup_2_percent,
        warmup_1_reps: e.warmup_1_reps,
        warmup_2_reps: e.warmup_2_reps,
        max_reps_per_set: e.max_reps_per_set,
        min_reps_per_set: e.min_reps_per_set,
        num_working_sets: e.num_working_sets,
        is_timed: e.is_timed,
        timer_duration_seconds: e.timer_duration_seconds,
        timer_prep_seconds: e.timer_prep_seconds,
        is_active: e.is_active,
      }));

      const { error } = await supabase
        .from('exercises')
        .upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Push exercises failed: ${error.message}`);
    }

    // 2. Push workout sessions
    const sessionsResult = await db.query(
      'SELECT * FROM workout_sessions ORDER BY date'
    );
    const sessions = (sessionsResult.values ?? []) as any[];

    if (sessions.length > 0) {
      const rows: SupabaseSession[] = sessions.map((s) => ({
        id: s.id,
        user_id: userId,
        day_type_id: s.day_type_id,
        date: s.date,
        direction: s.direction,
        weight_before: s.weight_before,
        weight_after: s.weight_after,
        time_start: s.time_start,
        time_end: s.time_end,
        total_kg: s.total_kg,
        notes: s.notes,
      }));

      const { error } = await supabase
        .from('workout_sessions')
        .upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Push sessions failed: ${error.message}`);
    }

    // 3. Push exercise logs
    const logsResult = await db.query(
      'SELECT * FROM exercise_logs ORDER BY workout_session_id, set_number'
    );
    const logs = (logsResult.values ?? []) as any[];

    if (logs.length > 0) {
      // Supabase has a limit on request size, so batch in chunks of 500
      const BATCH_SIZE = 500;
      for (let i = 0; i < logs.length; i += BATCH_SIZE) {
        const batch = logs.slice(i, i + BATCH_SIZE);
        const rows: SupabaseExerciseLog[] = batch.map((l: any) => ({
          id: l.id,
          user_id: userId,
          workout_session_id: l.workout_session_id,
          exercise_id: l.exercise_id,
          set_number: l.set_number,
          set_type: l.set_type,
          target_reps: l.target_reps,
          actual_reps: l.actual_reps,
          weight: l.weight,
          is_skipped: l.is_skipped,
          completed_at: l.completed_at,
        }));

        const { error } = await supabase
          .from('exercise_logs')
          .upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Push exercise_logs batch failed: ${error.message}`);
      }
    }

    // 4. Push cardio logs
    const cardioResult = await db.query(
      'SELECT * FROM cardio_logs ORDER BY workout_session_id'
    );
    const cardioLogs = (cardioResult.values ?? []) as any[];

    if (cardioLogs.length > 0) {
      const rows: SupabaseCardioLog[] = cardioLogs.map((c) => ({
        id: c.id,
        user_id: userId,
        workout_session_id: c.workout_session_id,
        type: c.type,
        duration_seconds: c.duration_seconds,
        count: c.count,
      }));

      const { error } = await supabase
        .from('cardio_logs')
        .upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Push cardio_logs failed: ${error.message}`);
    }

    console.log('pushToCloud: success');
  } catch (error) {
    console.error('pushToCloud error:', error);
    throw error;
  }
}

// ==========================================
// PULL: Supabase → Local SQLite
// ==========================================

/**
 * Pull all data from Supabase and replace local SQLite.
 * Called on app startup after login.
 */
export async function pullFromCloud(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) {
    console.warn('pullFromCloud: no authenticated user, skipping');
    return false;
  }

  try {
    // Fetch all data from Supabase
    const [exercisesRes, sessionsRes, logsRes, cardioRes] = await Promise.all([
      supabase.from('exercises').select('*').eq('user_id', userId),
      supabase.from('workout_sessions').select('*').eq('user_id', userId),
      supabase.from('exercise_logs').select('*').eq('user_id', userId),
      supabase.from('cardio_logs').select('*').eq('user_id', userId),
    ]);

    if (exercisesRes.error) throw new Error(`Fetch exercises: ${exercisesRes.error.message}`);
    if (sessionsRes.error) throw new Error(`Fetch sessions: ${sessionsRes.error.message}`);
    if (logsRes.error) throw new Error(`Fetch logs: ${logsRes.error.message}`);
    if (cardioRes.error) throw new Error(`Fetch cardio: ${cardioRes.error.message}`);

    const exercises = exercisesRes.data ?? [];
    const sessions = sessionsRes.data ?? [];
    const logs = logsRes.data ?? [];
    const cardio = cardioRes.data ?? [];

    // If cloud is empty, don't wipe local data
    if (exercises.length === 0 && sessions.length === 0) {
      console.log('pullFromCloud: cloud is empty, keeping local data');
      return false;
    }

    // Replace local SQLite with cloud data
    const db = await getDb();
    await db.execute('PRAGMA foreign_keys = OFF;');

    try {
      // Clear local data
      await db.execute('DELETE FROM active_workout_state;');
      await db.execute('DELETE FROM cardio_logs;');
      await db.execute('DELETE FROM exercise_logs;');
      await db.execute('DELETE FROM workout_sessions;');
      await db.execute('DELETE FROM exercises;');

      // Insert exercises
      for (const e of exercises) {
        await db.run(
          `INSERT INTO exercises
            (id, day_type_id, name, sort_order, has_added_weight,
             working_weight, weight_increment, warmup_1_percent, warmup_2_percent,
             warmup_1_reps, warmup_2_reps, max_reps_per_set, min_reps_per_set,
             num_working_sets, is_timed, timer_duration_seconds, timer_prep_seconds,
             is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            e.id, e.day_type_id, e.name, e.sort_order, e.has_added_weight,
            e.working_weight, e.weight_increment, e.warmup_1_percent, e.warmup_2_percent,
            e.warmup_1_reps, e.warmup_2_reps, e.max_reps_per_set, e.min_reps_per_set,
            e.num_working_sets, e.is_timed, e.timer_duration_seconds, e.timer_prep_seconds,
            e.is_active,
          ]
        );
      }

      // Insert sessions
      for (const s of sessions) {
        await db.run(
          `INSERT INTO workout_sessions
            (id, day_type_id, date, direction, weight_before, weight_after,
             time_start, time_end, total_kg, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.id, s.day_type_id, s.date, s.direction, s.weight_before, s.weight_after,
            s.time_start, s.time_end, s.total_kg, s.notes,
          ]
        );
      }

      // Insert exercise logs
      for (const l of logs) {
        await db.run(
          `INSERT INTO exercise_logs
            (id, workout_session_id, exercise_id, set_number, set_type,
             target_reps, actual_reps, weight, is_skipped, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            l.id, l.workout_session_id, l.exercise_id, l.set_number, l.set_type,
            l.target_reps, l.actual_reps, l.weight, l.is_skipped, l.completed_at,
          ]
        );
      }

      // Insert cardio logs
      for (const c of cardio) {
        await db.run(
          `INSERT INTO cardio_logs
            (id, workout_session_id, type, duration_seconds, count)
           VALUES (?, ?, ?, ?, ?)`,
          [c.id, c.workout_session_id, c.type, c.duration_seconds, c.count]
        );
      }
    } finally {
      await db.execute('PRAGMA foreign_keys = ON;');
      await saveToStore();
    }

    console.log(
      `pullFromCloud: synced ${exercises.length} exercises, ` +
      `${sessions.length} sessions, ${logs.length} logs, ${cardio.length} cardio`
    );
    return true;
  } catch (error) {
    console.error('pullFromCloud error:', error);
    // Don't throw — app should still work with local data
    return false;
  }
}

// ==========================================
// DELETE helpers (for workout deletion sync)
// ==========================================

/**
 * Delete a workout session and its logs from Supabase.
 */
export async function deleteSessionFromCloud(sessionId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    // exercise_logs and cardio_logs have ON DELETE CASCADE in Supabase,
    // so deleting the session will cascade-delete related logs
    const { error } = await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) console.error('deleteSessionFromCloud error:', error.message);
  } catch (error) {
    console.error('deleteSessionFromCloud error:', error);
  }
}

/**
 * Delete an exercise and its logs from Supabase.
 */
export async function deleteExerciseFromCloud(exerciseId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    // First delete exercise_logs for this exercise
    await supabase
      .from('exercise_logs')
      .delete()
      .eq('exercise_id', exerciseId)
      .eq('user_id', userId);

    // Then delete the exercise itself
    const { error } = await supabase
      .from('exercises')
      .delete()
      .eq('id', exerciseId)
      .eq('user_id', userId);

    if (error) console.error('deleteExerciseFromCloud error:', error.message);
  } catch (error) {
    console.error('deleteExerciseFromCloud error:', error);
  }
}
