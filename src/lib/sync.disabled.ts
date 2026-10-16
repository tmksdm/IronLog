// src/lib/sync.disabled.ts
//
// Test build stub. Replaces ./sync when the app is built with
// `npm run build:test` (see vite.config.ts, mode "testdeploy").
//
// Every cloud operation becomes a no-op, so the application keeps working
// locally: data is written to SQLite, deletions are applied locally, and the
// delete queue is simply never flushed anywhere.

export type CloudDeletionType =
  | 'session'
  | 'all_sessions'
  | 'exercise'
  | 'cardio_log'
  | 'pullup_log';

export async function pushToCloud(): Promise<void> {}

export async function pullFromCloud(): Promise<boolean> {
  return false;
}

export async function queueCloudDeletion(): Promise<void> {}

export async function flushPendingCloudDeletions(): Promise<number> {
  return 0;
}

export async function deleteSessionFromCloud(): Promise<void> {}

export async function deleteExerciseFromCloud(): Promise<void> {}

export async function deleteAllSessionsFromCloud(): Promise<void> {}

export async function deleteMultipleSessionsFromCloud(): Promise<void> {}

export async function deleteCardioLogFromCloud(): Promise<void> {}

export async function deletePullupLogsFromCloud(): Promise<void> {}
