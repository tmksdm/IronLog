// src/lib/sync.ts

/**
 * Cloud sync module — pushes local data to Supabase and pulls cloud data to local SQLite.
 * Strategy: Supabase is the source of truth. Full replace on pull, upsert on push.
 */

import { supabase } from './supabase';
import { getDb, saveToStore } from '../db/database';
import { hasMeaningfulLocalData, isCloudBackupEmpty } from './syncPolicy';

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
  workout_session_id: string | null;
  date: string | null;
  type: string;
  duration_seconds: number | null;
  count: number | null;
  succeeded: number | null;
}

interface SupabasePullupLog {
  id: string;
  user_id: string;
  workout_session_id: string | null;
  date: string | null;
  pullup_day: number;
  effective_day: number;
  set_number: number;
  reps: number;
  grip_type: string | null;
  target_reps: number | null;
  succeeded: number;
  total_reps: number;
  skipped: number;
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
    await flushPendingCloudDeletions();

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
      const rows: SupabaseCardioLog[] = cardioLogs.map((c: any) => ({
        id: c.id,
        user_id: userId,
        workout_session_id: c.workout_session_id,
        date: c.date,
        type: c.type,
        duration_seconds: c.duration_seconds,
        count: c.count,
        succeeded: c.succeeded ?? null,
      }));

      const { error } = await supabase
        .from('cardio_logs')
        .upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Push cardio_logs failed: ${error.message}`);
    }

    // 5. Push pullup logs
    const pullupResult = await db.query(
      'SELECT * FROM pullup_logs ORDER BY workout_session_id, set_number'
    );
    const pullupLogs = (pullupResult.values ?? []) as any[];

    if (pullupLogs.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < pullupLogs.length; i += BATCH_SIZE) {
        const batch = pullupLogs.slice(i, i + BATCH_SIZE);
        const rows: SupabasePullupLog[] = batch.map((p: any) => ({
          id: p.id,
          user_id: userId,
          workout_session_id: p.workout_session_id,
          date: p.date,
          pullup_day: p.pullup_day,
          effective_day: p.effective_day,
          set_number: p.set_number,
          reps: p.reps,
          grip_type: p.grip_type ?? null,
          target_reps: p.target_reps ?? null,
          succeeded: p.succeeded,
          total_reps: p.total_reps,
          skipped: p.skipped,
        }));

        const { error } = await supabase
          .from('pullup_logs')
          .upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Push pullup_logs batch failed: ${error.message}`);
      }
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
 * Pull data from Supabase into local SQLite.
 *
 * ONLY pulls if local database is empty (no exercises AND no sessions).
 * This covers: first launch, reinstall, new device.
 * In normal usage (same device), local data is always authoritative
 * and cloud is just a backup populated by pushToCloud().
 */
export async function pullFromCloud(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) {
    console.warn('pullFromCloud: no authenticated user, skipping');
    return false;
  }

  // Never restore stale cloud rows over deletions made while offline.
  await flushPendingCloudDeletions();

  const db = await getDb();
  const countQueries = await Promise.all([
    db.query('SELECT COUNT(*) as cnt FROM workout_sessions'),
    db.query("SELECT COUNT(*) as cnt FROM exercises WHERE id NOT LIKE 'seed-%'"),
    db.query('SELECT COUNT(*) as cnt FROM cardio_logs'),
    db.query('SELECT COUNT(*) as cnt FROM pullup_logs'),
    db.query('SELECT COUNT(*) as cnt FROM active_workout_state'),
    db.query('SELECT COUNT(*) as cnt FROM pullup_active_state'),
    db.query('SELECT COUNT(*) as cnt FROM cloud_delete_queue'),
  ]);
  const countAt = (index: number) => Number(countQueries[index]?.values?.[0]?.cnt ?? 0);
  const hasLocalData = hasMeaningfulLocalData({
    workoutSessions: countAt(0),
    userExercises: countAt(1),
    cardioLogs: countAt(2),
    pullupLogs: countAt(3),
    activeWorkouts: countAt(4),
    activePullups: countAt(5),
    pendingDeletes: countAt(6),
  });

  if (hasLocalData) {
    console.log('pullFromCloud: real local data exists, skipping (local is authoritative)');
    return false;
  }

  // Local is empty — pull everything from cloud (new device / reinstall)
  console.log('pullFromCloud: local database is empty, pulling from cloud...');

  try {
    // Fetch all data from Supabase
    const [exercisesRes, sessionsRes, logsRes, cardioRes, pullupRes] = await Promise.all([
      supabase.from('exercises').select('*').eq('user_id', userId),
      supabase.from('workout_sessions').select('*').eq('user_id', userId),
      supabase.from('exercise_logs').select('*').eq('user_id', userId),
      supabase.from('cardio_logs').select('*').eq('user_id', userId),
      supabase.from('pullup_logs').select('*').eq('user_id', userId),
    ]);

    if (exercisesRes.error) throw new Error(`Fetch exercises: ${exercisesRes.error.message}`);
    if (sessionsRes.error) throw new Error(`Fetch sessions: ${sessionsRes.error.message}`);
    if (logsRes.error) throw new Error(`Fetch logs: ${logsRes.error.message}`);
    if (cardioRes.error) throw new Error(`Fetch cardio: ${cardioRes.error.message}`);
    if (pullupRes.error) throw new Error(`Fetch pullups: ${pullupRes.error.message}`);

    const exercises = exercisesRes.data ?? [];
    const sessions = sessionsRes.data ?? [];
    const logs = logsRes.data ?? [];
    const cardio = cardioRes.data ?? [];
    const pullups = pullupRes.data ?? [];

    // If cloud is also empty, nothing to do
    if (isCloudBackupEmpty({
      exercises: exercises.length,
      workoutSessions: sessions.length,
      exerciseLogs: logs.length,
      cardioLogs: cardio.length,
      pullupLogs: pullups.length,
    })) {
      console.log('pullFromCloud: cloud is also empty, nothing to pull');
      return false;
    }

    // Insert cloud data into local SQLite
    await db.execute('PRAGMA foreign_keys = OFF;');

    try {
      // Clear local data (should be empty already, but just in case)
      await db.execute('DELETE FROM active_workout_state;');
      await db.execute('DELETE FROM pullup_logs;');
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

      // Build lookup: session id -> date, to backfill the 'date' column
      // on cardio/pullup logs (v0.18.0+). Cloud rows may not carry 'date'.
      const sessionDateById = new Map<string, string>();
      for (const s of sessions as any[]) {
        if (s.id) sessionDateById.set(String(s.id), String(s.date ?? s.time_start ?? ''));
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
        const cardioDate =
          (c as any).date ?? sessionDateById.get(String(c.workout_session_id)) ?? null;
        await db.run(
          `INSERT INTO cardio_logs
            (id, workout_session_id, date, type, duration_seconds, count, succeeded)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            c.id,
            c.workout_session_id,
            cardioDate,
            c.type,
            c.duration_seconds,
            c.count,
            (c as any).succeeded ?? null,
          ]
        );
      }

      // Insert pullup logs
      for (const p of pullups) {
        const pullupDate =
          (p as any).date ?? sessionDateById.get(String(p.workout_session_id)) ?? null;
        await db.run(
          `INSERT INTO pullup_logs
            (id, workout_session_id, date, pullup_day, effective_day, set_number, reps,
             grip_type, target_reps, succeeded, total_reps, skipped)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id, p.workout_session_id, pullupDate, p.pullup_day, p.effective_day,
            p.set_number, p.reps, p.grip_type ?? null, p.target_reps ?? null,
            p.succeeded, p.total_reps, p.skipped,
          ]
        );
      }
    } finally {
      await db.execute('PRAGMA foreign_keys = ON;');
      await saveToStore();
    }

    console.log(
      `pullFromCloud: restored ${exercises.length} exercises, ` +
      `${sessions.length} sessions, ${logs.length} logs, ` +
      `${cardio.length} cardio, ${pullups.length} pullups`
    );
    return true;
  } catch (error) {
    console.error('pullFromCloud error:', error);
    return false;
  }
}


// ==========================================
// DELETE helpers (for workout deletion sync)
// ==========================================

export type CloudDeletionType =
  | 'session'
  | 'all_sessions'
  | 'exercise'
  | 'cardio_log'
  | 'pullup_log';

interface CloudDeletionRow {
  entity_type: CloudDeletionType;
  entity_id: string;
}

export async function queueCloudDeletion(
  entityType: CloudDeletionType,
  entityId: string
): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT OR IGNORE INTO cloud_delete_queue (entity_type, entity_id, created_at)
     VALUES (?, ?, ?)`,
    [entityType, entityId, new Date().toISOString()]
  );
  await saveToStore();
}

export async function flushPendingCloudDeletions(): Promise<number> {
  const userId = await getUserId();
  if (!userId) return 0;

  const db = await getDb();
  const result = await db.query(
    'SELECT entity_type, entity_id FROM cloud_delete_queue ORDER BY created_at'
  );
  const pending = (result.values ?? []) as CloudDeletionRow[];
  let completed = 0;

  for (const item of pending) {
    switch (item.entity_type) {
      case 'session':
        await deleteSessionFromCloud(item.entity_id);
        break;
      case 'all_sessions':
        await deleteAllSessionsFromCloud();
        break;
      case 'exercise':
        await deleteExerciseFromCloud(item.entity_id);
        break;
      case 'cardio_log':
        await deleteCardioLogFromCloud(item.entity_id);
        break;
      case 'pullup_log':
        await deletePullupLogsFromCloud([item.entity_id]);
        break;
    }

    await db.run(
      'DELETE FROM cloud_delete_queue WHERE entity_type = ? AND entity_id = ?',
      [item.entity_type, item.entity_id]
    );
    completed += 1;
  }

  if (completed > 0) await saveToStore();
  return completed;
}

/**
 * Delete a workout session and its logs from Supabase.
 */
export async function deleteSessionFromCloud(sessionId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Cannot delete cloud session without an authenticated user');

  // Delete pullup_logs for this session
  const { error: pullupError } = await supabase
      .from('pullup_logs')
      .delete()
      .eq('workout_session_id', sessionId)
      .eq('user_id', userId);
  if (pullupError) throw pullupError;

  // Delete cardio_logs for this session
  const { error: cardioError } = await supabase
      .from('cardio_logs')
      .delete()
      .eq('workout_session_id', sessionId)
      .eq('user_id', userId);
  if (cardioError) throw cardioError;

  // Delete exercise_logs for this session
  const { error: logsError } = await supabase
      .from('exercise_logs')
      .delete()
      .eq('workout_session_id', sessionId)
      .eq('user_id', userId);
  if (logsError) throw logsError;

  // Delete the session itself
  const { error } = await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Delete an exercise and its logs from Supabase.
 */
export async function deleteExerciseFromCloud(exerciseId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Cannot delete cloud exercise without an authenticated user');

  // First delete exercise_logs for this exercise
  const { error: logsError } = await supabase
      .from('exercise_logs')
      .delete()
      .eq('exercise_id', exerciseId)
      .eq('user_id', userId);
  if (logsError) throw logsError;

  // Then delete the exercise itself
  const { error } = await supabase
      .from('exercises')
      .delete()
      .eq('id', exerciseId)
      .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Delete ALL workout sessions (and cascading logs) from Supabase for the current user.
 */
export async function deleteAllSessionsFromCloud(): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Cannot delete cloud sessions without an authenticated user');

    // Delete all pullup_logs for this user
    const { error: pullupError } = await supabase
      .from('pullup_logs')
      .delete()
      .not('workout_session_id', 'is', null)
      .eq('user_id', userId);
    if (pullupError) throw pullupError;

    // Delete all cardio_logs for this user
    const { error: cardioError } = await supabase
      .from('cardio_logs')
      .delete()
      .not('workout_session_id', 'is', null)
      .eq('user_id', userId);
    if (cardioError) throw cardioError;

    // Delete all exercise_logs for this user
    const { error: logsError } = await supabase
      .from('exercise_logs')
      .delete()
      .eq('user_id', userId);
    if (logsError) throw logsError;

    // Delete all workout_sessions for this user
    const { error: sessionsError } = await supabase
      .from('workout_sessions')
      .delete()
      .eq('user_id', userId);
    if (sessionsError) throw sessionsError;
}

/**
 * Delete multiple workout sessions from Supabase by IDs.
 */
export async function deleteMultipleSessionsFromCloud(sessionIds: string[]): Promise<void> {
  const userId = await getUserId();
  if (sessionIds.length === 0) return;
  if (!userId) throw new Error('Cannot delete cloud sessions without an authenticated user');

    // Delete pullup_logs
    const { error: pullupError } = await supabase
      .from('pullup_logs')
      .delete()
      .in('workout_session_id', sessionIds)
      .eq('user_id', userId);
    if (pullupError) throw pullupError;

    // Delete cardio_logs
    const { error: cardioError } = await supabase
      .from('cardio_logs')
      .delete()
      .in('workout_session_id', sessionIds)
      .eq('user_id', userId);
    if (cardioError) throw cardioError;

    // Delete exercise_logs
    const { error: logsError } = await supabase
      .from('exercise_logs')
      .delete()
      .in('workout_session_id', sessionIds)
      .eq('user_id', userId);
    if (logsError) throw logsError;

    // Delete sessions
    const { error: sessionsError } = await supabase
      .from('workout_sessions')
      .delete()
      .in('id', sessionIds)
      .eq('user_id', userId);
    if (sessionsError) throw sessionsError;
}


// ==========================================
// DELETE helpers for STANDALONE cardio/pullup entries (by their own id)
// ==========================================

/**
 * Delete a single standalone cardio log from Supabase by its own id.
 */
export async function deleteCardioLogFromCloud(cardioLogId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Cannot delete cloud cardio log without an authenticated user');

    const { error } = await supabase
      .from('cardio_logs')
      .delete()
      .eq('id', cardioLogId)
      .eq('user_id', userId);
    if (error) throw error;
}

/**
 * Delete a whole standalone pull-up session from Supabase.
 * A standalone session is identified by a list of row ids (all sets of that session).
 */
export async function deletePullupLogsFromCloud(pullupLogIds: string[]): Promise<void> {
  const userId = await getUserId();
  if (pullupLogIds.length === 0) return;
  if (!userId) throw new Error('Cannot delete cloud pull-up logs without an authenticated user');

    const { error } = await supabase
      .from('pullup_logs')
      .delete()
      .in('id', pullupLogIds)
      .eq('user_id', userId);
    if (error) throw error;
}

