// src/version.ts

/**
 * Single source of truth for app version and changelog.
 * Update this file with each release.
 */

export const APP_VERSION = '0.9.0';

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.9.0',
    date: '2026-03-09',
    changes: [
      'Первый полнофункциональный релиз',
      'Тренировки: старт, выполнение подходов, пропуск/восстановление упражнений, таймер отдыха',
      'Приоритетные упражнения (пропущенные выносятся наверх)',
      'Прогрессия повторений (+1) и автоматическое изменение веса',
      'Кардио: скакалка и бег 3 км',
      'История тренировок с фильтром по типу дня',
      'Аналитика: тоннаж, вес тела, время, бег, упражнения',
      'Редактор упражнений: добавление, изменение, порядок, деактивация/удаление',
      'Экспорт JSON/CSV, импорт JSON (v1 legacy + v2)',
      'Защита от сбоев: автосохранение состояния тренировки',
      'Система версионирования и changelog',
    ],
  },
];
