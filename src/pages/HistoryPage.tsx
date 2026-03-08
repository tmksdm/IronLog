// src/pages/HistoryPage.tsx

/**
 * Workout history page.
 * Lists all completed workout sessions with filtering by day type.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Dumbbell,
  Scale,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { workoutRepo } from '../db';
import type { WorkoutSession } from '../types';
import {
  formatDate,
  formatTonnage,
  formatWorkoutDuration,
  formatDecimal,
} from '../utils/format';
import { getDayTypeColor, DAY_TYPE_NAMES_RU } from '../theme';

// Filter options
type FilterOption = 'all' | 1 | 2 | 3;

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 1, label: 'Присед' },
  { value: 2, label: 'Тяга' },
  { value: 3, label: 'Жим' },
];

export function HistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const [isLoading, setIsLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await workoutRepo.getAllSessions();
      // Only show completed sessions (with timeEnd)
      const completed = all.filter((s) => s.timeEnd !== null);
      setSessions(completed);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Apply filter
  const filteredSessions =
    filter === 'all'
      ? sessions
      : sessions.filter((s) => s.dayTypeId === filter);

  // Group sessions by month (e.g., "Март 2026")
  const grouped = groupByMonth(filteredSessions);

  return (
    <div className="flex flex-col min-h-screen bg-[#121212] pb-20">
      {/* Header */}
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-bold text-white">История</h1>
        <p className="text-sm text-[#B0B0B0] mt-0.5">
          {filteredSessions.length}{' '}
          {pluralize(filteredSessions.length, 'тренировка', 'тренировки', 'тренировок')}
        </p>
      </header>

      {/* Filter tabs */}
      <div className="px-5 pb-3">
        <div className="flex gap-2">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = filter === opt.value;
            const accentColor =
              typeof opt.value === 'number'
                ? getDayTypeColor(opt.value)
                : undefined;

            return (
              <button
                key={String(opt.value)}
                onClick={() => setFilter(opt.value)}
                className={`
                  px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors select-none
                  ${isActive
                    ? 'text-white'
                    : 'bg-[#1E1E1E] text-[#B0B0B0] active:bg-[#2A2A2A]'
                  }
                `}
                style={
                  isActive
                    ? {
                        backgroundColor: accentColor ?? '#4CAF50',
                      }
                    : undefined
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="text-[#707070] animate-spin" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Calendar size={48} className="text-[#333333] mb-3" />
            <p className="text-[#707070] text-sm">Нет тренировок</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map((group) => (
              <div key={group.key}>
                {/* Month header */}
                <h2 className="text-sm font-semibold text-[#707070] uppercase tracking-wide mb-2">
                  {group.label}
                </h2>

                {/* Session cards */}
                <div className="flex flex-col gap-2.5">
                  {group.sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onClick={() =>
                        navigate(`/detail/${session.id}`)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Session Card
// ==========================================

interface SessionCardProps {
  session: WorkoutSession;
  onClick: () => void;
}

function SessionCard({ session, onClick }: SessionCardProps) {
  const accentColor = getDayTypeColor(session.dayTypeId);
  const dayName = DAY_TYPE_NAMES_RU[session.dayTypeId] ?? '';
  const directionLabel = session.direction === 'normal' ? '→' : '←';

  const duration =
    session.timeStart && session.timeEnd
      ? formatWorkoutDuration(session.timeStart, session.timeEnd)
      : null;

  const avgWeight =
    session.weightBefore !== null && session.weightAfter !== null
      ? (session.weightBefore + session.weightAfter) / 2
      : session.weightBefore ?? session.weightAfter;

  return (
    <button
      onClick={onClick}
      className="w-full bg-[#252525] rounded-xl p-3.5 flex items-center gap-3
                 active:bg-[#2A2A2A] transition-colors text-left"
    >
      {/* Day type accent bar */}
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: accentColor }}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top row: day name + direction + date */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-white" style={{ color: accentColor }}>
            {dayName}
          </span>
          <span className="text-[#707070] text-sm">{directionLabel}</span>
          <span className="text-[#707070] text-xs ml-auto shrink-0">
            {formatDate(session.date)}
          </span>
        </div>

        {/* Bottom row: stats */}
        <div className="flex items-center gap-4 text-[#B0B0B0]">
          {session.totalKg > 0 && (
            <div className="flex items-center gap-1">
              <Dumbbell size={13} className="text-[#707070]" />
              <span className="text-xs">{formatTonnage(session.totalKg)}</span>
            </div>
          )}
          {duration && (
            <div className="flex items-center gap-1">
              <Clock size={13} className="text-[#707070]" />
              <span className="text-xs">{duration}</span>
            </div>
          )}
          {avgWeight !== null && (
            <div className="flex items-center gap-1">
              <Scale size={13} className="text-[#707070]" />
              <span className="text-xs">{formatDecimal(avgWeight)} кг</span>
            </div>
          )}
        </div>
      </div>

      {/* Chevron */}
      <ChevronRight size={18} className="text-[#555555] shrink-0" />
    </button>
  );
}

// ==========================================
// Helpers
// ==========================================

const MONTH_NAMES_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface MonthGroup {
  key: string;
  label: string;
  sessions: WorkoutSession[];
}

function groupByMonth(sessions: WorkoutSession[]): MonthGroup[] {
  const map = new Map<string, WorkoutSession[]>();

  for (const s of sessions) {
    const d = new Date(s.date);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-based
    const key = `${year}-${month}`;

    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(s);
  }

  const groups: MonthGroup[] = [];
  for (const [key, group] of map) {
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr!, 10);
    const month = parseInt(monthStr!, 10);
    const monthName = MONTH_NAMES_FULL[month] ?? '';

    groups.push({
      key,
      label: `${monthName} ${year}`,
      sessions: group,
    });
  }

  return groups;
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
