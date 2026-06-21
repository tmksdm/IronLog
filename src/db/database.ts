// ==========================================
// SQLite initialization for Capacitor
// Handles both native (Android/iOS) and web (jeep-sqlite)
// ==========================================

import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';

import { CREATE_TABLES_SQL, SEED_DAY_TYPES_SQL, SEED_EXERCISES_SQL } from './schema';

const sqlite = new SQLiteConnection(CapacitorSQLite);

let db: SQLiteDBConnection | null = null;
let initialized = false;

/**
 * Initialize the web platform (jeep-sqlite).
 * Dynamically creates the <jeep-sqlite> element and waits for it to be ready.
 */
async function initWeb(): Promise<void> {
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  await defineCustomElements(window);

  let jeepEl = document.querySelector('jeep-sqlite');
  if (!jeepEl) {
    jeepEl = document.createElement('jeep-sqlite');
    // Tell jeep-sqlite where to find sql-wasm.wasm
    jeepEl.setAttribute('wasmPath', import.meta.env.BASE_URL + 'assets');
    document.body.appendChild(jeepEl);
  }

  await customElements.whenDefined('jeep-sqlite');
  await sqlite.initWebStore();
}

/**
 * Check whether a table has a given column.
 */
async function tableHasColumn(
  connection: SQLiteDBConnection,
  table: string,
  column: string
): Promise<boolean> {
  const info = await connection.query(`PRAGMA table_info('${table}')`);
  const columns = (info.values ?? []) as Array<{ name: string }>;
  return columns.some((col) => col.name === column);
}

/**
 * Run schema migrations safely. Each migration checks if already applied.
 */
async function runMigrations(connection: SQLiteDBConnection): Promise<void> {
  try {
    // v0.12.0: Add 'succeeded' column to cardio_logs (only relevant for very old DBs;
    // the cardio_logs rebuild below also guarantees this column exists).
    const cardioHasSucceeded = await tableHasColumn(
      connection,
      'cardio_logs',
      'succeeded'
    );
    if (!cardioHasSucceeded) {
      await connection.execute(
        'ALTER TABLE cardio_logs ADD COLUMN succeeded INTEGER;'
      );
      console.log('Migration: added succeeded column to cardio_logs');
    }

    // v0.13.0: Add pullup_logs table (for DBs created before pull-ups existed).
    const pullupTableCheck = await connection.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pullup_logs'"
    );
    const hasPullupTable = (pullupTableCheck.values ?? []).length > 0;

    if (!hasPullupTable) {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS pullup_logs (
          id TEXT PRIMARY KEY,
          workout_session_id TEXT,
          date TEXT,
          pullup_day INTEGER NOT NULL,
          effective_day INTEGER NOT NULL,
          set_number INTEGER NOT NULL,
          reps INTEGER NOT NULL DEFAULT 0,
          grip_type TEXT,
          target_reps INTEGER,
          succeeded INTEGER NOT NULL DEFAULT 0,
          total_reps INTEGER NOT NULL DEFAULT 0,
          skipped INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id)
        );
        CREATE INDEX IF NOT EXISTS idx_pullup_logs_session
          ON pullup_logs(workout_session_id);
      `);
      console.log('Migration: created pullup_logs table');
    }

    // v0.18.0 (Standalone refactor, Phase 1):
    // Make workout_session_id nullable + add own 'date' column on cardio_logs.
    // SQLite cannot drop NOT NULL / change FK via ALTER, so we rebuild the table.
    // Detected by absence of the 'date' column (idempotent).
    const cardioHasDate = await tableHasColumn(connection, 'cardio_logs', 'date');
    if (!cardioHasDate) {
      await connection.execute('PRAGMA foreign_keys = OFF;');
      await connection.execute(`
        CREATE TABLE cardio_logs_new (
          id TEXT PRIMARY KEY,
          workout_session_id TEXT,
          date TEXT,
          type TEXT NOT NULL CHECK (type IN ('jump_rope', 'treadmill_3km')),
          duration_seconds INTEGER,
          count INTEGER,
          succeeded INTEGER,
          FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id)
        );

        -- Copy data, backfilling date from the joined workout session.
        INSERT INTO cardio_logs_new
          (id, workout_session_id, date, type, duration_seconds, count, succeeded)
        SELECT
          cl.id,
          cl.workout_session_id,
          ws.date,
          cl.type,
          cl.duration_seconds,
          cl.count,
          cl.succeeded
        FROM cardio_logs cl
        LEFT JOIN workout_sessions ws ON cl.workout_session_id = ws.id;

        DROP TABLE cardio_logs;
        ALTER TABLE cardio_logs_new RENAME TO cardio_logs;

        CREATE INDEX IF NOT EXISTS idx_cardio_logs_session
          ON cardio_logs(workout_session_id);
        CREATE INDEX IF NOT EXISTS idx_cardio_logs_date
          ON cardio_logs(date);
      `);
      await connection.execute('PRAGMA foreign_keys = ON;');
      console.log('Migration: rebuilt cardio_logs (nullable FK + date, backfilled)');
    }

    // v0.18.0 (Standalone refactor, Phase 1):
    // Make workout_session_id nullable + add own 'date' column on pullup_logs.
    const pullupHasDate = await tableHasColumn(connection, 'pullup_logs', 'date');
    if (!pullupHasDate) {
      await connection.execute('PRAGMA foreign_keys = OFF;');
      await connection.execute(`
        CREATE TABLE pullup_logs_new (
          id TEXT PRIMARY KEY,
          workout_session_id TEXT,
          date TEXT,
          pullup_day INTEGER NOT NULL,
          effective_day INTEGER NOT NULL,
          set_number INTEGER NOT NULL,
          reps INTEGER NOT NULL DEFAULT 0,
          grip_type TEXT,
          target_reps INTEGER,
          succeeded INTEGER NOT NULL DEFAULT 0,
          total_reps INTEGER NOT NULL DEFAULT 0,
          skipped INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id)
        );

        -- Copy data, backfilling date from the joined workout session.
        INSERT INTO pullup_logs_new
          (id, workout_session_id, date, pullup_day, effective_day, set_number,
           reps, grip_type, target_reps, succeeded, total_reps, skipped)
        SELECT
          pl.id,
          pl.workout_session_id,
          ws.date,
          pl.pullup_day,
          pl.effective_day,
          pl.set_number,
          pl.reps,
          pl.grip_type,
          pl.target_reps,
          pl.succeeded,
          pl.total_reps,
          pl.skipped
        FROM pullup_logs pl
        LEFT JOIN workout_sessions ws ON pl.workout_session_id = ws.id;

        DROP TABLE pullup_logs;
        ALTER TABLE pullup_logs_new RENAME TO pullup_logs;

        CREATE INDEX IF NOT EXISTS idx_pullup_logs_session
          ON pullup_logs(workout_session_id);
        CREATE INDEX IF NOT EXISTS idx_pullup_logs_date
          ON pullup_logs(date);
      `);
      await connection.execute('PRAGMA foreign_keys = ON;');
      console.log('Migration: rebuilt pullup_logs (nullable FK + date, backfilled)');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
}

/**
 * Open the database and run schema + seed migrations.
 */
async function openAndInit(): Promise<SQLiteDBConnection> {
  // Web platform requires jeep-sqlite initialization
  if (!Capacitor.isNativePlatform()) {
    await initWeb();
  }

  // Check if connection already exists (e.g., after a hot reload)
  const isConn = await sqlite.isConnection('ironlog', false);
  let connection: SQLiteDBConnection;

  if (isConn.result) {
    connection = await sqlite.retrieveConnection('ironlog', false);
  } else {
    connection = await sqlite.createConnection(
      'ironlog',
      false,
      'no-encryption',
      1,
      false
    );
  }

  await connection.open();

  // Enable foreign keys
  await connection.execute('PRAGMA foreign_keys = ON;');

  // Create tables
  await connection.execute(CREATE_TABLES_SQL);

  // Seed day types (INSERT OR IGNORE is safe to run every time)
  await connection.execute(SEED_DAY_TYPES_SQL);

  // Seed exercises ONLY if the table is empty
  const countResult = await connection.query(
    'SELECT COUNT(*) as cnt FROM exercises'
  );
  const count = countResult.values?.[0]?.cnt ?? 0;
  if (count === 0) {
    await connection.execute(SEED_EXERCISES_SQL);
    console.log('Seeded default exercises (first run)');
  }

  // Run schema migrations (idempotent)
  await runMigrations(connection);

  console.log('Database initialized successfully');
  return connection;
}

/**
 * Get the database connection (singleton).
 * Initializes on first call, reuses on subsequent calls.
 */
export async function getDb(): Promise<SQLiteDBConnection> {
  if (db && initialized) {
    try {
      await db.query('SELECT 1');
      return db;
    } catch {
      console.log('Database connection lost, reopening...');
      db = null;
      initialized = false;
    }
  }

  db = await openAndInit();
  initialized = true;
  return db;
}

/**
 * Save the web store to IndexedDB (required for jeep-sqlite persistence).
 * On native platforms this is a no-op.
 */
export async function saveToStore(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    await sqlite.saveToStore('ironlog');
  }
}

/**
 * Generate a UUID using the native crypto API.
 */
export function generateId(): string {
  return crypto.randomUUID();
}
