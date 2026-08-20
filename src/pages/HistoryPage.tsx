// src/pages/HistoryPage.tsx

/**
 * Workout history page.
 * Lists completed strength sessions, and (via filter tabs) standalone runs
 * and pull-up sessions. Each mode shows its own list and its own counter.
 *
 * Filters are mutually exclusive view modes, NOT subsets of one list:
 * the counter always matches what is currently shown.
 *
 * Card components and helpers live in src/components/history/.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Loader2,
  Trash2,
  X,
  CheckSquare,
  Square,
  Minus,
  ChevronDown,
  Footprints,
  Activity,
  RotateCcw,
} from 'lucide-react';
import { workoutRepo, pullupRepo } from '../db';
import type { WorkoutSession, CardioLog, StandalonePullupSession } from '../types';
import { ConfirmModal } from '../components/workout';
import {
  SessionCard,
  RunCard,
  PullupCard,
  JumpRopeCard,
  groupByMonth,
  pluralize,
  PULLUP_ACCENT,
  RUNNING_ACCENT,
  JUMP_ROPE_ACCENT,
} from '../components/history';
import { getDayTypeColor } from '../theme';
import { useAppStore } from '../stores/appStore';
import {
  rollbackProgressionForMultipleSessions,
  rollbackProgressionForAllSessions,
  rollbackStandaloneRun,
  rollbackStandalonePullup,
} from '../utils/rollbackProgression';


// Filter options
type FilterOption = 'all' | 1 | 2 | 3 | 'jump-rope' | 'running' | 'pullups';

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 1, label: 'Присед' },
  { value: 2, label: 'Тяга' },
  { value: 3, label: 'Жим' },
  { value: 'pullups', label: 'Турник' },
  { value: 'running', label: 'Бег' },
  { value: 'jump-rope', label: 'Скакалка' },
];

// Pagination
const PAGE_SIZE = 30;

// sessionStorage keys
const FILTER_STORAGE_KEY = 'history_filter';
const LAST_VIEWED_SESSION_KEY = 'history_last_viewed_session';
const VISIBLE_COUNT_KEY = 'history_visible_count';

function parseStoredFilter(saved: string | null): FilterOption {
  if (saved === '1' || saved === '2' || saved === '3') {
    return parseInt(saved, 10) as 1 | 2 | 3;
  }
  if (saved === 'running' || saved === 'pullups' || saved === 'jump-rope') return saved;
  return 'all';
}

export function HistoryPage() {
  const navigate = useNavigate();
  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  // Data per mode
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [runs, setRuns] = useState<CardioLog[]>([]);
  const [jumpRopes, setJumpRopes] = useState<CardioLog[]>([]);
  const [pullups, setPullups] = useState<StandalonePullupSession[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [filter, setFilter] = useState<FilterOption>(() =>
    parseStoredFilter(sessionStorage.getItem(FILTER_STORAGE_KEY))
  );

  const isStrengthMode = filter === 'all' || typeof filter === 'number';
  const isRunningMode = filter === 'running';
  const isJumpRopeMode = filter === 'jump-rope';
  const isPullupMode = filter === 'pullups';

  const [visibleCount, setVisibleCount] = useState<number>(() => {
    const saved = sessionStorage.getItem(VISIBLE_COUNT_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return PAGE_SIZE;
  });

  // Selection mode
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { type: 'selected' | 'all' }
    | { type: 'single-run'; run: CardioLog }
    | { type: 'single-jump-rope'; entry: CardioLog }
    | { type: 'single-pullup'; session: StandalonePullupSession }
    | null
  >(null);

  // Refs
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const didScrollRestore = useRef(false);
  const headerRef = useRef<HTMLElement>(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [allSessions, allRuns, allPullups] = await Promise.all([
        workoutRepo.getAllSessions(),
        workoutRepo.getStandaloneCardioLogs(),
        pullupRepo.getStandalonePullupSessions(),
      ]);
      setSessions(allSessions.filter((s) => s.timeEnd !== null));
      setRuns(allRuns.filter((entry) => entry.type === 'treadmill_3km'));
      setJumpRopes(allRuns.filter((entry) => entry.type === 'jump_rope'));
      setPullups(allPullups);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Persist filter; reset pagination + selection on filter change
  useEffect(() => {
    sessionStorage.setItem(FILTER_STORAGE_KEY, String(filter));
    if (didScrollRestore.current) {
      setVisibleCount(PAGE_SIZE);
      sessionStorage.setItem(VISIBLE_COUNT_KEY, String(PAGE_SIZE));
    }
    setSelectedIds(new Set());
  }, [filter]);

  // Filtered strength sessions
  const filteredSessions = useMemo(
    () =>
      filter === 'all'
        ? sessions
        : typeof filter === 'number'
          ? sessions.filter((s) => s.dayTypeId === filter)
          : [],
    [sessions, filter]
  );

  // Counter (number + word) for the current mode
  const headerCount = isRunningMode
    ? runs.length
    : isJumpRopeMode
      ? jumpRopes.length
    : isPullupMode
      ? pullups.length
      : filteredSessions.length;

  const headerLabel = isRunningMode
    ? pluralize(runs.length, 'пробежка', 'пробежки', 'пробежек')
    : isJumpRopeMode
      ? `${pluralize(jumpRopes.length, 'тренировка', 'тренировки', 'тренировок')} со скакалкой`
    : isPullupMode
      ? `${pluralize(pullups.length, 'тренировка', 'тренировки', 'тренировок')} на турнике`
      : pluralize(filteredSessions.length, 'тренировка', 'тренировки', 'тренировок');

  // Pagination slices per mode
  const visibleSessions = useMemo(
    () => filteredSessions.slice(0, visibleCount),
    [filteredSessions, visibleCount]
  );
  const visibleRuns = useMemo(() => runs.slice(0, visibleCount), [runs, visibleCount]);
  const visibleJumpRopes = useMemo(
    () => jumpRopes.slice(0, visibleCount),
    [jumpRopes, visibleCount]
  );
  const visiblePullups = useMemo(
    () => pullups.slice(0, visibleCount),
    [pullups, visibleCount]
  );

  const totalInMode = isRunningMode
    ? runs.length
    : isJumpRopeMode
      ? jumpRopes.length
    : isPullupMode
      ? pullups.length
      : filteredSessions.length;
  const hasMore = visibleCount < totalInMode;
  const remainingCount = totalInMode - visibleCount;

  // Month groups per mode
  const groupedSessions = useMemo(
    () => groupByMonth(visibleSessions, (s) => s.date),
    [visibleSessions]
  );
  const groupedRuns = useMemo(
    () => groupByMonth(visibleRuns, (r) => r.date ?? ''),
    [visibleRuns]
  );
  const groupedJumpRopes = useMemo(
    () => groupByMonth(visibleJumpRopes, (entry) => entry.date ?? ''),
    [visibleJumpRopes]
  );
  const groupedPullups = useMemo(
    () => groupByMonth(visiblePullups, (p) => p.date),
    [visiblePullups]
  );

  // Scroll to last viewed session (strength only)
  useEffect(() => {
    if (isLoading || didScrollRestore.current) return;
    didScrollRestore.current = true;

    const lastId = sessionStorage.getItem(LAST_VIEWED_SESSION_KEY);
    if (!lastId || !isStrengthMode) return;

    const targetIndex = filteredSessions.findIndex((s) => s.id === lastId);
    if (targetIndex >= 0 && targetIndex >= visibleCount) {
      const newCount = targetIndex + PAGE_SIZE;
      setVisibleCount(newCount);
      sessionStorage.setItem(VISIBLE_COUNT_KEY, String(newCount));
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = cardRefs.current.get(lastId);
        if (el) el.scrollIntoView({ block: 'center' });
        sessionStorage.removeItem(LAST_VIEWED_SESSION_KEY);
      });
    });
  }, [isLoading, filteredSessions, visibleCount, isStrengthMode]);

  // Scroll to top when tapping the active History tab
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

  function openDetail(sessionId: string) {
    sessionStorage.setItem(LAST_VIEWED_SESSION_KEY, sessionId);
    sessionStorage.setItem(VISIBLE_COUNT_KEY, String(visibleCount));
    navigate(`/detail/${sessionId}`);
  }

  function loadMore() {
    const newCount = visibleCount + PAGE_SIZE;
    setVisibleCount(newCount);
    sessionStorage.setItem(VISIBLE_COUNT_KEY, String(newCount));
  }

  // --- Selection ---

  function enterSelectionMode() {
    setIsSelecting(true);
    setSelectedIds(new Set());
  }

  function exitSelectionMode() {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ids of all items in the current mode (pullups use their group key `date`)
  const allIdsInMode: string[] = useMemo(() => {
    if (isRunningMode) return runs.map((r) => r.id);
    if (isJumpRopeMode) return jumpRopes.map((entry) => entry.id);
    if (isPullupMode) return pullups.map((p) => p.date);
    return filteredSessions.map((s) => s.id);
  }, [isRunningMode, isJumpRopeMode, isPullupMode, runs, jumpRopes, pullups, filteredSessions]);

  function toggleSelectAll() {
    const allSelected =
      allIdsInMode.length > 0 && allIdsInMode.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of allIdsInMode) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  // --- Deletion: strength ---

  async function handleDeleteSelectedStrength() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await rollbackProgressionForMultipleSessions(ids);
      await workoutRepo.deleteMultipleSessions(ids);
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadAll();
      await refreshNextDayInfo();
    } catch (err) {
      console.error('Failed to delete sessions:', err);
    }
  }

  async function handleDeleteAllStrength() {
    try {
      await rollbackProgressionForAllSessions();
      await workoutRepo.deleteAllSessions();
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadAll();
      await refreshNextDayInfo();
    } catch (err) {
      console.error('Failed to delete all sessions:', err);
    }
  }

  // --- Deletion: runs ---

  async function deleteRun(run: CardioLog) {
    try {
      await rollbackStandaloneRun(run.id, run.date ?? '');
      await workoutRepo.deleteCardioLogById(run.id);
      setDeleteConfirm(null);
      await loadAll();
    } catch (err) {
      console.error('Failed to delete run:', err);
    }
  }

  async function handleDeleteSelectedRuns() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      for (const id of ids) {
        const run = runs.find((r) => r.id === id);
        if (run) await rollbackStandaloneRun(run.id, run.date ?? '');
      }
      await workoutRepo.deleteCardioLogsByIds(ids);
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadAll();
    } catch (err) {
      console.error('Failed to delete runs:', err);
    }
  }

  async function handleDeleteAllRuns() {
    try {
      const ids = runs.map((r) => r.id);
      for (const r of runs) await rollbackStandaloneRun(r.id, r.date ?? '');
      await workoutRepo.deleteCardioLogsByIds(ids);
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadAll();
    } catch (err) {
      console.error('Failed to delete all runs:', err);
    }
  }

  // --- Deletion: jump rope ---

  async function deleteJumpRope(entry: CardioLog) {
    try {
      await workoutRepo.deleteCardioLogById(entry.id);
      setDeleteConfirm(null);
      await loadAll();
    } catch (err) {
      console.error('Failed to delete jump rope entry:', err);
    }
  }

  async function handleDeleteSelectedJumpRopes() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await workoutRepo.deleteCardioLogsByIds(ids);
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadAll();
    } catch (err) {
      console.error('Failed to delete jump rope entries:', err);
    }
  }

  async function handleDeleteAllJumpRopes() {
    try {
      await workoutRepo.deleteCardioLogsByIds(jumpRopes.map((entry) => entry.id));
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadAll();
    } catch (err) {
      console.error('Failed to delete all jump rope entries:', err);
    }
  }

  // --- Deletion: pullups ---

  async function deletePullup(session: StandalonePullupSession) {
    try {
      await rollbackStandalonePullup(session.ids, session.date);
      await pullupRepo.deletePullupLogsByIds(session.ids);
      setDeleteConfirm(null);
      await loadAll();
    } catch (err) {
      console.error('Failed to delete pullup session:', err);
    }
  }

  async function handleDeleteSelectedPullups() {
    const keys = Array.from(selectedIds);
    if (keys.length === 0) return;
    try {
      const selected = pullups.filter((p) => keys.includes(p.date));
      for (const p of selected) await rollbackStandalonePullup(p.ids, p.date);
      const allRowIds = selected.flatMap((p) => p.ids);
      await pullupRepo.deletePullupLogsByIds(allRowIds);
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadAll();
    } catch (err) {
      console.error('Failed to delete pullups:', err);
    }
  }

  async function handleDeleteAllPullups() {
    try {
      for (const p of pullups) await rollbackStandalonePullup(p.ids, p.date);
      const allRowIds = pullups.flatMap((p) => p.ids);
      await pullupRepo.deletePullupLogsByIds(allRowIds);
      setDeleteConfirm(null);
      exitSelectionMode();
      await loadAll();
    } catch (err) {
      console.error('Failed to delete all pullups:', err);
    }
  }

  // --- Confirm dispatchers ---

  function confirmSelected() {
    if (isRunningMode) return handleDeleteSelectedRuns();
    if (isJumpRopeMode) return handleDeleteSelectedJumpRopes();
    if (isPullupMode) return handleDeleteSelectedPullups();
    return handleDeleteSelectedStrength();
  }

  function confirmAll() {
    if (isRunningMode) return handleDeleteAllRuns();
    if (isJumpRopeMode) return handleDeleteAllJumpRopes();
    if (isPullupMode) return handleDeleteAllPullups();
    return handleDeleteAllStrength();
  }

  // --- Selection summary ---

  const selectedInModeCount = allIdsInMode.filter((id) => selectedIds.has(id)).length;
  const allModeSelected =
    allIdsInMode.length > 0 && selectedInModeCount === allIdsInMode.length;
  const someModeSelected = selectedInModeCount > 0 && !allModeSelected;

  const totalAllCount = isRunningMode
    ? runs.length
    : isJumpRopeMode
      ? jumpRopes.length
    : isPullupMode
      ? pullups.length
      : sessions.length;
  const hasAnythingInMode = totalAllCount > 0;

  const setCardRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  // Item noun for confirm modals (per mode)
  const deleteNoun = isRunningMode
    ? { one: 'пробежка будет удалена', few: 'пробежки будут удалены', many: 'пробежек будут удалены' }
    : isJumpRopeMode
      ? { one: 'тренировка будет удалена', few: 'тренировки будут удалены', many: 'тренировок будут удалены' }
    : { one: 'тренировка будет удалена', few: 'тренировки будут удалены', many: 'тренировок будут удалены' };

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
                {selectedIds.size > 0 ? `Выбрано: ${selectedInModeCount}` : 'Выберите записи'}
              </span>
              <button
                onClick={toggleSelectAll}
                className="w-10 h-10 rounded-full bg-[#1E1E1E] flex items-center justify-center
                           active:bg-[#2A2A2A] transition-colors"
                title={allModeSelected ? 'Снять выделение' : 'Выбрать все'}
              >
                {allModeSelected ? (
                  <CheckSquare size={20} className="text-[#4CAF50]" />
                ) : someModeSelected ? (
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
                  {headerCount} {headerLabel}
                </p>
              </div>
              {hasAnythingInMode && (
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

      {/* Filter tabs — horizontally scrollable */}
      <div className="px-5 pb-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = filter === opt.value;
            let accentColor: string | undefined;
            if (typeof opt.value === 'number') accentColor = getDayTypeColor(opt.value);
            else if (opt.value === 'pullups') accentColor = PULLUP_ACCENT;
            else if (opt.value === 'running') accentColor = RUNNING_ACCENT;
            else if (opt.value === 'jump-rope') accentColor = JUMP_ROPE_ACCENT;

            return (
              <button
                key={String(opt.value)}
                onClick={() => setFilter(opt.value)}
                disabled={isSelecting}
                className={`
                  shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors select-none
                  ${isActive ? 'text-white' : 'bg-[#1E1E1E] text-[#B0B0B0] active:bg-[#2A2A2A]'}
                  ${isSelecting ? 'opacity-40 pointer-events-none' : ''}
                `}
                style={isActive ? { backgroundColor: accentColor ?? '#4CAF50' } : undefined}
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
        ) : headerCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            {isRunningMode ? (
              <Footprints size={48} className="text-[#333333] mb-3" />
            ) : isJumpRopeMode ? (
              <RotateCcw size={48} className="text-[#333333] mb-3" />
            ) : isPullupMode ? (
              <Activity size={48} className="text-[#333333] mb-3" />
            ) : (
              <Calendar size={48} className="text-[#333333] mb-3" />
            )}
            <p className="text-[#707070] text-sm">
              {isRunningMode
                ? 'Нет пробежек'
                : isJumpRopeMode
                  ? 'Нет тренировок со скакалкой'
                : isPullupMode
                  ? 'Нет тренировок на турнике'
                  : 'Нет тренировок'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Strength */}
            {isStrengthMode &&
              groupedSessions.map((group) => (
                <div key={group.key}>
                  <h2 className="text-sm font-semibold text-[#707070] uppercase tracking-wide mb-2">
                    {group.label}
                  </h2>
                  <div className="flex flex-col gap-2.5">
                    {group.items.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        isSelecting={isSelecting}
                        isSelected={selectedIds.has(session.id)}
                        onToggle={() => toggleId(session.id)}
                        onClick={() => {
                          if (isSelecting) toggleId(session.id);
                          else openDetail(session.id);
                        }}
                        cardRef={(el) => setCardRef(session.id, el)}
                      />
                    ))}
                  </div>
                </div>
              ))}

            {/* Runs */}
            {isRunningMode &&
              groupedRuns.map((group) => (
                <div key={group.key}>
                  <h2 className="text-sm font-semibold text-[#707070] uppercase tracking-wide mb-2">
                    {group.label}
                  </h2>
                  <div className="flex flex-col gap-2.5">
                    {group.items.map((run) => (
                      <RunCard
                        key={run.id}
                        run={run}
                        isSelecting={isSelecting}
                        isSelected={selectedIds.has(run.id)}
                        onToggle={() => toggleId(run.id)}
                        onDelete={() => setDeleteConfirm({ type: 'single-run', run })}
                      />
                    ))}
                  </div>
                </div>
              ))}

            {/* Jump rope */}
            {isJumpRopeMode &&
              groupedJumpRopes.map((group) => (
                <div key={group.key}>
                  <h2 className="text-sm font-semibold text-[#707070] uppercase tracking-wide mb-2">
                    {group.label}
                  </h2>
                  <div className="flex flex-col gap-2.5">
                    {group.items.map((entry) => (
                      <JumpRopeCard
                        key={entry.id}
                        entry={entry}
                        isSelecting={isSelecting}
                        isSelected={selectedIds.has(entry.id)}
                        onToggle={() => toggleId(entry.id)}
                        onDelete={() => setDeleteConfirm({ type: 'single-jump-rope', entry })}
                      />
                    ))}
                  </div>
                </div>
              ))}

            {/* Pullups */}
            {isPullupMode &&
              groupedPullups.map((group) => (
                <div key={group.key}>
                  <h2 className="text-sm font-semibold text-[#707070] uppercase tracking-wide mb-2">
                    {group.label}
                  </h2>
                  <div className="flex flex-col gap-2.5">
                    {group.items.map((session) => (
                      <PullupCard
                        key={session.date}
                        session={session}
                        isSelecting={isSelecting}
                        isSelected={selectedIds.has(session.date)}
                        onToggle={() => toggleId(session.date)}
                        onDelete={() => setDeleteConfirm({ type: 'single-pullup', session })}
                      />
                    ))}
                  </div>
                </div>
              ))}

            {/* Load more */}
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

      {/* Bottom action bar — selection mode */}
      {isSelecting && (
        <div
          className="fixed bottom-16 left-0 right-0 z-30 px-5 pb-3 pt-3
                     bg-linear-to-t from-[#121212] via-[#121212] to-transparent"
        >
          <div className="flex gap-3 max-w-120 mx-auto">
            <button
              onClick={() => setDeleteConfirm({ type: 'all' })}
              className="flex-1 py-3 rounded-xl bg-[#1E1E1E] border border-[#F44336]/40
                         text-[#F44336] font-semibold text-sm
                         active:bg-[#F44336]/10 transition-colors"
            >
              Удалить все ({totalAllCount})
            </button>
            <button
              onClick={() => {
                if (selectedIds.size > 0) setDeleteConfirm({ type: 'selected' });
              }}
              disabled={selectedIds.size === 0}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors
                ${
                  selectedIds.size > 0
                    ? 'bg-[#F44336] text-white active:bg-[#D32F2F]'
                    : 'bg-[#F44336]/20 text-[#F44336]/40 pointer-events-none'
                }`}
            >
              Удалить ({selectedInModeCount})
            </button>
          </div>
        </div>
      )}

      {/* Confirm: batch selected */}
      <ConfirmModal
        isOpen={deleteConfirm?.type === 'selected'}
        title="Удалить выбранные?"
        message={`${selectedInModeCount} ${pluralize(
          selectedInModeCount,
          deleteNoun.one,
          deleteNoun.few,
          deleteNoun.many
        )} навсегда вместе со всеми данными.`}
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={confirmSelected}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Confirm: all */}
      <ConfirmModal
        isOpen={deleteConfirm?.type === 'all'}
        title="Удалить ВСЁ?"
        message={`Все ${totalAllCount} ${pluralize(
          totalAllCount,
          deleteNoun.one,
          deleteNoun.few,
          deleteNoun.many
        )} навсегда. Это действие нельзя отменить.`}
        confirmText="Удалить все"
        cancelText="Отмена"
        onConfirm={confirmAll}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Confirm: single run */}
      <ConfirmModal
        isOpen={deleteConfirm?.type === 'single-run'}
        title="Удалить пробежку?"
        message="Эта пробежка будет удалена навсегда."
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={() => {
          if (deleteConfirm?.type === 'single-run') deleteRun(deleteConfirm.run);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Confirm: single pullup */}
      <ConfirmModal
        isOpen={deleteConfirm?.type === 'single-jump-rope'}
        title="Удалить тренировку со скакалкой?"
        message="Эта тренировка со скакалкой будет удалена навсегда."
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={() => {
          if (deleteConfirm?.type === 'single-jump-rope') {
            deleteJumpRope(deleteConfirm.entry);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Confirm: single pullup */}
      <ConfirmModal
        isOpen={deleteConfirm?.type === 'single-pullup'}
        title="Удалить тренировку на турнике?"
        message="Эта тренировка на турнике будет удалена навсегда."
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={() => {
          if (deleteConfirm?.type === 'single-pullup') deletePullup(deleteConfirm.session);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
