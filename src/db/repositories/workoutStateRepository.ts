// ==========================================
// Repository: Active workout state (crash resilience)
// Singleton row (id=1) stores a JSON snapshot of the active workout.
// ==========================================

import { getDb, saveToStore } from '../database';
import type { WorkoutSnapshot } from '../../types';

/**
 * Save (upsert) the active workout state snapshot.
 */
export async function saveWorkoutState(
  sessionId: string,
  snapshot: WorkoutSnapshot
): Promise<void> {
  const db = await getDb();
  const json = JSON.stringify(snapshot);
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO active_workout_state (id, session_id, snapshot, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       snapshot = excluded.snapshot,
       updated_at = excluded.updated_at`,
    [sessionId, json, now]
  );

  await saveToStore();
}

/**
 * Load the saved workout state snapshot.
 * Returns null if no state is saved or if the snapshot is corrupted.
 */
export async function loadWorkoutState(): Promise<WorkoutSnapshot | null> {
  const db = await getDb();
  const result = await db.query(
    'SELECT session_id, snapshot, updated_at FROM active_workout_state WHERE id = 1'
  );
  const row = result.values?.[0];

  if (!row) return null;

  try {
    return JSON.parse(row.snapshot) as WorkoutSnapshot;
  } catch (error) {
    console.error('Failed to parse workout snapshot:', error);
    await clearWorkoutState();
    return null;
  }
}

/**
 * Delete the saved workout state (called after finish or cancel).
 */
export async function clearWorkoutState(): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM active_workout_state WHERE id = 1');
  await saveToStore();
}

/**
 * Check if there's a saved workout state without parsing it.
 */
export async function hasWorkoutState(): Promise<boolean> {
  const db = await getDb();
  const result = await db.query(
    'SELECT COUNT(*) as cnt FROM active_workout_state WHERE id = 1'
  );
  return (result.values?.[0]?.cnt ?? 0) > 0;
}
