// src/components/history/historyHelpers.ts

/**
 * Shared helpers for the History page: month grouping and Russian pluralization.
 */

const MONTH_NAMES_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export interface MonthGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * Group a list of dated items by month. `getDate` returns the ISO date string.
 * Items with an empty/unparseable date are skipped.
 */
export function groupByMonth<T>(
  items: T[],
  getDate: (item: T) => string
): MonthGroup<T>[] {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const iso = getDate(item);
    if (!iso) continue;
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = d.getMonth();
    const key = `${year}-${month}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  const groups: MonthGroup<T>[] = [];
  for (const [key, group] of map) {
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr!, 10);
    const month = parseInt(monthStr!, 10);
    const monthName = MONTH_NAMES_FULL[month] ?? '';
    groups.push({ key, label: `${monthName} ${year}`, items: group });
  }

  return groups;
}

/**
 * Russian pluralization: choose form by count.
 * e.g. pluralize(n, 'тренировка', 'тренировки', 'тренировок')
 */
export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Accent colors for standalone modes */
export const PULLUP_ACCENT = '#FF9800';
export const RUNNING_ACCENT = '#03A9F4';
export const JUMP_ROPE_ACCENT = '#AB47BC';
