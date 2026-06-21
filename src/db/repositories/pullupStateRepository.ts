// src/db/repositories/pullupStateRepository.ts

/**
 * Repository for the standalone pull-up in-progress snapshot.
 * Singleton row (id = 1) in `pullup_active_state`.
 *
 * This is SEPARATE from active_workout_state (the workout snapshot),
 * so a standalone pull-up session survives an app crash on its own,
 * independent of any workout.
 */

import { getDb, saveToStore } from '../database';
import type { PullupSessionSnapshot } from '../../types';

/**
 * Save (upsert) the standalone pull-up snapshot.
 */
export async function savePullupState(snapshot: PullupSessionSnapshot): Promise<void> {
  const db = await getDb();
  const json = JSON.stringify(snapshot);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO pullup_active_state (id, snapshot, updated_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
    [json, now]
  );
  await saveToStore();
}

/**
 * Load the standalone pull-up snapshot, or null if none.
 */
export async function loadPullupState(): Promise<PullupSessionSnapshot | null> {
  const db = await getDb();
  const result = await db.query('SELECT snapshot FROM pullup_active_state WHERE id = 1');
  const row = (result.values ?? [])[0] as { snapshot?: string } | undefined;
  if (!row?.snapshot) return null;
  try {
    return JSON.parse(row.snapshot) as PullupSessionSnapshot;
  } catch {
    return null;
  }
}

/**
 * Clear the standalone pull-up snapshot.
 */
export async function clearPullupState(): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM pullup_active_state WHERE id = 1');
  await saveToStore();
}
