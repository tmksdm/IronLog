// src/utils/exportData.ts

/**
 * Export data as JSON (full backup) or CSV (per day type).
 *
 * On native platforms: uses Capacitor Filesystem + Share.
 * On web: uses Blob download or Web Share API.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { getDb } from '../db/database';
import type { BackupData } from '../types';

// ==========================================
// JSON Export
// ==========================================

/**
 * Fetches all data from the database and returns a BackupData object.
 */
export async function buildBackupData(): Promise<BackupData> {
  const db = await getDb();

  const [dayTypes, exercises, sessions, logs, cardio] = await Promise.all([
    db.query('SELECT * FROM day_types ORDER BY id'),
    db.query('SELECT * FROM exercises ORDER BY day_type_id, sort_order'),
    db.query('SELECT * FROM workout_sessions ORDER BY date DESC'),
    db.query(
      'SELECT * FROM exercise_logs ORDER BY workout_session_id, exercise_id, set_number'
    ),
    db.query('SELECT * FROM cardio_logs ORDER BY workout_session_id'),
  ]);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    dayTypes: dayTypes.values ?? [],
    exercises: exercises.values ?? [],
    workoutSessions: sessions.values ?? [],
    exerciseLogs: logs.values ?? [],
    cardioLogs: cardio.values ?? [],
  };
}

/**
 * Export all data as a JSON backup file.
 * On native: writes to cache directory and opens share dialog.
 * On web: triggers a file download via Blob.
 */
export async function exportAsJSON(): Promise<void> {
  const data = await buildBackupData();
  const json = JSON.stringify(data, null, 2);
  const fileName = `ironlog_backup_${formatDateForFile(new Date())}.json`;

  if (Capacitor.isNativePlatform()) {
    // Write to cache directory
    const result = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    await Share.share({
      title: 'IronLog Backup (JSON)',
      url: result.uri,
    });
  } else {
    // Web fallback: Blob download
    downloadBlob(json, fileName, 'application/json');
  }
}

// ==========================================
// CSV Export
// ==========================================

/**
 * Export data as CSV files — one per day type.
 * On native: writes files and shares them one by one.
 * On web: downloads each file.
 */
export async function exportAsCSV(): Promise<void> {
  const db = await getDb();

  const dayTypesResult = await db.query('SELECT * FROM day_types ORDER BY id');
  const dayTypes = (dayTypesResult.values ?? []) as Array<{
    id: number;
    name: string;
    name_ru: string;
  }>;

  for (const dayType of dayTypes) {
    const csv = await buildCSVForDayType(dayType.id, dayType.name_ru);
    const fileName = `ironlog_${dayType.name.toLowerCase()}_${formatDateForFile(new Date())}.csv`;

    // UTF-8 BOM for Excel compatibility
    const bom = '\uFEFF';
    const content = bom + csv;

    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.writeFile({
        path: fileName,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: `IronLog CSV — ${dayType.name_ru}`,
        url: result.uri,
      });
    } else {
      downloadBlob(content, fileName, 'text/csv;charset=utf-8');
    }
  }
}

// ==========================================
// CSV builder for one day type
// ==========================================

/**
 * Builds a semicolon-separated CSV for a single day type.
 *
 * Rows: one per exercise.
 * Columns: Exercise name | Working weight | per-session: P1 P2 P3 (working set reps).
 * Footer rows: body weight, tonnage, cardio.
 */
async function buildCSVForDayType(
  dayTypeId: number,
  dayTypeNameRu: string
): Promise<string> {
  const db = await getDb();

  // 1. All exercises for this day type (including inactive, for history)
  const exResult = await db.query(
    `SELECT id, name, sort_order, working_weight, has_added_weight, is_active
     FROM exercises WHERE day_type_id = ? ORDER BY sort_order`,
    [dayTypeId]
  );
  const exercises = (exResult.values ?? []) as Array<{
    id: string;
    name: string;
    sort_order: number;
    working_weight: number | null;
    has_added_weight: number;
    is_active: number;
  }>;

  // 2. All completed sessions for this day type
  const sessResult = await db.query(
    `SELECT id, date, direction, weight_before, weight_after, total_kg
     FROM workout_sessions
     WHERE day_type_id = ? AND time_end IS NOT NULL
     ORDER BY date ASC`,
    [dayTypeId]
  );
  const sessions = (sessResult.values ?? []) as Array<{
    id: string;
    date: string;
    direction: string;
    weight_before: number | null;
    weight_after: number | null;
    total_kg: number;
  }>;

  if (sessions.length === 0) {
    const rows = [
      `${dayTypeNameRu};Нет данных`,
      ...exercises.map((e) => e.name),
    ];
    return rows.join('\n');
  }

  // 3. Fetch all exercise logs grouped by session → exercise
  const sessionLogs = new Map<
    string,
    Map<string, { weight: number; reps: number; setType: string; isSkipped: number }[]>
  >();

  for (const session of sessions) {
    const logsResult = await db.query(
      `SELECT exercise_id, set_number, set_type, actual_reps, weight, is_skipped
       FROM exercise_logs
       WHERE workout_session_id = ?
       ORDER BY exercise_id, set_number`,
      [session.id]
    );
    const logs = (logsResult.values ?? []) as Array<{
      exercise_id: string;
      set_number: number;
      set_type: string;
      actual_reps: number;
      weight: number;
      is_skipped: number;
    }>;

    const exerciseMap = new Map<
      string,
      { weight: number; reps: number; setType: string; isSkipped: number }[]
    >();

    for (const log of logs) {
      if (!exerciseMap.has(log.exercise_id)) {
        exerciseMap.set(log.exercise_id, []);
      }
      exerciseMap.get(log.exercise_id)!.push({
        weight: log.weight,
        reps: log.actual_reps,
        setType: log.set_type,
        isSkipped: log.is_skipped,
      });
    }

    sessionLogs.set(session.id, exerciseMap);
  }

  // 4. Build CSV rows

  // Header row 1: day type name + empty + date columns (3 cols per session)
  const headerRow1: string[] = [dayTypeNameRu, 'Вес'];
  for (const session of sessions) {
    const dateStr = formatDateShortCSV(session.date);
    const dir = session.direction === 'normal' ? '→' : '←';
    headerRow1.push(`${dateStr} ${dir}`, '', '');
  }

  // Header row 2: labels
  const headerRow2: string[] = ['Упражнение', 'Раб. вес'];
  for (const _session of sessions) {
    headerRow2.push('Р1', 'Р2', 'Р3');
  }

  // Data rows: one per exercise
  const dataRows: string[][] = [];
  for (const exercise of exercises) {
    const row: string[] = [
      exercise.name,
      exercise.has_added_weight && exercise.working_weight !== null
        ? formatDecimalCSV(exercise.working_weight)
        : '',
    ];

    for (const session of sessions) {
      const eLogs = sessionLogs.get(session.id)?.get(exercise.id);

      if (!eLogs || eLogs.length === 0) {
        row.push('', '', '');
      } else if (eLogs[0]!.isSkipped === 1) {
        row.push('0', '', '');
      } else {
        const workingSets = eLogs.filter((l) => l.setType === 'working');
        row.push(
          workingSets[0]?.reps?.toString() ?? '',
          workingSets[1]?.reps?.toString() ?? '',
          workingSets[2]?.reps?.toString() ?? ''
        );
      }
    }

    dataRows.push(row);
  }

  // Summary rows
  const weightRow: string[] = ['Вес тела', ''];
  const tonnageRow: string[] = ['Тоннаж', ''];
  const cardioRow: string[] = [dayTypeId === 1 ? 'Скакалка' : 'Бег 3 км', ''];

  for (const session of sessions) {
    // Body weight
    const avgWeight =
      session.weight_before !== null && session.weight_after !== null
        ? (session.weight_before + session.weight_after) / 2
        : session.weight_before ?? session.weight_after ?? null;
    weightRow.push(avgWeight !== null ? formatDecimalCSV(avgWeight) : '', '', '');

    // Tonnage
    tonnageRow.push(session.total_kg.toString(), '', '');

    // Cardio
    const cardioResult = await db.query(
      'SELECT type, duration_seconds, count FROM cardio_logs WHERE workout_session_id = ?',
      [session.id]
    );
    const cardio = cardioResult.values?.[0] as
      | { type: string; duration_seconds: number | null; count: number | null }
      | undefined;

    if (!cardio) {
      cardioRow.push('', '', '');
    } else if (cardio.type === 'jump_rope') {
      cardioRow.push(cardio.count?.toString() ?? '', '', '');
    } else {
      cardioRow.push(
        cardio.duration_seconds ? formatSecondsMMSS(cardio.duration_seconds) : '',
        '',
        ''
      );
    }
  }

  // Combine all rows
  const allRows = [
    headerRow1,
    headerRow2,
    ...dataRows,
    [], // empty separator
    weightRow,
    tonnageRow,
    cardioRow,
  ];

  return allRows.map((row) => row.join(';')).join('\n');
}

// ==========================================
// Helpers
// ==========================================

function formatDateForFile(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}`;
}

function formatDateShortCSV(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function formatDecimalCSV(value: number): string {
  return value.toString().replace('.', ',');
}

function formatSecondsMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Web fallback: download a string as a file via Blob.
 */
function downloadBlob(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
