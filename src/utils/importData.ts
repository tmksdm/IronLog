// src/utils/importData.ts

/**
 * Import data from a JSON backup file.
 * Supports both v1 (legacy FitTracker) and v2 (IronLog) formats.
 *
 * The legacy FitTracker format (version: 1) has identical table structure
 * (same column names in snake_case), so import is straightforward.
 */

import { getDb, saveToStore } from '../db/database';
import type { BackupData } from '../types';
import {
  saveRunningProgram,
  type RunningProgramState,
  type RunningProgramStateSnapshot,
} from './runningProgram';
import {
  savePullupProgram,
  type PullupDayNumber,
  type PullupProgramState,
} from './pullupProgram';


// ==========================================
// Types
// ==========================================

/** Preview info shown to user before confirming import. */
export interface ImportPreview {
  exportedAt: string;
  version: number;
  exerciseCount: number;
  sessionCount: number;
  logCount: number;
  cardioCount: number;
  pullupCount: number;
  dateRange: string;
  raw: BackupData;
}

// ==========================================
// Pick & Parse (Web: <input type="file">)
// ==========================================

/**
 * Opens a file picker (web <input>), reads and validates the JSON,
 * returns a preview object or null if user cancelled.
 */
export function pickAndParseBackup(): Promise<ImportPreview | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const preview = parseBackupJSON(text);
        resolve(preview);
      } catch (err) {
        reject(err);
      }
    };

    // If user cancels the picker, onchange won't fire.
    // Use a focus listener to detect cancellation after a delay.
    input.oncancel = () => resolve(null);

    input.click();
  });
}

/**
 * Parse a raw JSON string into an ImportPreview.
 * Validates structure and detects version.
 */
export function parseBackupJSON(jsonString: string): ImportPreview {
  let data: BackupData;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Файл повреждён или не является JSON.');
  }

  // Validate required fields
  if (!data.workoutSessions || !data.exerciseLogs) {
    throw new Error(
      'Файл не похож на бэкап IronLog/FitTracker. Отсутствуют обязательные поля.'
    );
  }

  if (!Array.isArray(data.workoutSessions) || !Array.isArray(data.exerciseLogs)) {
    throw new Error('Некорректный формат данных в файле бэкапа.');
  }

  // Detect version (v1 = FitTracker legacy, v2 = IronLog native)
  const version = data.version ?? 1;

  // Build date range
  let dateRange = 'нет данных';
  if (data.workoutSessions.length > 0) {
    const dates = data.workoutSessions
      .map((s: any) => s.date || s.time_start)
      .filter(Boolean)
      .map((d: string) => new Date(d).getTime())
      .filter((t: number) => !isNaN(t));

    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      dateRange = `${formatDateRu(minDate)} — ${formatDateRu(maxDate)}`;
    }
  }

  return {
    exportedAt: data.exportedAt ?? 'неизвестно',
    version,
    exerciseCount: data.exercises?.length ?? 0,
    sessionCount: data.workoutSessions.length,
    logCount: data.exerciseLogs.length,
    cardioCount: data.cardioLogs?.length ?? 0,
    pullupCount: data.pullupLogs?.length ?? 0,
    dateRange,
    raw: data,
  };
}

// ==========================================
// Restore
// ==========================================

/**
 * Replaces ALL app data with the backup.
 * Day types are NOT replaced (they are always the same 3 rows).
 * Active workout state is cleared.
 *
 * Works identically for v1 and v2 since the FitTracker backup
 * uses the same snake_case column names.
 */
export async function restoreFromBackup(data: BackupData): Promise<void> {
  const db = await getDb();

  // Foreign keys are switched off OUTSIDE the transaction: the SQLite engine
  // used on the web ignores a pragma change made inside an open transaction,
  // and older backups may contain rows whose parent session is missing.
  await db.execute('PRAGMA foreign_keys = OFF;', false);

  try {
    // Everything below runs in a single transaction: either the whole backup
    // lands or the database is left exactly as it was. Statements therefore
    // bypass the per-statement transaction wrapper (transaction = false).
    await db.beginTransaction();

    // 1. Clear all existing data (order matters for FK constraints)
    await db.execute('DELETE FROM active_workout_state;', false);
    await db.execute('DELETE FROM pullup_logs;', false);
    await db.execute('DELETE FROM cardio_logs;', false);
    await db.execute('DELETE FROM exercise_logs;', false);
    await db.execute('DELETE FROM workout_sessions;', false);
    await db.execute('DELETE FROM exercises;', false);

    // 2. Insert exercises
    for (const e of data.exercises) {
      await db.run(
        `INSERT INTO exercises
          (id, day_type_id, name, sort_order, has_added_weight,
           working_weight, weight_increment,
           warmup_1_percent, warmup_2_percent,
           warmup_1_reps, warmup_2_reps,
           max_reps_per_set, min_reps_per_set,
           num_working_sets, is_timed,
           timer_duration_seconds, timer_prep_seconds, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id,
          e.day_type_id,
          e.name,
          e.sort_order,
          e.has_added_weight,
          e.working_weight,
          e.weight_increment,
          e.warmup_1_percent,
          e.warmup_2_percent,
          e.warmup_1_reps,
          e.warmup_2_reps,
          e.max_reps_per_set,
          e.min_reps_per_set,
          e.num_working_sets,
          e.is_timed ?? 0,
          e.timer_duration_seconds ?? null,
          e.timer_prep_seconds ?? null,
          e.is_active ?? 1,
        ],
        false
      );
    }

    // 3. Insert workout sessions
    for (const s of data.workoutSessions) {
      await db.run(
        `INSERT INTO workout_sessions
          (id, day_type_id, date, direction, weight_before, weight_after,
           time_start, time_end, total_kg, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.id,
          s.day_type_id,
          s.date,
          s.direction,
          s.weight_before,
          s.weight_after,
          s.time_start,
          s.time_end,
          s.total_kg,
          s.notes ?? null,
        ],
        false
      );
    }

    // 4. Insert exercise logs
    for (const l of data.exerciseLogs) {
      await db.run(
        `INSERT INTO exercise_logs
          (id, workout_session_id, exercise_id, set_number, set_type,
           target_reps, actual_reps, weight, is_skipped, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          l.id,
          l.workout_session_id,
          l.exercise_id,
          l.set_number,
          l.set_type,
          l.target_reps,
          l.actual_reps,
          l.weight,
          l.is_skipped,
          l.completed_at ?? null,
        ],
        false
      );
    }

    // Build a lookup: workout_session_id -> session date.
    // Used to backfill the new 'date' column on cardio/pullup logs (v0.18.0+).
    const sessionDateById = new Map<string, string>();
    for (const s of data.workoutSessions as any[]) {
      if (s.id) {
        sessionDateById.set(String(s.id), String(s.date ?? s.time_start ?? ''));
      }
    }



    // 5. Insert cardio logs
    if (data.cardioLogs && data.cardioLogs.length > 0) {
      for (const c of data.cardioLogs) {
        const cardioDate =
          (c as any).date ?? sessionDateById.get(String(c.workout_session_id)) ?? null;
        await db.run(
          `INSERT INTO cardio_logs
            (id, workout_session_id, date, type, duration_seconds, count, succeeded)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            c.id,
            c.workout_session_id,
            cardioDate,
            c.type,
            c.duration_seconds ?? null,
            c.count ?? null,
            (c as any).succeeded ?? null,
          ],
          false
        );
      }
    }


    // 6. Insert pullup logs
    if (data.pullupLogs && data.pullupLogs.length > 0) {
      for (const p of data.pullupLogs) {
        const pullupDate =
          (p as any).date ?? sessionDateById.get(String(p.workout_session_id)) ?? null;
        await db.run(
          `INSERT INTO pullup_logs
            (id, workout_session_id, date, pullup_day, effective_day, set_number,
             reps, grip_type, target_reps, succeeded, total_reps, skipped)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.workout_session_id,
            pullupDate,
            p.pullup_day,
            p.effective_day,
            p.set_number,
            p.reps,
            p.grip_type ?? null,
            p.target_reps ?? null,
            p.succeeded ?? 0,
            p.total_reps ?? 0,
            p.skipped ?? 0,
          ],
          false
        );
      }
    }

    await db.commitTransaction();
  } catch (error) {
    await db.rollbackTransaction();
    throw new Error(
      'Не удалось восстановить данные из файла: ' +
        (error instanceof Error ? error.message : String(error))
    );
  } finally {
    await db.execute('PRAGMA foreign_keys = ON;', false);
  }

  // Persist the restored database to IndexedDB before touching program state.
  await saveToStore();

  // Progress that lives in localStorage is replaced only when the backup
  // carries it, so v1 files and older v2 files leave the current plans alone.
  const running = readRunningProgramState(data.runningProgram);
  if (running) saveRunningProgram(running);

  const pullup = readPullupProgramState(data.pullupProgram);
  if (pullup) savePullupProgram(pullup);
}

/**
 * Reads the running program state from a backup. Returns null when the field is
 * missing or unusable, in which case the local progress is kept as it is.
 */
function readRunningProgramState(value: unknown): RunningProgramState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<RunningProgramState>;
  if (typeof raw.mainSpeed !== 'number' || !Number.isFinite(raw.mainSpeed)) {
    return null;
  }
  return {
    mainSpeed: raw.mainSpeed,
    endSpeed: typeof raw.endSpeed === 'number' ? raw.endSpeed : null,
    endSegments: typeof raw.endSegments === 'number' ? raw.endSegments : 0,
    previous:
      raw.previous && typeof raw.previous === 'object'
        ? (raw.previous as RunningProgramStateSnapshot)
        : null,
  };
}

/** Reads the pull-up program state from a backup; null when it is unusable. */
function readPullupProgramState(value: unknown): PullupProgramState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PullupProgramState>;
  const day = raw.currentDay;
  if (typeof day !== 'number' || day < 1 || day > 5) return null;

  const rotation = raw.day5Rotation;
  return {
    currentDay: day as PullupDayNumber,
    day5Rotation:
      typeof rotation === 'number' && rotation >= 1 && rotation <= 4
        ? (rotation as 1 | 2 | 3 | 4)
        : 1,
    day3TargetReps:
      typeof raw.day3TargetReps === 'number' ? raw.day3TargetReps : 0,
    day4TargetReps:
      typeof raw.day4TargetReps === 'number' ? raw.day4TargetReps : 0,
  };
}

// ==========================================
// Helpers
// ==========================================

function formatDateRu(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}
