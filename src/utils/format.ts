// src/utils/format.ts

/**
 * Formatting utilities for display in the UI.
 * Uses Russian locale conventions (comma as decimal separator).
 */

/**
 * Formats a decimal number with Russian comma separator.
 * Removes trailing zeros after the decimal point.
 *
 * @param value - Number to format
 * @param decimals - Maximum decimal places (default 2)
 * @returns Formatted string with comma as decimal separator
 *
 * @example
 *   formatDecimal(84.75)  → "84,75"
 *   formatDecimal(80.0)   → "80"
 *   formatDecimal(47.5)   → "47,5"
 *   formatDecimal(100)    → "100"
 */
export function formatDecimal(value: number, decimals: number = 2): string {
  // Round to specified decimal places
  const rounded = Number(value.toFixed(decimals));

  // If it's an integer, return without decimal part
  if (Number.isInteger(rounded)) {
    return rounded.toString();
  }

  // Replace dot with comma for Russian locale
  return rounded.toString().replace('.', ',');
}

/**
 * Formats weight in kg with Russian conventions.
 *
 * @param kg - Weight in kilograms
 * @returns Formatted string like "84,75 кг" or "80 кг"
 */
export function formatWeight(kg: number): string {
  return `${formatDecimal(kg)} кг`;
}

/**
 * Formats tonnage (total kg lifted) — no thousands separator, no decimals.
 *
 * @param kg - Total kilograms
 * @returns Formatted string like "2530 кг"
 */
export function formatTonnage(kg: number): string {
  return `${Math.round(kg)} кг`;
}

/**
 * Formats a duration in minutes from a number of minutes.
 *
 * @param minutes - Duration in minutes (can be fractional)
 * @returns Formatted string like "45 мин" or "1 ч 15 мин"
 */
export function formatDurationMinutes(minutes: number): string {
  const totalMin = Math.round(minutes);

  if (totalMin < 60) {
    return `${totalMin} мин`;
  }

  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  if (mins === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${mins} мин`;
}

/**
 * Formats a duration from milliseconds difference between two ISO datetime strings.
 *
 * @param timeStart - ISO datetime string (start)
 * @param timeEnd - ISO datetime string (end)
 * @returns Formatted duration string, or null if inputs are invalid
 */
export function formatWorkoutDuration(
  timeStart: string,
  timeEnd: string | null
): string | null {
  if (!timeEnd) return null;

  const startMs = new Date(timeStart).getTime();
  const endMs = new Date(timeEnd).getTime();

  if (isNaN(startMs) || isNaN(endMs)) return null;

  const diffMs = endMs - startMs;
  if (diffMs < 0) return null;

  const totalMinutes = diffMs / 1000 / 60;
  return formatDurationMinutes(totalMinutes);
}

/**
 * Formats seconds as mm:ss (for treadmill run time).
 *
 * @param totalSeconds - Duration in seconds
 * @returns Formatted string like "15:30"
 */
export function formatTimeMMSS(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats seconds as a countdown display (just seconds with no leading zero).
 * Used for rest timer.
 *
 * @param totalSeconds - Seconds remaining
 * @returns Formatted string like "45" or "120"
 */
export function formatCountdown(totalSeconds: number): string {
  return Math.max(0, Math.ceil(totalSeconds)).toString();
}

/**
 * Formats an ISO date string to a human-readable Russian format.
 *
 * @param isoDate - ISO datetime string
 * @param includeTime - Whether to include time (default false)
 * @returns Formatted date like "15 марта 2025" or "15 марта 2025, 18:30"
 */
export function formatDate(isoDate: string, includeTime: boolean = false): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;

  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  let result = `${day} ${month} ${year}`;

  if (includeTime) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    result += `, ${hours}:${minutes}`;
  }

  return result;
}

/**
 * Formats an ISO date string to a short format for lists.
 *
 * @param isoDate - ISO datetime string
 * @returns Formatted date like "15.03.2025"
 */
export function formatDateShort(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
}

/**
 * Formats a set display string like "8+8+8" or "7+7+6".
 *
 * @param reps - Array of rep counts
 * @returns Formatted string with "+" separator
 */
export function formatRepsSum(reps: number[]): string {
  return reps.join('+');
}

/**
 * Returns the day-of-week abbreviation in Russian.
 *
 * @param isoDate - ISO datetime string
 * @returns Short day name like "Пн", "Вт", etc.
 */
export function formatDayOfWeek(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';

  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return days[date.getDay()] ?? '';
}
