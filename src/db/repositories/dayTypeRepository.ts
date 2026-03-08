// ==========================================
// Repository: Day types
// ==========================================

import { getDb } from '../database';
import type { DayType, DayTypeId, Direction } from '../../types';

/**
 * Get all day types.
 */
export async function getAllDayTypes(): Promise<DayType[]> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM day_types ORDER BY id');
  const rows = result.values ?? [];

  return rows.map((row: any) => ({
    id: row.id as DayTypeId,
    name: row.name,
    nameRu: row.name_ru,
  }));
}

/**
 * Get a single day type by id.
 */
export async function getDayTypeById(id: DayTypeId): Promise<DayType | null> {
  const db = await getDb();
  const result = await db.query('SELECT * FROM day_types WHERE id = ?', [id]);
  const row = result.values?.[0];
  if (!row) return null;

  return {
    id: row.id as DayTypeId,
    name: row.name,
    nameRu: row.name_ru,
  };
}

/**
 * Determine the next day type based on the last completed workout.
 * Rotation: 1 → 2 → 3 → 1 → ...
 * If no workouts exist, returns 1 (Squat).
 */
export async function getNextDayTypeId(): Promise<DayTypeId> {
  const db = await getDb();
  const result = await db.query(
    'SELECT day_type_id FROM workout_sessions ORDER BY date DESC LIMIT 1'
  );
  const row = result.values?.[0];

  if (!row) return 1;

  const lastDayType = row.day_type_id as DayTypeId;
  const nextMap: Record<DayTypeId, DayTypeId> = { 1: 2, 2: 3, 3: 1 };
  return nextMap[lastDayType];
}

/**
 * Determine the direction for the next workout.
 * Direction is a global toggle — every next workout has the opposite direction.
 * If no workouts exist, returns 'normal'.
 */
export async function getNextDirection(): Promise<Direction> {
  const db = await getDb();
  const result = await db.query(
    'SELECT direction FROM workout_sessions ORDER BY date DESC LIMIT 1'
  );
  const row = result.values?.[0];

  if (!row) return 'normal';

  return row.direction === 'normal' ? 'reverse' : 'normal';
}
