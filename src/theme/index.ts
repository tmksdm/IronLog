// src/theme/index.ts

/**
 * Centralized color constants for use in components that can't use Tailwind classes.
 * Most styling is done via Tailwind — use these only for SVG, Recharts, inline styles.
 */

export const colors = {
  background: '#121212',
  surface: '#1E1E1E',
  surfaceLight: '#2A2A2A',
  card: '#252525',

  primary: '#4CAF50',
  primaryDark: '#388E3C',
  primaryLight: '#81C784',

  secondary: '#FF9800',
  secondaryDark: '#F57C00',

  error: '#F44336',
  info: '#2196F3',

  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#707070',

  border: '#333333',

  // Day type accent colors
  squat: '#E91E63',
  pull: '#2196F3',
  bench: '#9C27B0',

  // Exercise status colors
  statusNotStarted: '#555555',
  statusInProgress: '#FF9800',
  statusCompleted: '#4CAF50',
  statusSkipped: '#F44336',
} as const;

export type DayTypeColorKey = 'squat' | 'pull' | 'bench';

/**
 * Returns the accent color for a given day type id.
 */
export function getDayTypeColor(dayTypeId: number): string {
  switch (dayTypeId) {
    case 1: return colors.squat;
    case 2: return colors.pull;
    case 3: return colors.bench;
    default: return colors.primary;
  }
}

/**
 * Returns the Tailwind text color class for a day type.
 */
export function getDayTypeTextClass(dayTypeId: number): string {
  switch (dayTypeId) {
    case 1: return 'text-pink-500';
    case 2: return 'text-blue-500';
    case 3: return 'text-purple-500';
    default: return 'text-green-500';
  }
}

/**
 * Returns the Tailwind background color class for a day type.
 */
export function getDayTypeBgClass(dayTypeId: number): string {
  switch (dayTypeId) {
    case 1: return 'bg-pink-500';
    case 2: return 'bg-blue-500';
    case 3: return 'bg-purple-500';
    default: return 'bg-green-500';
  }
}

/**
 * Returns the status color (hex) for an exercise status.
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return colors.statusCompleted;
    case 'in_progress': return colors.statusInProgress;
    case 'skipped': return colors.statusSkipped;
    default: return colors.statusNotStarted;
  }
}
