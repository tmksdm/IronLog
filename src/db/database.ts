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
  // Import the Stencil loader and register the jeep-sqlite custom element
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  await defineCustomElements(window);

  // Create <jeep-sqlite> element if not already present
  let jeepEl = document.querySelector('jeep-sqlite');
  if (!jeepEl) {
    jeepEl = document.createElement('jeep-sqlite');
    document.body.appendChild(jeepEl);
  }

  await customElements.whenDefined('jeep-sqlite');
  await sqlite.initWebStore();
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
