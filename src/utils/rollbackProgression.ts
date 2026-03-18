// src/utils/rollbackProgression.ts

/**
 * Rollback running and pull-up program progression when a workout is deleted.
 * Should be called BEFORE the actual deletion (while DB data still exists).
 *
 * Only rolls back if the deleted session is the MOST RECENT one that had
 * cardio/pullup data. For non-last sessions, rollback would be inaccurate,
 * so we skip it.
 */

import { getDb } from '../db/database';
import { pullupRepo } from '../db';
import {
  loadPullupProgram,
  savePullupProgram,
  reverseDayResult,
} from './pullupProgram';
import type { PullupDayResult, PullupDayNumber } from './pullupProgram';
import { reverseRunResult } from './runningProgram';


/**
 * Rollback progression for a single deleted session.
 * Call BEFORE deleting from DB.
 */
export async function rollbackProgressionForSession(sessionId: string): Promise<void> {
  await rollbackPullupProgression(sessionId);
  await rollbackRunningProgression(sessionId);
}

/**
 * Rollback progression for multiple deleted sessions.
 * Only rolls back the most recent session (if it's in the batch).
 * Call BEFORE deleting from DB.
 */
export async function rollbackProgressionForMultipleSessions(
  sessionIds: string[]
): Promise<void> {
  if (sessionIds.length === 0) return;

  // Find the most recent session with pullup data
  const db = await getDb();

  const lastPullupResult = await db.query(
    `SELECT DISTINCT pl.workout_session_id, pl.pullup_day, pl.effective_day, pl.skipped
     FROM pullup_logs pl
     JOIN workout_sessions ws ON pl.workout_session_id = ws.id
     WHERE pl.skipped = 0
     ORDER BY ws.date DESC
     LIMIT 1`
  );
  const lastPullupSessionId = lastPullupResult.values?.[0]?.workout_session_id;
  if (lastPullupSessionId && sessionIds.includes(lastPullupSessionId)) {
    await rollbackPullupProgression(lastPullupSessionId);
  }

  // Find the most recent session with treadmill succeeded data
  const lastRunResult = await db.query(
    `SELECT cl.workout_session_id, cl.succeeded
     FROM cardio_logs cl
     JOIN workout_sessions ws ON cl.workout_session_id = ws.id
     WHERE cl.type = 'treadmill_3km' AND cl.succeeded IS NOT NULL
     ORDER BY ws.date DESC
     LIMIT 1`
  );
  const lastRunSessionId = lastRunResult.values?.[0]?.workout_session_id;
  if (lastRunSessionId && sessionIds.includes(lastRunSessionId)) {
    const succeeded = lastRunResult.values![0]!.succeeded === 1;
    reverseRunResult(succeeded);
  }
}

/**
 * Rollback all progressions (used when deleting ALL sessions).
 * Resets programs to defaults.
 */
export async function rollbackProgressionForAllSessions(): Promise<void> {
  const { resetPullupProgram } = await import('./pullupProgram');
  const { saveRunningProgram, loadRunningProgram } = await import('./runningProgram');

  // Reset pullup program to defaults
  resetPullupProgram();

  // Reset running program — keep the base speed but reset to uniform
  const runState = loadRunningProgram();
  if (runState) {
    // We can't know the original base speed, so just reset endSpeed/endSegments
    // keeping whatever mainSpeed is currently set
    saveRunningProgram({
      mainSpeed: runState.mainSpeed,
      endSpeed: null,
      endSegments: 0,
    });
  }
}

// ---- Internal helpers ----

async function rollbackPullupProgression(sessionId: string): Promise<void> {
  const db = await getDb();

  // Check if this is the most recent non-skipped pullup session
  const lastResult = await db.query(
    `SELECT DISTINCT pl.workout_session_id
     FROM pullup_logs pl
     JOIN workout_sessions ws ON pl.workout_session_id = ws.id
     WHERE pl.skipped = 0
     ORDER BY ws.date DESC
     LIMIT 1`
  );
  const lastSessionId = lastResult.values?.[0]?.workout_session_id;
  if (lastSessionId !== sessionId) return; // Not the latest — skip rollback

  // Get the pullup data for this session
  const pullupLogs = await pullupRepo.getPullupsBySession(sessionId);
  if (pullupLogs.length === 0) return;

  const first = pullupLogs[0]!;
  if (first.skipped) return; // Skipped sessions don't affect progression

  // Reconstruct PullupDayResult
  const dayResult: PullupDayResult = {
    dayNumber: first.pullupDay as PullupDayNumber,
    day5ActualDay:
      first.effectiveDay !== first.pullupDay
        ? (first.effectiveDay as 1 | 2 | 3 | 4)
        : null,
    sets: pullupLogs.map((log) => ({
      setNumber: log.setNumber,
      reps: log.reps,
      grip: (log.gripType as 'normal' | 'reverse' | 'wide') ?? null,
      targetReps: log.targetReps,
      succeeded: log.succeeded,
    })),
    totalReps: pullupLogs.reduce((sum, l) => sum + l.reps, 0),
    skipped: false,
  };

  // Reverse the progression
  const currentState = loadPullupProgram();
  const previousState = reverseDayResult(currentState, dayResult);
  savePullupProgram(previousState);
}

async function rollbackRunningProgression(sessionId: string): Promise<void> {
  const db = await getDb();

  // Check if this session has treadmill data with a succeeded result
  const cardioResult = await db.query(
    `SELECT succeeded FROM cardio_logs
     WHERE workout_session_id = ? AND type = 'treadmill_3km' AND succeeded IS NOT NULL`,
    [sessionId]
  );
  if (!cardioResult.values || cardioResult.values.length === 0) return;

  // Check if this is the most recent treadmill session
  const lastResult = await db.query(
    `SELECT cl.workout_session_id
     FROM cardio_logs cl
     JOIN workout_sessions ws ON cl.workout_session_id = ws.id
     WHERE cl.type = 'treadmill_3km' AND cl.succeeded IS NOT NULL
     ORDER BY ws.date DESC
     LIMIT 1`
  );
  const lastSessionId = lastResult.values?.[0]?.workout_session_id;
  if (lastSessionId !== sessionId) return; // Not the latest — skip rollback

  const succeeded = cardioResult.values[0]!.succeeded === 1;
  reverseRunResult(succeeded);
}
