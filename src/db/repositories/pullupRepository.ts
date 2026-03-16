// ==========================================
// Repository: Pull-up logs
// ==========================================

import { getDb, generateId, saveToStore } from '../database';
import type { PullupLog, MonthlyPullups, YearlyPullups } from '../../types';
import type { PullupSetResult, PullupDayNumber } from '../../utils/pullupProgram';

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
 */
export async function savePullupSession(data: {
  workoutSessionId: string;
  pullupDay: PullupDayNumber;
  effectiveDay: 1 | 2 | 3 | 4;
  sets: PullupSetResult[];
  totalReps: number;
  skipped: boolean;
}): Promise<void> {
  const db = await getDb();

  if (data.skipped) {
    // Save a single skip marker row
    const id = generateId();
    await db.run(
      `INSERT INTO pullup_logs
        (id, workout_session_id, pullup_day, effective_day, set_number, reps,
         grip_type, target_reps, succeeded, total_reps, skipped)
       VALUES (?, ?, ?, ?, 1, 0, NULL, NULL, 0, 0, 1)`,
      [id, data.workoutSessionId, data.pullupDay, data.effectiveDay]
    );
  } else {
    for (const set of data.sets) {
      const id = generateId();
      await db.run(
        `INSERT INTO pullup_logs
          (id, workout_session_id, pullup_day, effective_day, set_number, reps,
           grip_type, target_reps, succeeded, total_reps, skipped)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          id,
          data.workoutSessionId,
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

// ---- Analytics ----

const MONTH_NAMES_SHORT = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_SHORT[month - 1]} ${year}`;
}

/**
 * Get monthly total pull-up reps (sum, not average — total per month).
 */
export async function getMonthlyPullups(): Promise<MonthlyPullups[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       CAST(strftime('%Y', ws.date) AS INTEGER) as year,
       CAST(strftime('%m', ws.date) AS INTEGER) as month,
       SUM(pl.reps) as total_reps,
       COUNT(DISTINCT pl.workout_session_id) as session_count
     FROM pullup_logs pl
     JOIN workout_sessions ws ON pl.workout_session_id = ws.id
     WHERE pl.skipped = 0
     GROUP BY year, month
     ORDER BY year ASC, month ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    month: row.month,
    label: monthLabel(row.year, row.month),
    totalReps: row.total_reps ?? 0,
    sessionCount: row.session_count ?? 0,
  }));
}

/**
 * Get yearly total pull-up reps.
 */
export async function getYearlyPullups(): Promise<YearlyPullups[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       CAST(strftime('%Y', ws.date) AS INTEGER) as year,
       SUM(pl.reps) as total_reps,
       COUNT(DISTINCT pl.workout_session_id) as session_count
     FROM pullup_logs pl
     JOIN workout_sessions ws ON pl.workout_session_id = ws.id
     WHERE pl.skipped = 0
     GROUP BY year
     ORDER BY year ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    totalReps: row.total_reps ?? 0,
    sessionCount: row.session_count ?? 0,
  }));
}
