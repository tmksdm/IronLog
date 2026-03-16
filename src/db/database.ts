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
 * Run schema migrations safely. Each migration checks if already applied.
 */
async function runMigrations(connection: SQLiteDBConnection): Promise<void> {
  try {
    // v0.12.0: Add 'succeeded' column to cardio_logs
    const tableInfo = await connection.query("PRAGMA table_info('cardio_logs')");
    const columns = (tableInfo.values ?? []) as Array<{ name: string }>;
    const hasSucceeded = columns.some((col) => col.name === 'succeeded');

    if (!hasSucceeded) {
      await connection.execute(
        'ALTER TABLE cardio_logs ADD COLUMN succeeded INTEGER;'
      );
      console.log('Migration: added succeeded column to cardio_logs');
    }

    // v0.13.0: Add pullup_logs table
    const pullupTableCheck = await connection.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pullup_logs'"
    );
    const hasPullupTable = (pullupTableCheck.values ?? []).length > 0;

    if (!hasPullupTable) {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS pullup_logs (
          id TEXT PRIMARY KEY,
          workout_session_id TEXT NOT NULL,
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
