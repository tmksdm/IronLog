// ==========================================
// Repository: Exercises
// ==========================================

import { getDb, generateId, saveToStore } from '../database';
import type { Exercise, DayTypeId } from '../../types';

// Map a raw DB row to an Exercise object
function mapRow(row: any): Exercise {
  return {
    id: row.id,
    dayTypeId: row.day_type_id as DayTypeId,
    name: row.name,
    sortOrder: row.sort_order,
    hasAddedWeight: row.has_added_weight === 1,
    workingWeight: row.working_weight,
    weightIncrement: row.weight_increment,
    warmup1Percent: row.warmup_1_percent,
    warmup2Percent: row.warmup_2_percent,
    warmup1Reps: row.warmup_1_reps,
    warmup2Reps: row.warmup_2_reps,
    maxRepsPerSet: row.max_reps_per_set,
    minRepsPerSet: row.min_reps_per_set,
    numWorkingSets: row.num_working_sets,
    isTimed: row.is_timed === 1,
    timerDurationSeconds: row.timer_duration_seconds,
    timerPrepSeconds: row.timer_prep_seconds,
    isActive: row.is_active === 1,
  };
}

/**
 * Get all active exercises for a day type, ordered by sort_order.
 */
export async function getExercisesByDayType(
  dayTypeId: DayTypeId
): Promise<Exercise[]> {
  const db = await getDb();
  const result = await db.query(
    'SELECT * FROM exercises WHERE day_type_id = ? AND is_active = 1 ORDER BY sort_order',
    [dayTypeId]
  );
  return (result.values ?? []).map(mapRow);
}

/**
 * Get all exercises for a day type (including inactive), for the editor.
 */
export async function getAllExercisesByDayType(
  dayTypeId: DayTypeId
): Promise<Exercise[]> {
  const db = await getDb();
  const result = await db.query(
    'SELECT * FROM exercises WHERE day_type_id = ? ORDER BY is_active DESC, sort_order',
    [dayTypeId]
  );
  return (result.values ?? []).map(mapRow);
}

/**
 * Get a single exercise by id.
 */
export async function getExerciseById(id: string): Promise<Exercise | null> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM exercises WHERE id = ?', [id]);
  const row = result.values?.[0];
  if (!row) return null;
  return mapRow(row);
}

/**
 * Get the maximum sort_order for active exercises of a day type.
 */
export async function getMaxSortOrder(dayTypeId: DayTypeId): Promise<number> {
  const db = await getDb();
  const result = await db.query(
    'SELECT MAX(sort_order) as max_order FROM exercises WHERE day_type_id = ? AND is_active = 1',
    [dayTypeId]
  );
  return result.values?.[0]?.max_order ?? 0;
}

/**
 * Create a new exercise.
 */
export async function createExercise(
  data: Omit<Exercise, 'id'>
): Promise<Exercise> {
  const db = await getDb();
  const id = generateId();

  await db.run(
    `INSERT INTO exercises (
      id, day_type_id, name, sort_order, has_added_weight,
      working_weight, weight_increment, warmup_1_percent, warmup_2_percent,
      warmup_1_reps, warmup_2_reps, max_reps_per_set, min_reps_per_set,
      num_working_sets, is_timed, timer_duration_seconds, timer_prep_seconds,
      is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.dayTypeId,
      data.name,
      data.sortOrder,
      data.hasAddedWeight ? 1 : 0,
      data.workingWeight,
      data.weightIncrement,
      data.warmup1Percent,
      data.warmup2Percent,
      data.warmup1Reps,
      data.warmup2Reps,
      data.maxRepsPerSet,
      data.minRepsPerSet,
      data.numWorkingSets,
      data.isTimed ? 1 : 0,
      data.timerDurationSeconds,
      data.timerPrepSeconds,
      data.isActive ? 1 : 0,
    ]
  );

  await saveToStore();
  return { id, ...data };
}

/**
 * Update an exercise (partial update).
 */
export async function updateExercise(
  id: string,
  data: Partial<Exercise>
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: any[] = [];

  const fieldMap: Record<string, string> = {
    name: 'name',
    sortOrder: 'sort_order',
    hasAddedWeight: 'has_added_weight',
    workingWeight: 'working_weight',
    weightIncrement: 'weight_increment',
    warmup1Percent: 'warmup_1_percent',
    warmup2Percent: 'warmup_2_percent',
    warmup1Reps: 'warmup_1_reps',
    warmup2Reps: 'warmup_2_reps',
    maxRepsPerSet: 'max_reps_per_set',
    minRepsPerSet: 'min_reps_per_set',
    numWorkingSets: 'num_working_sets',
    isTimed: 'is_timed',
    timerDurationSeconds: 'timer_duration_seconds',
    timerPrepSeconds: 'timer_prep_seconds',
    isActive: 'is_active',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in data) {
      fields.push(`${column} = ?`);
      let value = (data as any)[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      values.push(value);
    }
  }

  if (fields.length === 0) return;

  values.push(id);
  await db.run(
    `UPDATE exercises SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  await saveToStore();
}

/**
 * Batch update sort orders for exercises.
 */
export async function updateSortOrders(
  updates: Array<{ id: string; sortOrder: number }>
): Promise<void> {
  const db = await getDb();
  for (const { id, sortOrder } of updates) {
    await db.run('UPDATE exercises SET sort_order = ? WHERE id = ?', [
      sortOrder,
      id,
    ]);
  }
  await saveToStore();
}

/**
 * Soft-delete an exercise (set is_active = 0).
 */
export async function deactivateExercise(id: string): Promise<void> {
  await updateExercise(id, { isActive: false });
}

/**
 * Restore a soft-deleted exercise.
 */
export async function reactivateExercise(id: string): Promise<void> {
  await updateExercise(id, { isActive: true });
}

/**
 * Permanently delete an exercise from the database.
 * Only use for inactive exercises with no historical data,
 * or when the user explicitly confirms deletion.
 */
export async function deleteExercise(id: string): Promise<void> {
  const db = await getDb();
  // Delete any exercise logs referencing this exercise
  await db.run('DELETE FROM exercise_logs WHERE exercise_id = ?', [id]);
  // Delete the exercise itself
  await db.run('DELETE FROM exercises WHERE id = ?', [id]);
  await saveToStore();
}
