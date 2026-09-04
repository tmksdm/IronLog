// ==========================================
// Repository: Pull-up logs
// ==========================================

import { getDb, generateId, saveToStore } from '../database';
import type { PullupLog, MonthlyPullups, YearlyPullups, StandalonePullupSession } from '../../types';
import type { PullupSetResult, PullupDayNumber } from '../../utils/pullupProgram';
import { flushPendingCloudDeletions, queueCloudDeletion } from '../../lib/sync';

// ---- Row mapping ----

function mapPullupRow(row: any): PullupLog {
  return {
    id: row.id,
    workoutSessionId: row.workout_session_id,
    pullupDay: row.pullup_day,
    effectiveDay: row.effective_day,
    setNumber: row.set_number,
    reps: row.reps,
    gripType: row.grip_type,
    targetReps: row.target_reps,
    succeeded: row.succeeded === 1,
    totalReps: row.total_reps,
    skipped: row.skipped === 1,
  };
}

// ---- Write ----

/**
 * Save all pull-up sets for a workout session.
 * If skipped, saves a single row with skipped=1.
 * `date` defaults to now (standalone entries will pass it explicitly later).
 */
export async function savePullupSession(data: {
  workoutSessionId: string | null;
  pullupDay: PullupDayNumber;
  effectiveDay: 1 | 2 | 3 | 4;
  sets: PullupSetResult[];
  totalReps: number;
  skipped: boolean;
  date?: string;
}): Promise<void> {
  const db = await getDb();
  const date = data.date ?? new Date().toISOString();

  if (data.skipped) {
    // Save a single skip marker row
    const id = generateId();
    await db.run(
      `INSERT INTO pullup_logs
        (id, workout_session_id, date, pullup_day, effective_day, set_number, reps,
         grip_type, target_reps, succeeded, total_reps, skipped)
       VALUES (?, ?, ?, ?, ?, 1, 0, NULL, NULL, 0, 0, 1)`,
      [id, data.workoutSessionId, date, data.pullupDay, data.effectiveDay]
    );
  } else {
    for (const set of data.sets) {
      const id = generateId();
      await db.run(
        `INSERT INTO pullup_logs
          (id, workout_session_id, date, pullup_day, effective_day, set_number, reps,
           grip_type, target_reps, succeeded, total_reps, skipped)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          id,
          data.workoutSessionId,
          date,
          data.pullupDay,
          data.effectiveDay,
          set.setNumber,
          set.reps,
          set.grip ?? null,
          set.targetReps,
          set.succeeded ? 1 : 0,
          data.totalReps,
          // skipped = 0
        ]
      );
    }
  }

  await saveToStore();
}


// ---- Read ----

/**
 * Get pull-up logs for a specific workout session.
 */
export async function getPullupsBySession(
  sessionId: string
): Promise<PullupLog[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT * FROM pullup_logs
     WHERE workout_session_id = ?
     ORDER BY set_number`,
    [sessionId]
  );
  return (result.values ?? []).map(mapPullupRow);
}

/**
 * Delete pull-up logs for a session (used when deleting a workout).
 */
export async function deletePullupsBySession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.run(
    'DELETE FROM pullup_logs WHERE workout_session_id = ?',
    [sessionId]
  );
  await saveToStore();
}

/**
 * Delete pull-up logs for multiple sessions (batch delete).
 */
export async function deletePullupsByMultipleSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const db = await getDb();
  const placeholders = sessionIds.map(() => '?').join(',');
  await db.run(
    `DELETE FROM pullup_logs WHERE workout_session_id IN (${placeholders})`,
    sessionIds
  );
  await saveToStore();
}

/**
 * Delete ALL pull-up logs.
 */
export async function deleteAllPullups(): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM pullup_logs');
  await saveToStore();
}


// ==========================================
// Standalone pull-up sessions (workout_session_id IS NULL)
// ==========================================

/**
 * Get all standalone pull-up sessions (not tied to a workout), newest first.
 * Rows are grouped by `date` (all sets of one session share the same timestamp).
 * Skip-marker rows (skipped=1) are included as zero-rep sessions.
 */
export async function getStandalonePullupSessions(): Promise<StandalonePullupSession[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT * FROM pullup_logs
     WHERE workout_session_id IS NULL AND date IS NOT NULL
     ORDER BY date DESC, set_number ASC`
  );
  const rows = (result.values ?? []) as any[];

  // Group rows by their shared date (= one session)
  const byDate = new Map<string, StandalonePullupSession>();
  for (const row of rows) {
    const date = String(row.date);
    let session = byDate.get(date);
    if (!session) {
      session = {
        date,
        pullupDay: row.pullup_day,
        effectiveDay: row.effective_day,
        totalReps: 0,
        setCount: 0,
        ids: [],
      };
      byDate.set(date, session);
    }
    session.ids.push(row.id);
    // Skip-marker rows don't count as real sets
    if (row.skipped !== 1) {
      session.totalReps += row.reps ?? 0;
      session.setCount += 1;
    }
  }

  return Array.from(byDate.values());
}

/**
 * Delete a standalone pull-up session by its row ids (all sets of one session).
 * Syncs the deletion to the cloud.
 */
export async function deletePullupLogsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  for (const id of ids) {
    await queueCloudDeletion('pullup_log', id);
  }
  const placeholders = ids.map(() => '?').join(',');
  await db.run(`DELETE FROM pullup_logs WHERE id IN (${placeholders})`, ids);
  await saveToStore();

  flushPendingCloudDeletions().catch((err) =>
    console.error('Cloud sync after standalone pullup delete failed:', err)
  );
}


// ---- Analytics ----

const MONTH_NAMES_SHORT = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_SHORT[month - 1]} ${year}`;
}

/**
 * Get monthly average pull-up reps per session.
 * Uses 'localtime' modifier to group by device-local month, not UTC.
 */
export async function getMonthlyPullups(): Promise<MonthlyPullups[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       year,
       month,
       AVG(session_total_reps) as avg_reps,
       COUNT(*) as session_count
     FROM (
       SELECT
         CAST(strftime('%Y', date, 'localtime') AS INTEGER) as year,
         CAST(strftime('%m', date, 'localtime') AS INTEGER) as month,
         CASE
           WHEN workout_session_id IS NOT NULL THEN 'workout:' || workout_session_id
           ELSE 'standalone:' || date
         END as session_key,
         SUM(reps) as session_total_reps
       FROM pullup_logs
       WHERE skipped = 0 AND date IS NOT NULL
       GROUP BY year, month, session_key
     )
     GROUP BY year, month
     ORDER BY year ASC, month ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    month: row.month,
    label: monthLabel(row.year, row.month),
    avgReps: Math.floor(row.avg_reps ?? 0),
    sessionCount: row.session_count ?? 0,
  }));
}


/**
 * Get yearly average pull-up reps per session.
 * Uses 'localtime' modifier to group by device-local year, not UTC.
 */
export async function getYearlyPullups(): Promise<YearlyPullups[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       year,
       AVG(session_total_reps) as avg_reps,
       COUNT(*) as session_count
     FROM (
       SELECT
         CAST(strftime('%Y', date, 'localtime') AS INTEGER) as year,
         CASE
           WHEN workout_session_id IS NOT NULL THEN 'workout:' || workout_session_id
           ELSE 'standalone:' || date
         END as session_key,
         SUM(reps) as session_total_reps
       FROM pullup_logs
       WHERE skipped = 0 AND date IS NOT NULL
       GROUP BY year, session_key
     )
     GROUP BY year
     ORDER BY year ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    avgReps: Math.floor(row.avg_reps ?? 0),
    sessionCount: row.session_count ?? 0,
  }));
}

