// src/utils/importData.test.ts
//
// Backup round trip against a real SQLite engine (sql.js, the same wasm build
// the web app runs): the data written by the exporter must survive
// export -> import -> export unchanged, and a broken file must leave the
// database exactly as it was.
//
// All fixtures here are synthetic. No real user backup is stored in the
// repository.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

import { CREATE_TABLES_SQL } from '../db/schema';
import { buildBackupData } from './exportData';
import { parseBackupJSON, restoreFromBackup } from './importData';
import { buildRunPlan, loadRunningProgram, saveRunningProgram } from './runningProgram';
import { loadPullupProgram, savePullupProgram } from './pullupProgram';
import type { BackupData } from '../types';

// ---- Real SQLite behind the Capacitor connection interface ----

class SqlJsConnection {
  constructor(private readonly db: Database) {}

  async execute(sql: string): Promise<unknown> {
    this.db.exec(sql);
    return { changes: { changes: 0 } };
  }

  async run(sql: string, values: unknown[] = []): Promise<unknown> {
    this.db.run(sql, values as never);
    return { changes: { changes: 1 } };
  }

  async query(sql: string, values: unknown[] = []): Promise<{ values: unknown[] }> {
    const statement = this.db.prepare(sql);
    try {
      if (values.length > 0) statement.bind(values as never);
      const rows: unknown[] = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return { values: rows };
    } finally {
      statement.free();
    }
  }

  async beginTransaction(): Promise<void> {
    this.db.run('BEGIN;');
  }
  async commitTransaction(): Promise<void> {
    this.db.run('COMMIT;');
  }
  async rollbackTransaction(): Promise<void> {
    this.db.run('ROLLBACK;');
  }
}

let connection: SqlJsConnection;
const storage = new Map<string, string>();

vi.mock('../db/database', () => ({
  getDb: async () => connection,
  saveToStore: async () => undefined,
}));

// ---- Synthetic fixtures ----

const exercise = (id: string, name: string, addedWeight: number) => ({
  id,
  day_type_id: 1,
  name,
  sort_order: 1,
  has_added_weight: addedWeight,
  working_weight: addedWeight ? 40 : null,
  weight_increment: addedWeight ? 2.5 : 0,
  warmup_1_percent: null,
  warmup_2_percent: null,
  warmup_1_reps: 0,
  warmup_2_reps: 0,
  max_reps_per_set: 8,
  min_reps_per_set: 4,
  num_working_sets: 3,
  is_timed: 0,
  timer_duration_seconds: null,
  timer_prep_seconds: null,
  is_active: 1,
});

const session = (id: string, date: string) => ({
  id,
  day_type_id: 1,
  date,
  direction: 'normal',
  weight_before: 80,
  weight_after: 80,
  time_start: `${date}T10:00:00.000Z`,
  time_end: `${date}T11:00:00.000Z`,
  total_kg: 1000,
  notes: null,
});

const log = (
  id: string,
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  actualReps: number
) => ({
  id,
  workout_session_id: sessionId,
  exercise_id: exerciseId,
  set_number: setNumber,
  set_type: setNumber <= 2 ? 'warmup' : 'working',
  target_reps: 8,
  actual_reps: actualReps,
  weight: 40,
  is_skipped: 0,
  completed_at: '2026-05-01T10:05:00.000Z',
});

const cardio = (id: string, sessionId: string, date: string) => ({
  id,
  workout_session_id: sessionId,
  date,
  type: 'treadmill_3km',
  duration_seconds: 900,
  count: null,
  succeeded: 1,
});

const pullup = (id: string, sessionId: string, date: string, setNumber: number) => ({
  id,
  workout_session_id: sessionId,
  date,
  pullup_day: 1,
  effective_day: 1,
  set_number: setNumber,
  reps: 6,
  grip_type: 'normal',
  target_reps: 6,
  succeeded: 1,
  total_reps: 18,
  skipped: 0,
});

/** A complete v2 backup with two sessions, both exercise and standalone data. */
function syntheticBackup(): BackupData {
  return {
    version: 2,
    exportedAt: '2026-05-02T00:00:00.000Z',
    dayTypes: [{ id: 1, name: 'push', name_ru: 'Жим' }],
    exercises: [exercise('ex-1', 'Жим лёжа', 1), exercise('ex-2', 'Гиперэкстензия', 0)],
    workoutSessions: [session('ses-1', '2026-05-01')],
    exerciseLogs: [
      log('log-1', 'ses-1', 'ex-1', 1, 6),
      log('log-2', 'ses-1', 'ex-1', 2, 7),
      log('log-3', 'ses-1', 'ex-2', 3, 12),
      log('log-4', 'ses-1', 'ex-2', 4, 12),
    ],
    cardioLogs: [cardio('card-1', 'ses-1', '2026-05-01')],
    pullupLogs: [
      pullup('pull-1', 'ses-1', '2026-05-01', 1),
      pullup('pull-2', 'ses-1', '2026-05-01', 2),
    ],
    runningProgram: { mainSpeed: 12, endSpeed: 13, endSegments: 1, previous: null },
    pullupProgram: {
      currentDay: 3,
      day5Rotation: 2,
      day3TargetReps: 7,
      day4TargetReps: 9,
    },
  };
}

/** Tables of a backup, without the volatile export timestamp. */
const tables = (data: BackupData) => ({
  exercises: data.exercises,
  workoutSessions: data.workoutSessions,
  exerciseLogs: data.exerciseLogs,
  cardioLogs: data.cardioLogs,
  pullupLogs: data.pullupLogs,
});

beforeEach(async () => {
  storage.clear();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
  };

  const SQL = await initSqlJs({
    locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
  });
  const db = new SQL.Database();
  db.exec(CREATE_TABLES_SQL);
  connection = new SqlJsConnection(db);
});

describe('backup round trip', () => {
  it('survives export -> import -> export unchanged', async () => {
    const original = syntheticBackup();
    await restoreFromBackup(original);

    const exported = await buildBackupData();
    expect(exported.version).toBe(2);
    expect(tables(exported)).toEqual(tables(original));
    expect(exported.pullupLogs).toHaveLength(2);
    expect(exported.cardioLogs).toHaveLength(1);
    expect(exported.exerciseLogs).toHaveLength(4);
  });

  it('carries the program state that lives outside the database', async () => {
    await restoreFromBackup(syntheticBackup());

    expect(loadRunningProgram()).toMatchObject({
      mainSpeed: 12,
      endSpeed: 13,
      endSegments: 1,
    });
    expect(loadPullupProgram()).toMatchObject({
      currentDay: 3,
      day5Rotation: 2,
      day3TargetReps: 7,
      day4TargetReps: 9,
    });

    // A restored program still plans one speed or two adjacent ones, slower first.
    expect(buildRunPlan(loadRunningProgram()!)).toEqual([
      { distanceM: 2800, speedKmh: 12 },
      { distanceM: 200, speedKmh: 13 },
    ]);

    // The exported document carries them back out again.
    const exported = await buildBackupData();
    expect(exported.runningProgram).toMatchObject({ mainSpeed: 12, endSegments: 1 });
    expect(exported.pullupProgram).toMatchObject({ currentDay: 3 });
  });

  it('replaces existing data with the backup', async () => {
    await restoreFromBackup(syntheticBackup());

    const replaced = syntheticBackup();
    replaced.workoutSessions = [session('ses-2', '2026-04-01')];
    replaced.exerciseLogs = [log('log-9', 'ses-2', 'ex-1', 1, 8)];
    replaced.cardioLogs = [];
    replaced.pullupLogs = [];
    await restoreFromBackup(replaced);

    const exported = await buildBackupData();
    expect(exported.workoutSessions).toHaveLength(1);
    expect(exported.workoutSessions[0]!.id).toBe('ses-2');
    expect(exported.exerciseLogs).toHaveLength(1);
    expect(exported.cardioLogs).toHaveLength(0);
    expect(exported.pullupLogs).toHaveLength(0);
  });
});

describe('restore is atomic', () => {
  it('leaves the database untouched when a row cannot be inserted', async () => {
    const good = syntheticBackup();
    await restoreFromBackup(good);
    const before = await buildBackupData();

    // A pull-up row without reps violates NOT NULL — the insert fails after the
    // tables have already been cleared, which is exactly what the transaction
    // has to protect against.
    const broken = syntheticBackup();
    broken.pullupLogs = [
      { ...pullup('pull-1', 'ses-1', '2026-05-01', 1), reps: null },
    ];

    await expect(restoreFromBackup(broken)).rejects.toThrow(
      /Не удалось восстановить данные из файла/
    );

    const after = await buildBackupData();
    expect(tables(after)).toEqual(tables(before));
  });

  it('does not replace the local program state when the file has none', async () => {
    saveRunningProgram({ mainSpeed: 14, endSpeed: null, endSegments: 0, previous: null });
    savePullupProgram({
      currentDay: 5,
      day5Rotation: 4,
      day3TargetReps: 11,
      day4TargetReps: 12,
    });

    const legacy = syntheticBackup();
    delete legacy.runningProgram;
    delete legacy.pullupProgram;
    await restoreFromBackup(legacy);

    expect(loadRunningProgram()).toMatchObject({ mainSpeed: 14 });
    expect(loadPullupProgram()).toMatchObject({ currentDay: 5, day3TargetReps: 11 });
  });
});

describe('parseBackupJSON', () => {
  it('reports the contents of a v2 file', () => {
    const preview = parseBackupJSON(JSON.stringify(syntheticBackup()));

    expect(preview.version).toBe(2);
    expect(preview.exerciseCount).toBe(2);
    expect(preview.sessionCount).toBe(1);
    expect(preview.logCount).toBe(4);
    expect(preview.cardioCount).toBe(1);
    expect(preview.pullupCount).toBe(2);
    expect(preview.dateRange).toBe('01.05.2026 — 01.05.2026');
  });

  it('still accepts a v1 file without the program state', () => {
    const legacy = syntheticBackup() as unknown as Record<string, unknown>;
    legacy.version = 1;
    delete legacy.pullupProgram;
    delete legacy.runningProgram;

    const preview = parseBackupJSON(JSON.stringify(legacy));
    expect(preview.version).toBe(1);
    expect(preview.pullupCount).toBe(2);
  });

  it('rejects a file that is not a backup', () => {
    expect(() => parseBackupJSON('{"hello":"world"}')).toThrow(/не похож на бэкап/);
    expect(() => parseBackupJSON('not json at all')).toThrow(/повреждён/);
  });
});
