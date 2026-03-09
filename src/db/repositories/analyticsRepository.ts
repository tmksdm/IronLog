// ==========================================
// Repository: Analytics queries
// ==========================================

import { getDb } from '../database';
import type {
  DayTypeId,
  TonnageDataPoint,
  MonthlyTonnage,
  YearlyTonnage,
  BodyWeightDataPoint,
  MonthlyBodyWeight,
  YearlyBodyWeight,
  MonthlyDuration,
  YearlyDuration,
  MonthlyRunTime,
  YearlyRunTime,
  ExerciseProgressPoint,
  ExercisePickerItem,
} from '../../types';

// --- Formatting helper ---

const MONTH_NAMES_SHORT = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_SHORT[month - 1]} ${year}`;
}

// ==========================================
// Tonnage
// ==========================================

export async function getTonnagePerWorkout(
  dayTypeId?: DayTypeId,
  limit?: number
): Promise<TonnageDataPoint[]> {
  const db = await getDb();
  let query = `
    SELECT id, date, day_type_id, total_kg
    FROM workout_sessions
    WHERE time_end IS NOT NULL
  `;
  const params: any[] = [];

  if (dayTypeId !== undefined) {
    query += ' AND day_type_id = ?';
    params.push(dayTypeId);
  }

  query += ' ORDER BY date ASC';

  if (limit !== undefined) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  const result = await db.query(query, params);
  return (result.values ?? []).map((row: any) => ({
    sessionId: row.id,
    date: row.date,
    dayTypeId: row.day_type_id as DayTypeId,
    totalKg: row.total_kg,
  }));
}

export async function getMonthlyTonnage(
  dayTypeId?: DayTypeId
): Promise<MonthlyTonnage[]> {
  const db = await getDb();
  let query = `
    SELECT
      CAST(strftime('%Y', date) AS INTEGER) as year,
      CAST(strftime('%m', date) AS INTEGER) as month,
      AVG(total_kg) as avg_total_kg,
      COUNT(*) as workout_count
    FROM workout_sessions
    WHERE time_end IS NOT NULL
  `;
  const params: any[] = [];

  if (dayTypeId !== undefined) {
    query += ' AND day_type_id = ?';
    params.push(dayTypeId);
  }

  query += ' GROUP BY year, month ORDER BY year ASC, month ASC';

  const result = await db.query(query, params);
  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    month: row.month,
    label: monthLabel(row.year, row.month),
    avgTotalKg: Math.round(row.avg_total_kg),
    workoutCount: row.workout_count,
  }));
}

export async function getYearlyTonnage(
  dayTypeId?: DayTypeId
): Promise<YearlyTonnage[]> {
  const db = await getDb();
  let innerQuery = `
    SELECT
      CAST(strftime('%Y', date) AS INTEGER) as year,
      CAST(strftime('%m', date) AS INTEGER) as month,
      AVG(total_kg) as monthly_avg,
      COUNT(*) as cnt
    FROM workout_sessions
    WHERE time_end IS NOT NULL
  `;
  const params: any[] = [];

  if (dayTypeId !== undefined) {
    innerQuery += ' AND day_type_id = ?';
    params.push(dayTypeId);
  }

  innerQuery += ' GROUP BY year, month';

  const query = `
    SELECT
      year,
      AVG(monthly_avg) as avg_total_kg,
      SUM(cnt) as workout_count
    FROM (${innerQuery})
    GROUP BY year
    ORDER BY year ASC
  `;

  const result = await db.query(query, params);
  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    avgTotalKg: Math.round(row.avg_total_kg),
    workoutCount: row.workout_count,
  }));
}

// ==========================================
// Body Weight
// ==========================================

export async function getBodyWeightTrend(): Promise<BodyWeightDataPoint[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT date, weight_before, weight_after
     FROM workout_sessions
     WHERE time_end IS NOT NULL
       AND (weight_before IS NOT NULL OR weight_after IS NOT NULL)
     ORDER BY date ASC`
  );

  return (result.values ?? []).map((row: any) => {
    let avg: number;
    if (row.weight_before !== null && row.weight_after !== null) {
      avg = (row.weight_before + row.weight_after) / 2;
    } else if (row.weight_before !== null) {
      avg = row.weight_before;
    } else {
      avg = row.weight_after;
    }
    return {
      date: row.date,
      avgWeight: Math.round(avg * 100) / 100,
    };
  });
}

export async function getMonthlyBodyWeight(): Promise<MonthlyBodyWeight[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       CAST(strftime('%Y', date) AS INTEGER) as year,
       CAST(strftime('%m', date) AS INTEGER) as month,
       AVG(
         CASE
           WHEN weight_before IS NOT NULL AND weight_after IS NOT NULL
             THEN (weight_before + weight_after) / 2.0
           WHEN weight_before IS NOT NULL THEN weight_before
           ELSE weight_after
         END
       ) as avg_weight,
       COUNT(*) as measurement_count
     FROM workout_sessions
     WHERE time_end IS NOT NULL
       AND (weight_before IS NOT NULL OR weight_after IS NOT NULL)
     GROUP BY year, month
     ORDER BY year ASC, month ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    month: row.month,
    label: monthLabel(row.year, row.month),
    avgWeight: Math.round(row.avg_weight * 100) / 100,
    measurementCount: row.measurement_count,
  }));
}

export async function getYearlyBodyWeight(): Promise<YearlyBodyWeight[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       year,
       AVG(monthly_avg) as avg_weight,
       SUM(cnt) as measurement_count
     FROM (
       SELECT
         CAST(strftime('%Y', date) AS INTEGER) as year,
         CAST(strftime('%m', date) AS INTEGER) as month,
         AVG(
           CASE
             WHEN weight_before IS NOT NULL AND weight_after IS NOT NULL
               THEN (weight_before + weight_after) / 2.0
             WHEN weight_before IS NOT NULL THEN weight_before
             ELSE weight_after
           END
         ) as monthly_avg,
         COUNT(*) as cnt
       FROM workout_sessions
       WHERE time_end IS NOT NULL
         AND (weight_before IS NOT NULL OR weight_after IS NOT NULL)
       GROUP BY year, month
     )
     GROUP BY year
     ORDER BY year ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    avgWeight: Math.round(row.avg_weight * 100) / 100,
    measurementCount: row.measurement_count,
  }));
}

// ==========================================
// Duration
// ==========================================

export async function getMonthlyDuration(): Promise<MonthlyDuration[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       CAST(strftime('%Y', date) AS INTEGER) as year,
       CAST(strftime('%m', date) AS INTEGER) as month,
       AVG(
         (julianday(time_end) - julianday(time_start)) * 24 * 60
       ) as avg_duration_min,
       COUNT(*) as workout_count
     FROM workout_sessions
     WHERE time_end IS NOT NULL
     GROUP BY year, month
     ORDER BY year ASC, month ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    month: row.month,
    label: monthLabel(row.year, row.month),
    avgDurationMin: Math.round(row.avg_duration_min),
    workoutCount: row.workout_count,
  }));
}

export async function getYearlyDuration(): Promise<YearlyDuration[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       year,
       AVG(monthly_avg) as avg_duration_min,
       SUM(cnt) as workout_count
     FROM (
       SELECT
         CAST(strftime('%Y', date) AS INTEGER) as year,
         CAST(strftime('%m', date) AS INTEGER) as month,
         AVG(
           (julianday(time_end) - julianday(time_start)) * 24 * 60
         ) as monthly_avg,
         COUNT(*) as cnt
       FROM workout_sessions
       WHERE time_end IS NOT NULL
       GROUP BY year, month
     )
     GROUP BY year
     ORDER BY year ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    avgDurationMin: Math.round(row.avg_duration_min),
    workoutCount: row.workout_count,
  }));
}

// ==========================================
// Cardio (Treadmill 3km)
// ==========================================

export async function getMonthlyRunTime(): Promise<MonthlyRunTime[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       CAST(strftime('%Y', ws.date) AS INTEGER) as year,
       CAST(strftime('%m', ws.date) AS INTEGER) as month,
       AVG(cl.duration_seconds) as avg_duration_sec,
       COUNT(*) as run_count
     FROM cardio_logs cl
     JOIN workout_sessions ws ON cl.workout_session_id = ws.id
     WHERE cl.type = 'treadmill_3km'
       AND cl.duration_seconds IS NOT NULL
       AND cl.duration_seconds > 0
     GROUP BY year, month
     ORDER BY year ASC, month ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    month: row.month,
    label: monthLabel(row.year, row.month),
    avgDurationSec: Math.round(row.avg_duration_sec),
    runCount: row.run_count,
  }));
}

export async function getYearlyRunTime(): Promise<YearlyRunTime[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       year,
       AVG(monthly_avg) as avg_duration_sec,
       SUM(cnt) as run_count
     FROM (
       SELECT
         CAST(strftime('%Y', ws.date) AS INTEGER) as year,
         CAST(strftime('%m', ws.date) AS INTEGER) as month,
         AVG(cl.duration_seconds) as monthly_avg,
         COUNT(*) as cnt
       FROM cardio_logs cl
       JOIN workout_sessions ws ON cl.workout_session_id = ws.id
       WHERE cl.type = 'treadmill_3km'
         AND cl.duration_seconds IS NOT NULL
         AND cl.duration_seconds > 0
       GROUP BY year, month
     )
     GROUP BY year
     ORDER BY year ASC`
  );

  return (result.values ?? []).map((row: any) => ({
    year: row.year,
    avgDurationSec: Math.round(row.avg_duration_sec),
    runCount: row.run_count,
  }));
}

// ==========================================
// Per-exercise progress
// ==========================================

export async function getExerciseProgress(
  exerciseId: string
): Promise<ExerciseProgressPoint[]> {
  const db = await getDb();

  const result = await db.query(
    `SELECT
       el.workout_session_id,
       ws.date,
       el.set_type,
       el.set_number,
       el.actual_reps,
       el.weight,
       el.is_skipped
     FROM exercise_logs el
     JOIN workout_sessions ws ON el.workout_session_id = ws.id
     WHERE el.exercise_id = ?
       AND ws.time_end IS NOT NULL
     ORDER BY ws.date ASC, el.set_number ASC`,
    [exerciseId]
  );

  const rows = result.values ?? [];

  const sessionMap = new Map<
    string,
    {
      date: string;
      workingWeight: number | null;
      workingReps: number[];
      totalKg: number;
      isSkipped: boolean;
    }
  >();

  for (const row of rows as any[]) {
    const sessionId = row.workout_session_id;

    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, {
        date: row.date,
        workingWeight: null,
        workingReps: [],
        totalKg: 0,
        isSkipped: false,
      });
    }

    const entry = sessionMap.get(sessionId)!;

    if (row.is_skipped === 1) {
      entry.isSkipped = true;
      continue;
    }

    if (row.set_type === 'working') {
      entry.workingReps.push(row.actual_reps);
      if (row.weight > 0) {
        entry.workingWeight = row.weight;
      }
    }

    if (row.weight > 0 && row.actual_reps > 0) {
      entry.totalKg += row.weight * row.actual_reps;
    }
  }

  const points: ExerciseProgressPoint[] = [];
  for (const [sessionId, entry] of sessionMap) {
    if (entry.isSkipped) continue;

    points.push({
      date: entry.date,
      sessionId,
      workingWeight: entry.workingWeight,
      workingReps: entry.workingReps,
      totalWorkingReps: entry.workingReps.reduce((s, r) => s + r, 0),
      totalKg: entry.totalKg,
    });
  }

  return points;
}

// ==========================================
// Exercise picker
// ==========================================

export async function getAllExercisesForPicker(): Promise<ExercisePickerItem[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT DISTINCT e.id, e.name, e.day_type_id, e.has_added_weight, e.sort_order
     FROM exercises e
     WHERE e.is_active = 1
     ORDER BY e.day_type_id, e.sort_order`
  );

  return (result.values ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    dayTypeId: row.day_type_id as DayTypeId,
    hasAddedWeight: row.has_added_weight === 1,
  }));
}
