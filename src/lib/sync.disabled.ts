// src/lib/sync.disabled.ts
//
// Test build stub. Replaces ./sync when the app is built with
// `npm run build:test` (see vite.config.ts, mode "testdeploy").
//
// Every cloud operation becomes a no-op, so the application keeps working
// locally: data is written to SQLite, deletions are applied locally, and the
// delete queue is simply never flushed anywhere.
//
// Parameters mirror the production signatures — callers must be able to pass
// them — and are dropped here, because nothing leaves the device.
// cloudStubContract.ts compares them against ./sync.

export type CloudDeletionType =
  | 'session'
  | 'all_sessions'
  | 'exercise'
  | 'cardio_log'
  | 'pullup_log';

/** Accepts the production arguments and forgets them: the cloud is not a target. */
function ignoreCloudArguments(...args: unknown[]): void {
  void args;
}

export async function pushToCloud(): Promise<void> {}

export async function pullFromCloud(): Promise<boolean> {
  return false;
}

export async function queueCloudDeletion(
  entityType: CloudDeletionType,
  entityId: string
): Promise<void> {
  ignoreCloudArguments(entityType, entityId);
}

export async function flushPendingCloudDeletions(): Promise<number> {
  return 0;
}

export async function deleteSessionFromCloud(sessionId: string): Promise<void> {
  ignoreCloudArguments(sessionId);
}

export async function deleteExerciseFromCloud(exerciseId: string): Promise<void> {
  ignoreCloudArguments(exerciseId);
}

export async function deleteAllSessionsFromCloud(): Promise<void> {}

export async function deleteMultipleSessionsFromCloud(sessionIds: string[]): Promise<void> {
  ignoreCloudArguments(sessionIds);
}

export async function deleteCardioLogFromCloud(cardioLogId: string): Promise<void> {
  ignoreCloudArguments(cardioLogId);
}

export async function deletePullupLogsFromCloud(pullupLogIds: string[]): Promise<void> {
  ignoreCloudArguments(pullupLogIds);
}
