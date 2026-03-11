// src/pages/HistoryPage.tsx

/**
 * Workout history page.
 * Lists all completed workout sessions with filtering by day type.
 * Supports selection mode for batch deletion.
 * Preserves scroll position and filter when navigating back from detail.
 * Loads sessions in pages of PAGE_SIZE for performance.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Dumbbell,
  Scale,
  ChevronRight,
  Loader2,
  Trash2,
  X,
  CheckSquare,
  Square,
  Minus,
  ChevronDown,
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
import { ConfirmModal } from '../components/workout';
import { useAppStore } from '../stores/appStore';


// Filter options
type FilterOption = 'all' | 1 | 2 | 3;

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 1, label: 'Присед' },
  { value: 2, label: 'Тяга' },
  { value: 3, label: 'Жим' },
];

// Pagination
const PAGE_SIZE = 30;

// sessionStorage keys
const FILTER_STORAGE_KEY = 'history_filter';
const LAST_VIEWED_SESSION_KEY = 'history_last_viewed_session';
const VISIBLE_COUNT_KEY = 'history_visible_count';

export function HistoryPage() {
  const navigate = useNavigate();
  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);  
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Restore filter from sessionStorage
  const [filter, setFilter] = useState<FilterOption>(() => {
    const saved = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (saved === '1' || saved === '2' || saved === '3') return parseInt(saved) as 1 | 2 | 3;
    return 'all';
  });

  // How many filtered sessions to show
  const [visibleCount, setVisibleCount] = useState<number>(() => {
    const saved = sessionStorage.getItem(VISIBLE_COUNT_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return PAGE_SIZE;
  });

  // Selection mode state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'selected' | 'all';
  } | null>(null);

  // Refs
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const didScrollRestore = useRef(false);
  const headerRef = useRef<HTMLElement>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await workoutRepo.getAllSessions();
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

  // Save filter to sessionStorage; reset pagination on filter change
  useEffect(() => {
    sessionStorage.setItem(FILTER_STORAGE_KEY, String(filter));
    if (didScrollRestore.current) {
      setVisibleCount(PAGE_SIZE);
      sessionStorage.setItem(VISIBLE_COUNT_KEY, String(PAGE_SIZE));
    }
  }, [filter]);

  // Apply filter
  const filteredSessions = useMemo(
    () =>
      filter === 'all'
        ? sessions
        : sessions.filter((s) => s.dayTypeId === filter),
    [sessions, filter]
  );

  // Slice for pagination
  const visibleSessions = useMemo(
    () => filteredSessions.slice(0, visibleCount),
    [filteredSessions, visibleCount]
  );

  const hasMore = visibleCount < filteredSessions.length;
  const remainingCount = filteredSessions.length - visibleCount;

  // Group visible sessions by month
  const grouped = useMemo(() => groupByMonth(visibleSessions), [visibleSessions]);

  // Scroll to last viewed session after data loads
  useEffect(() => {
    if (isLoading || didScrollRestore.current) return;
    didScrollRestore.current = true;

    const lastId = sessionStorage.getItem(LAST_VIEWED_SESSION_KEY);
    if (!lastId) return;

    // Ensure enough items are visible to include the target card
    const targetIndex = filteredSessions.findIndex((s) => s.id === lastId);
    if (targetIndex >= 0 && targetIndex >= visibleCount) {
      const newCount = targetIndex + PAGE_SIZE;
      setVisibleCount(newCount);
      sessionStorage.setItem(VISIBLE_COUNT_KEY, String(newCount));
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = cardRefs.current.get(lastId);
        if (el) {
          el.scrollIntoView({ block: 'center' });
        }
        sessionStorage.removeItem(LAST_VIEWED_SESSION_KEY);
      });
    });
  }, [isLoading, filteredSessions, visibleCount]);

  // Scroll to top when user taps the active History tab
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === '/history') {
        sessionStorage.removeItem(LAST_VIEWED_SESSION_KEY);
        headerRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.addEventListener('nav-tap-active', handler);
    return () => window.removeEventListener('nav-tap-active', handler);
  }, []);

  // Navigate to detail — remember which card was tapped
  function openDetail(sessionId: string) {
    sessionStorage.setItem(LAST_VIEWED_SESSION_KEY, sessionId);
    sessionStorage.setItem(VISIBLE_COUNT_KEY, String(visibleCount));
    navigate(`/detail/${sessionId}`);
  }

  // Load more
  function loadMore() {
    const newCount = visibleCount + PAGE_SIZE;
    setVisibleCount(newCount);
    sessionStorage.setItem(VISIBLE_COUNT_KEY, String(newCount));
  }

  // --- Selection handlers ---

  function enterSelectionMode() {
    setIsSelecting(true);
    setSelectedIds(new Set());
  }

  function exitSelectionMode() {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }

  function toggleSession(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    const filteredIds = filteredSessions.map((s) => s.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of filteredIds) {
          next.delete(id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of filteredIds) {
          next.add(id);
        }
        return next;
      });
    }
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await workoutRepo.deleteMultipleSessions(ids);
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadSessions();
      await refreshNextDayInfo();      
    } catch (err) {
      console.error('Failed to delete sessions:', err);
    }
  }

  async function handleDeleteAll() {
    try {
      await workoutRepo.deleteAllSessions();
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadSessions();
      await refreshNextDayInfo();      
    } catch (err) {
      console.error('Failed to delete all sessions:', err);
    }
  }

  const selectedInFilterCount = filteredSessions.filter((s) =>
    selectedIds.has(s.id)
  ).length;

  const allFilteredSelected =
    filteredSessions.length > 0 &&
    filteredSessions.every((s) => selectedIds.has(s.id));

  const someFilteredSelected =
    selectedInFilterCount > 0 && !allFilteredSelected;

  // Callback ref for session cards
  const setCardRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      cardRefs.current.set(id, el);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#121212] pb-20">
      {/* Header */}
      <header ref={headerRef} className="px-5 pt-6 pb-3">
        <div className="flex items-center justify-between">
          {isSelecting ? (
            <>
              <button
                onClick={exitSelectionMode}
                className="w-10 h-10 rounded-full bg-[#1E1E1E] flex items-center justify-center
                           active:bg-[#2A2A2A] transition-colors"
              >
                <X size={20} className="text-[#B0B0B0]" />
              </button>
              <span className="text-lg font-bold text-white">
                {selectedIds.size > 0
                  ? `Выбрано: ${selectedIds.size}`
                  : 'Выберите тренировки'}
              </span>
              <button
                onClick={toggleSelectAll}
                className="w-10 h-10 rounded-full bg-[#1E1E1E] flex items-center justify-center
                           active:bg-[#2A2A2A] transition-colors"
                title={allFilteredSelected ? 'Снять выделение' : 'Выбрать все'}
              >
                {allFilteredSelected ? (
                  <CheckSquare size={20} className="text-[#4CAF50]" />
                ) : someFilteredSelected ? (
                  <Minus size={20} className="text-[#FF9800]" />
                ) : (
                  <Square size={20} className="text-[#B0B0B0]" />
                )}
              </button>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-2xl font-bold text-white">История</h1>
                <p className="text-sm text-[#B0B0B0] mt-0.5">
                  {filteredSessions.length}{' '}
                  {pluralize(
                    filteredSessions.length,
                    'тренировка',
                    'тренировки',
                    'тренировок'
                  )}
                </p>
              </div>
              {sessions.length > 0 && (
                <button
                  onClick={enterSelectionMode}
                  className="w-10 h-10 rounded-full bg-[#1E1E1E] flex items-center justify-center
                             active:bg-[#2A2A2A] transition-colors"
                >
                  <Trash2 size={20} className="text-[#B0B0B0]" />
                </button>
              )}
            </>
          )}
        </div>
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
                  ${
                    isActive
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
                <h2 className="text-sm font-semibold text-[#707070] uppercase tracking-wide mb-2">
                  {group.label}
                </h2>
                <div className="flex flex-col gap-2.5">
                  {group.sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      isSelecting={isSelecting}
                      isSelected={selectedIds.has(session.id)}
                      onToggle={() => toggleSession(session.id)}
                      onClick={() => {
                        if (isSelecting) {
                          toggleSession(session.id);
                        } else {
                          openDetail(session.id);
                        }
                      }}
                      cardRef={(el) => setCardRef(session.id, el)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Load more button */}
            {hasMore && (
              <button
                onClick={loadMore}
                className="w-full py-3.5 rounded-xl bg-[#1E1E1E] text-[#B0B0B0] font-medium text-sm
                           flex items-center justify-center gap-2
                           active:bg-[#2A2A2A] transition-colors mb-2"
              >
                <ChevronDown size={18} />
                Загрузить ещё ({Math.min(PAGE_SIZE, remainingCount)} из {remainingCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom action bar — visible only in selection mode with selections */}
      {isSelecting && (
        <div
          className="fixed bottom-16 left-0 right-0 z-30 px-5 pb-3 pt-3
                     bg-gradient-to-t from-[#121212] via-[#121212] to-transparent"
        >
          <div className="flex gap-3 max-w-[480px] mx-auto">
            <button
              onClick={() => setDeleteConfirm({ type: 'all' })}
              className="flex-1 py-3 rounded-xl bg-[#1E1E1E] border border-[#F44336]/40
                         text-[#F44336] font-semibold text-sm
                         active:bg-[#F44336]/10 transition-colors"
            >
              Удалить все ({sessions.length})
            </button>
            <button
              onClick={() => {
                if (selectedIds.size > 0) {
                  setDeleteConfirm({ type: 'selected' });
                }
              }}
              disabled={selectedIds.size === 0}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors
                ${
                  selectedIds.size > 0
                    ? 'bg-[#F44336] text-white active:bg-[#D32F2F]'
                    : 'bg-[#F44336]/20 text-[#F44336]/40 pointer-events-none'
                }`}
            >
              Удалить ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modals */}
      <ConfirmModal
        isOpen={deleteConfirm?.type === 'selected'}
        title="Удалить выбранные?"
        message={`${selectedIds.size} ${pluralize(
          selectedIds.size,
          'тренировка будет удалена',
          'тренировки будут удалены',
          'тренировок будут удалены'
        )} навсегда вместе со всеми данными.`}
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={handleDeleteSelected}
        onCancel={() => setDeleteConfirm(null)}
      />

      <ConfirmModal
        isOpen={deleteConfirm?.type === 'all'}
        title="Удалить ВСЕ тренировки?"
        message={`Все ${sessions.length} ${pluralize(
          sessions.length,
          'тренировка будет удалена',
          'тренировки будут удалены',
          'тренировок будут удалены'
        )} навсегда. Это действие нельзя отменить.`}
        confirmText="Удалить все"
        cancelText="Отмена"
        onConfirm={handleDeleteAll}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

// ==========================================
// Session Card
// ==========================================

interface SessionCardProps {
  session: WorkoutSession;
  isSelecting: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  cardRef: (el: HTMLElement | null) => void;
}

function SessionCard({
  session,
  isSelecting,
  isSelected,
  onToggle,
  onClick,
  cardRef,
}: SessionCardProps) {
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
      ref={cardRef}
      onClick={onClick}
      className={`w-full bg-[#252525] rounded-xl p-3.5 flex items-center gap-3
                  active:bg-[#2A2A2A] transition-colors text-left
                  ${isSelected ? 'ring-2 ring-[#F44336]/60' : ''}`}
    >
      {isSelecting ? (
        <div
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isSelected ? (
            <CheckSquare size={22} className="text-[#F44336]" />
          ) : (
            <Square size={22} className="text-[#555555]" />
          )}
        </div>
      ) : (
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: accentColor }}
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-white" style={{ color: accentColor }}>
            {dayName}
          </span>
          <span className="text-[#707070] text-sm">{directionLabel}</span>
          <span className="text-[#707070] text-xs ml-auto shrink-0">
            {formatDate(session.date)}
          </span>
        </div>
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

      {!isSelecting && (
        <ChevronRight size={18} className="text-[#555555] shrink-0" />
      )}
    </button>
  );
}

// ==========================================
// Helpers
// ==========================================

const MONTH_NAMES_FULL = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
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
    const month = d.getMonth();
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
