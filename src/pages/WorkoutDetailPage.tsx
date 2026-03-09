// src/pages/WorkoutDetailPage.tsx

/**
 * Workout detail page — shows a past workout session.
 * Includes delete functionality with confirmation.
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock,
  Dumbbell,
  Scale,
  Activity,
  ArrowLeft,
  CheckCircle2,
  CircleOff,
  CircleDot,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { workoutRepo } from '../db';
import type { WorkoutSession, ExerciseSummary, CardioLog } from '../types';
import {
  formatDate,
  formatWorkoutDuration,
  formatTonnage,
  formatDecimal,
  formatTimeMMSS,
  formatRepsSum,
} from '../utils/format';
import { getDayTypeColor, getDayTypeTextClass, DAY_TYPE_NAMES_RU } from '../theme';
import { LoadingScreen } from '../components/ui';
import { ConfirmModal } from '../components/workout';

export function WorkoutDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [exerciseSummaries, setExerciseSummaries] = useState<ExerciseSummary[]>([]);
  const [cardioLogs, setCardioLogs] = useState<CardioLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate('/history', { replace: true });
      return;
    }
    loadData(sessionId);
  }, [sessionId, navigate]);

  async function loadData(id: string) {
    try {
      setIsLoading(true);
      setError(null);

      const [sess, summaries, cardio] = await Promise.all([
        workoutRepo.getWorkoutSessionById(id),
        workoutRepo.getSessionExerciseSummary(id),
        workoutRepo.getCardioBySession(id),
      ]);

      if (!sess) {
        setError('Тренировка не найдена');
        setIsLoading(false);
        return;
      }

      setSession(sess);
      setExerciseSummaries(summaries);
      setCardioLogs(cardio);
    } catch (err) {
      console.error('Failed to load workout detail:', err);
      setError('Ошибка загрузки данных');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!sessionId) return;
    try {
      await workoutRepo.deleteWorkoutSession(sessionId);
      navigate('/history', { replace: true });
    } catch (err) {
      console.error('Failed to delete workout:', err);
    }
  }

  // --- Computed values ---

  const durationStr = useMemo(() => {
    if (!session?.timeStart || !session?.timeEnd) return '—';
    return formatWorkoutDuration(session.timeStart, session.timeEnd) ?? '—';
  }, [session]);

  const bodyWeightStr = useMemo(() => {
    if (!session) return null;
    const { weightBefore, weightAfter } = session;
    if (weightBefore !== null && weightAfter !== null) {
      const avg = (weightBefore + weightAfter) / 2;
      return {
        before: formatDecimal(weightBefore),
        after: formatDecimal(weightAfter),
        avg: formatDecimal(avg),
      };
    }
    if (weightBefore !== null) {
      return { before: formatDecimal(weightBefore), after: null, avg: null };
    }
    if (weightAfter !== null) {
      return { before: null, after: formatDecimal(weightAfter), avg: null };
    }
    return null;
  }, [session]);

  const cardioResult = useMemo(() => {
    if (cardioLogs.length === 0) return null;
    const log = cardioLogs[0]!;
    if (log.type === 'jump_rope' && log.count !== null) {
      return `Скакалка: ${log.count} прыжков`;
    }
    if (log.type === 'treadmill_3km' && log.durationSeconds !== null) {
      return `Бег 3 км: ${formatTimeMMSS(log.durationSeconds)}`;
    }
    return null;
  }, [cardioLogs]);

  const exerciseCounts = useMemo(() => {
    let completed = 0;
    let skipped = 0;
    let notDone = 0;
    for (const s of exerciseSummaries) {
      if (s.isSkipped) {
        skipped++;
      } else if (s.sets.some((set) => !set.isSkipped && set.actualReps > 0)) {
        completed++;
      } else {
        notDone++;
      }
    }
    return { completed, skipped, notDone, total: exerciseSummaries.length };
  }, [exerciseSummaries]);

  // --- Render ---

  if (isLoading) return <LoadingScreen />;

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#121212] px-4">
        <p className="text-[#B0B0B0] text-lg mb-4">{error ?? 'Тренировка не найдена'}</p>
        <button
          onClick={() => navigate('/history', { replace: true })}
          className="px-6 py-3 bg-[#4CAF50] text-white rounded-xl font-semibold active:bg-[#388E3C] transition-colors"
        >
          К истории
        </button>
      </div>
    );
  }

  const dayTypeId = session.dayTypeId;
  const dayName = DAY_TYPE_NAMES_RU[dayTypeId] ?? '';
  const dayColor = getDayTypeColor(dayTypeId);
  const dayTextClass = getDayTypeTextClass(dayTypeId);
  const directionLabel = session.direction === 'normal' ? 'Прямой' : 'Обратный';

  return (
    <div className="flex flex-col min-h-screen bg-[#121212] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#121212] border-b border-[#333333]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-[#1E1E1E] flex items-center justify-center active:bg-[#2A2A2A] transition-colors"
          >
            <ArrowLeft size={20} className="text-[#B0B0B0]" />
          </button>
          <div className="flex flex-col items-center">
            <h1 className={`text-lg font-bold ${dayTextClass}`}>{dayName}</h1>
            <p className="text-xs text-[#707070]">
              {formatDate(session.date)} · {directionLabel}
            </p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-10 h-10 rounded-full bg-[#1E1E1E] flex items-center justify-center active:bg-[#2A2A2A] transition-colors"
          >
            <Trash2 size={20} className="text-[#F44336]" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-[#252525] rounded-xl p-3 flex flex-col items-center gap-1">
            <Clock size={20} className="text-[#2196F3]" />
            <span className="text-xs text-[#B0B0B0]">Время</span>
            <span className="text-lg font-bold text-white">{durationStr}</span>
          </div>
          <div className="bg-[#252525] rounded-xl p-3 flex flex-col items-center gap-1">
            <Dumbbell size={20} className="text-[#FF9800]" />
            <span className="text-xs text-[#B0B0B0]">Тоннаж</span>
            <span className="text-lg font-bold text-white">
              {formatTonnage(session.totalKg)}
            </span>
          </div>
        </div>

        {/* Body weight card */}
        {bodyWeightStr && (
          <div className="bg-[#252525] rounded-xl p-4 mt-3">
            <div className="flex items-center gap-2 mb-2">
              <Scale size={18} className="text-[#B0B0B0]" />
              <span className="text-sm font-semibold text-white">Вес тела</span>
            </div>
            <div className="flex items-center justify-center gap-4">
              {bodyWeightStr.before !== null && (
                <div className="flex flex-col items-center">
                  <span className="text-xs text-[#707070]">До</span>
                  <span className="text-base font-bold text-white">
                    {bodyWeightStr.before}
                  </span>
                </div>
              )}
              {bodyWeightStr.before !== null && bodyWeightStr.after !== null && (
                <ArrowRight size={16} className="text-[#555555]" />
              )}
              {bodyWeightStr.after !== null && (
                <div className="flex flex-col items-center">
                  <span className="text-xs text-[#707070]">После</span>
                  <span className="text-base font-bold text-white">
                    {bodyWeightStr.after}
                  </span>
                </div>
              )}
              {bodyWeightStr.avg !== null && (
                <>
                  <div className="w-px h-8 bg-[#333333]" />
                  <div className="flex flex-col items-center">
                    <span className="text-xs text-[#707070]">Среднее</span>
                    <span className="text-base font-bold text-[#4CAF50]">
                      {bodyWeightStr.avg}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Exercise counts */}
        <div className="bg-[#252525] rounded-xl p-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#B0B0B0]">Упражнения</span>
            <span className="text-sm text-white font-semibold">
              {exerciseCounts.total}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {exerciseCounts.completed > 0 && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-[#4CAF50]" />
                <span className="text-sm text-white">
                  {exerciseCounts.completed} выполнено
                </span>
              </div>
            )}
            {exerciseCounts.skipped > 0 && (
              <div className="flex items-center gap-1.5">
                <CircleOff size={16} className="text-[#F44336]" />
                <span className="text-sm text-white">
                  {exerciseCounts.skipped} пропущено
                </span>
              </div>
            )}
            {exerciseCounts.notDone > 0 && (
              <div className="flex items-center gap-1.5">
                <CircleDot size={16} className="text-[#555555]" />
                <span className="text-sm text-white">
                  {exerciseCounts.notDone} не начато
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Cardio result */}
        {cardioResult && (
          <div className="bg-[#252525] rounded-xl p-3 mt-3 flex items-center gap-2">
            <Activity size={18} className="text-[#81C784]" />
            <span className="text-sm text-white">{cardioResult}</span>
          </div>
        )}

        {/* Exercise details */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-[#B0B0B0] mb-2">
            Результаты по упражнениям
          </h3>
          <div className="flex flex-col gap-2 pb-4">
            {exerciseSummaries.map((summary) => (
              <ExerciseDetailCard
                key={summary.exerciseId}
                summary={summary}
                dayColor={dayColor}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Удалить тренировку?"
        message="Тренировка и все её данные будут удалены навсегда."
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

// ==========================================
// Exercise Detail Card Component
// ==========================================

interface ExerciseDetailCardProps {
  summary: ExerciseSummary;
  dayColor: string;
}

function ExerciseDetailCard({ summary, dayColor }: ExerciseDetailCardProps) {
  const { exerciseName, sets, isSkipped, hasAddedWeight, totalKg } = summary;

  const warmupSets = sets.filter((s) => s.setType === 'warmup' && !s.isSkipped);
  const workingSets = sets.filter((s) => s.setType === 'working' && !s.isSkipped);
  const workingReps = workingSets.map((s) => s.actualReps);
  const workingTotal = workingReps.reduce((a, b) => a + b, 0);

  if (isSkipped) {
    return (
      <div className="bg-[#252525] rounded-xl p-3 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-1 h-8 rounded-full"
              style={{ backgroundColor: '#F44336' }}
            />
            <span className="text-sm text-white">{exerciseName}</span>
          </div>
          <span className="text-xs text-[#F44336] font-semibold">ПРОПУЩЕНО</span>
        </div>
      </div>
    );
  }

  if (sets.length === 0 || (workingSets.length === 0 && warmupSets.length === 0)) {
    return (
      <div className="bg-[#252525] rounded-xl p-3 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-1 h-8 rounded-full"
              style={{ backgroundColor: '#555555' }}
            />
            <span className="text-sm text-white">{exerciseName}</span>
          </div>
          <span className="text-xs text-[#555555] font-semibold">НЕ НАЧАТО</span>
        </div>
      </div>
    );
  }

  const workingWeight = workingSets.length > 0 ? workingSets[0]!.weight : 0;

  return (
    <div className="bg-[#252525] rounded-xl p-3">
      {/* Exercise name */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-1 h-8 rounded-full shrink-0"
          style={{ backgroundColor: dayColor }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{exerciseName}</p>
        </div>
      </div>

      {/* Working sets summary line */}
      {workingSets.length > 0 && (
        <div className="flex items-center justify-between mb-1.5 ml-3">
          <div className="flex items-center gap-2">
            {hasAddedWeight && workingWeight > 0 && (
              <span className="text-xs text-[#B0B0B0]">
                {formatDecimal(workingWeight)} кг
              </span>
            )}
            <span className="text-sm font-bold text-white">
              {formatRepsSum(workingReps)} = {workingTotal}
            </span>
          </div>
          {hasAddedWeight && totalKg > 0 && (
            <span className="text-xs text-[#707070]">
              {formatTonnage(totalKg)}
            </span>
          )}
        </div>
      )}

      {/* Warmup sets (compact) */}
      {warmupSets.length > 0 && (
        <div className="ml-3 flex flex-wrap gap-x-3 gap-y-0.5">
          {warmupSets.map((ws) => (
            <span key={ws.id} className="text-xs text-[#707070]">
              {formatDecimal(ws.weight)} кг × {ws.actualReps}
            </span>
          ))}
        </div>
      )}

      {/* Set-by-set detail (working sets) */}
      {workingSets.length > 0 && (
        <div className="ml-3 mt-1.5 flex flex-wrap gap-1.5">
          {workingSets.map((ws) => {
            const hitTarget = ws.actualReps >= ws.targetReps;
            return (
              <div
                key={ws.id}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  hitTarget
                    ? 'bg-[#4CAF50]/15 text-[#81C784]'
                    : 'bg-[#F44336]/15 text-[#F44336]'
                }`}
              >
                {ws.actualReps}
                {!hitTarget && (
                  <span className="text-[10px] opacity-70 ml-0.5">
                    /{ws.targetReps}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
