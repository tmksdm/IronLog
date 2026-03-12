// ==========================================
// Repository: Workout sessions, exercise logs, cardio logs
// ==========================================

import { getDb, generateId, saveToStore } from '../database';
import type {
  WorkoutSession,
  ExerciseLog,
  CardioLog,
  ExerciseSummary,
  DayTypeId,
  Direction,
  SetType,
  CardioType,
} from '../../types';
import { deleteSessionFromCloud, deleteAllSessionsFromCloud, deleteMultipleSessionsFromCloud } from '../../lib/sync';


// --- Session row mapping ---

function mapSessionRow(row: any): WorkoutSession {
  return {
    id: row.id,
    dayTypeId: row.day_type_id as DayTypeId,
    date: row.date,
    direction: row.direction as Direction,
    weightBefore: row.weight_before,
    weightAfter: row.weight_after,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    totalKg: row.total_kg,
    notes: row.notes,
  };
}

// --- Exercise log row mapping ---

function mapLogRow(row: any): ExerciseLog {
  return {
    id: row.id,
    workoutSessionId: row.workout_session_id,
    exerciseId: row.exercise_id,
    setNumber: row.set_number,
    setType: row.set_type as SetType,
    targetReps: row.target_reps,
    actualReps: row.actual_reps,
    weight: row.weight,
    isSkipped: row.is_skipped === 1,
    completedAt: row.completed_at,
  };
}

// --- Cardio log row mapping ---

function mapCardioRow(row: any): CardioLog {
  return {
    id: row.id,
    workoutSessionId: row.workout_session_id,
    type: row.type as CardioType,
    durationSeconds: row.duration_seconds,
    count: row.count,
    succeeded: row.succeeded === 1 ? true : row.succeeded === 0 ? false : null,
  };
}

// ==========================================
// Workout Sessions
// ==========================================

/**
 * Create a new workout session. Records the current time as start.
 */
export async function createWorkoutSession(data: {
  dayTypeId: DayTypeId;
  direction: Direction;
  weightBefore: number | null;
}): Promise<WorkoutSession> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO workout_sessions
      (id, day_type_id, date, direction, weight_before, time_start, total_kg)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [id, data.dayTypeId, now, data.direction, data.weightBefore, now]
  );

  await saveToStore();

  return {
    id,
    dayTypeId: data.dayTypeId,
    date: now,
    direction: data.direction,
    weightBefore: data.weightBefore,
    weightAfter: null,
    timeStart: now,
    timeEnd: null,
    totalKg: 0,
    notes: null,
  };
}

/**
 * Finish a workout session: set timeEnd, weightAfter, recalculate totalKg.
 */
export async function finishWorkoutSession(
  id: string,
  weightAfter: number | null,
  timeEnd: string
): Promise<void> {
  const db = await getDb();

  // Calculate total tonnage from exercise logs
  const result = await db.query(
    `SELECT COALESCE(SUM(weight * actual_reps), 0) as total
     FROM exercise_logs
     WHERE workout_session_id = ? AND is_skipped = 0 AND weight > 0 AND set_type = 'working'`,
    [id]
  );
  const totalKg = result.values?.[0]?.total ?? 0;

  await db.run(
    `UPDATE workout_sessions
     SET time_end = ?, weight_after = ?, total_kg = ?
     WHERE id = ?`,
    [timeEnd, weightAfter, totalKg, id]
  );

  await saveToStore();
}

/**
 * Update the timeEnd for a session (used when user taps "Завершить").
 */
export async function setWorkoutTimeEnd(
  id: string,
  timeEnd: string
): Promise<void> {
  const db = await getDb();
  await db.run(
    'UPDATE workout_sessions SET time_end = ? WHERE id = ?',
    [timeEnd, id]
  );
  await saveToStore();
}

/**
 * Get a workout session by id.
 */
export async function getWorkoutSessionById(
  id: string
): Promise<WorkoutSession | null> {
  const db = await getDb();
  const result = await db.query(
    'SELECT * FROM workout_sessions WHERE id = ?',
    [id]
  );
  const row = result.values?.[0];
  if (!row) return null;
  return mapSessionRow(row);
}

/**
 * Get the last session for a specific day type.
 */
export async function getLastSessionByDayType(
  dayTypeId: DayTypeId
): Promise<WorkoutSession | null> {
  const db = await getDb();
  const result = await db.query(
    `SELECT * FROM workout_sessions
     WHERE day_type_id = ?
     ORDER BY date DESC LIMIT 1`,
    [dayTypeId]
  );
  const row = result.values?.[0];
  if (!row) return null;
  return mapSessionRow(row);
}

/**
 * Get all sessions, ordered by date descending. Optional limit.
 */
export async function getAllSessions(
  limit?: number
): Promise<WorkoutSession[]> {
  const db = await getDb();
  const query = limit
    ? 'SELECT * FROM workout_sessions ORDER BY date DESC LIMIT ?'
    : 'SELECT * FROM workout_sessions ORDER BY date DESC';
  const params = limit ? [limit] : [];
  const result = await db.query(query, params);
  return (result.values ?? []).map(mapSessionRow);
}

/**
 * Delete a workout session and all related logs.
 */
export async function deleteWorkoutSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM cardio_logs WHERE workout_session_id = ?', [sessionId]);
  await db.run('DELETE FROM exercise_logs WHERE workout_session_id = ?', [sessionId]);
  await db.run('DELETE FROM workout_sessions WHERE id = ?', [sessionId]);
  await saveToStore();
  // Sync deletion to cloud
  deleteSessionFromCloud(sessionId).catch((err) =>
    console.error('Cloud sync after session delete failed:', err)
  );
}

/**
 * Delete multiple workout sessions and all related logs.
 */
export async function deleteMultipleSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const db = await getDb();
  const placeholders = sessionIds.map(() => '?').join(',');

  await db.run(`DELETE FROM cardio_logs WHERE workout_session_id IN (${placeholders})`, sessionIds);
  await db.run(`DELETE FROM exercise_logs WHERE workout_session_id IN (${placeholders})`, sessionIds);
  await db.run(`DELETE FROM workout_sessions WHERE id IN (${placeholders})`, sessionIds);
  await saveToStore();

  // Sync deletions to cloud (batch, not one-by-one)
  deleteMultipleSessionsFromCloud(sessionIds).catch((err) =>
    console.error('Cloud sync after batch delete failed:', err)
  );
}

/**
 * Delete ALL workout sessions and all related logs.
 */
export async function deleteAllSessions(): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM cardio_logs');
  await db.run('DELETE FROM exercise_logs');
  await db.run('DELETE FROM workout_sessions');
  await saveToStore();

  // Sync deletion to cloud
  deleteAllSessionsFromCloud().catch((err) =>
    console.error('Cloud sync after delete-all failed:', err)
  );
}

/**
 * Count workout sessions within a date range (inclusive).
 * Used for gym cost calculator.
 */
export async function countSessionsInRange(
  startISO: string,
  endISO: string
): Promise<number> {
  const db = await getDb();
  const result = await db.query(
    `SELECT COUNT(*) as cnt FROM workout_sessions
     WHERE date >= ? AND date <= ?`,
    [startISO, endISO]
  );
  return result.values?.[0]?.cnt ?? 0;
}

// ==========================================
// Exercise Logs
// ==========================================

/**
 * Create an exercise log entry (one set).
 */
export async function createExerciseLog(data: {
  workoutSessionId: string;
  exerciseId: string;
  setNumber: number;
  setType: SetType;
  targetReps: number;
  actualReps: number;
  weight: number;
  isSkipped: boolean;
}): Promise<ExerciseLog> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO exercise_logs
      (id, workout_session_id, exercise_id, set_number, set_type,
       target_reps, actual_reps, weight, is_skipped, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.workoutSessionId,
      data.exerciseId,
      data.setNumber,
      data.setType,
      data.targetReps,
      data.actualReps,
      data.weight,
      data.isSkipped ? 1 : 0,
      now,
    ]
  );

  await saveToStore();

  return {
    id,
    ...data,
    completedAt: now,
  };
}

/**
 * Update actual reps for an exercise log entry.
 */
export async function updateExerciseLog(
  id: string,
  actualReps: number
): Promise<void> {
  const db = await getDb();
  await db.run('UPDATE exercise_logs SET actual_reps = ? WHERE id = ?', [
    actualReps,
    id,
  ]);
  await saveToStore();
}

/**
 * Get all exercise logs for a session.
 */
export async function getLogsBySession(
  sessionId: string
): Promise<ExerciseLog[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT * FROM exercise_logs
     WHERE workout_session_id = ?
     ORDER BY exercise_id, set_number`,
    [sessionId]
  );
  return (result.values ?? []).map(mapLogRow);
}

/**
 * Get exercise logs for a specific exercise within a session.
 */
export async function getLogsBySessionAndExercise(
  sessionId: string,
  exerciseId: string
): Promise<ExerciseLog[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT * FROM exercise_logs
     WHERE workout_session_id = ? AND exercise_id = ?
     ORDER BY set_number`,
    [sessionId, exerciseId]
  );
  return (result.values ?? []).map(mapLogRow);
}

/**
 * Get the last working set logs for an exercise (across all sessions).
 * Returns up to 3 rows (one per working set) from the most recent session.
 */
export async function getLastWorkingLogsForExercise(
  exerciseId: string
): Promise<ExerciseLog[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT el.* FROM exercise_logs el
     JOIN workout_sessions ws ON el.workout_session_id = ws.id
     WHERE el.exercise_id = ?
       AND el.set_type = 'working'
       AND el.is_skipped = 0
     ORDER BY ws.date DESC
     LIMIT 3`,
    [exerciseId]
  );
  return (result.values ?? []).map(mapLogRow);
}

/**
 * Check if an exercise was skipped in the last session of its day type.
 */
export async function wasExerciseSkippedLastSession(
  exerciseId: string,
  dayTypeId: DayTypeId
): Promise<boolean> {
  const db = await getDb();
  const result = await db.query(
    `SELECT el.is_skipped FROM exercise_logs el
     JOIN workout_sessions ws ON el.workout_session_id = ws.id
     WHERE el.exercise_id = ?
       AND ws.day_type_id = ?
     ORDER BY ws.date DESC
     LIMIT 1`,
    [exerciseId, dayTypeId]
  );
  return result.values?.[0]?.is_skipped === 1;
}

// ==========================================
// Cardio Logs
// ==========================================

/**
 * Create a cardio log entry.
 */
export async function createCardioLog(data: {
  workoutSessionId: string;
  type: CardioType;
  durationSeconds: number | null;
  count: number | null;
  succeeded: boolean | null;
}): Promise<CardioLog> {
  const db = await getDb();
  const id = generateId();

  await db.run(
    `INSERT INTO cardio_logs (id, workout_session_id, type, duration_seconds, count, succeeded)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.workoutSessionId,
      data.type,
      data.durationSeconds,
      data.count,
      data.succeeded === true ? 1 : data.succeeded === false ? 0 : null,
    ]
  );

  await saveToStore();
  return { id, ...data };
}

/**
 * Get cardio logs for a session.
 */
export async function getCardioBySession(
  sessionId: string
): Promise<CardioLog[]> {
  const db = await getDb();
  const result = await db.query(
    'SELECT * FROM cardio_logs WHERE workout_session_id = ?',
    [sessionId]
  );
  return (result.values ?? []).map(mapCardioRow);
}

// ==========================================
// Exercise Summary (for workout detail/finish screen)
// ==========================================

/**
 * Get a grouped summary of exercises for a session.
 */
export async function getSessionExerciseSummary(
  sessionId: string
): Promise<ExerciseSummary[]> {
  const db = await getDb();

  const result = await db.query(
    `SELECT el.*, e.name as exercise_name, e.has_added_weight, e.working_weight
     FROM exercise_logs el
     JOIN exercises e ON el.exercise_id = e.id
     WHERE el.workout_session_id = ?
     ORDER BY e.sort_order, el.set_number`,
    [sessionId]
  );

  const rows = result.values ?? [];
  const grouped = new Map<string, ExerciseSummary>();

  for (const row of rows as any[]) {
    const log = mapLogRow(row);
    const exerciseId = log.exerciseId;

    if (!grouped.has(exerciseId)) {
      grouped.set(exerciseId, {
        exerciseId,
        exerciseName: row.exercise_name,
        hasAddedWeight: row.has_added_weight === 1,
        workingWeight: row.working_weight,
        sets: [],
        isSkipped: false,
        totalKg: 0,
      });
    }

    const summary = grouped.get(exerciseId)!;
    summary.sets.push(log);

    if (log.isSkipped) {
      summary.isSkipped = true;
    }

    if (log.weight > 0 && log.actualReps > 0 && !log.isSkipped && log.setType === 'working') {
      summary.totalKg += log.weight * log.actualReps;
    }
  }

  return Array.from(grouped.values());
}
