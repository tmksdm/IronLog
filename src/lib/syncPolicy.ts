export interface LocalDataCounts {
  workoutSessions: number;
  userExercises: number;
  cardioLogs: number;
  pullupLogs: number;
  activeWorkouts: number;
  activePullups: number;
  pendingDeletes: number;
}

export function hasMeaningfulLocalData(counts: LocalDataCounts): boolean {
  return Object.values(counts).some((count) => count > 0);
}

export interface CloudBackupCounts {
  exercises: number;
  workoutSessions: number;
  exerciseLogs: number;
  cardioLogs: number;
  pullupLogs: number;
}

export function isCloudBackupEmpty(counts: CloudBackupCounts): boolean {
  return Object.values(counts).every((count) => count === 0);
}
