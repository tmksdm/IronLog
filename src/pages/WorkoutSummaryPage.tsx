// src/pages/WorkoutSummaryPage.tsx

/**
 * Post-workout summary page.
 * Shows detailed results of a completed workout session.
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock,
  Dumbbell,
  Scale,
  Activity,
  Home,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  CircleOff,
  CircleDot,
  ArrowRight,
} from 'lucide-react';
import { workoutRepo } from '../db';
import { pullupRepo } from '../db';
import type { WorkoutSession, ExerciseSummary, CardioLog } from '../types';
import type { PullupLog } from '../types';
import { getPullupDayName } from '../utils/pullupProgram';
import {
  formatDate,
  formatWorkoutDuration,
  formatTonnage,
  formatDecimal,
  formatWeight,
  formatTimeMMSS,
  formatRepsSum,
} from '../utils/format';
import { getDayTypeColor, getDayTypeTextClass, DAY_TYPE_NAMES_RU } from '../theme';
import { LoadingScreen } from '../components/ui';

// --- Weight change detection ---

interface WeightChangeInfo {
  exerciseId: string;
  type: 'increase' | 'decrease';
  oldWeight: number;
  newWeight: number;
}

export function WorkoutSummaryPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [exerciseSummaries, setExerciseSummaries] = useState<ExerciseSummary[]>([]);
  const [cardioLogs, setCardioLogs] = useState<CardioLog[]>([]);
  const [weightChanges, setWeightChanges] = useState<WeightChangeInfo[]>([]);
  const [pullupLogs, setPullupLogs] = useState<PullupLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate('/', { replace: true });
      return;
    }
    loadData(sessionId);
  }, [sessionId, navigate]);

  async function loadData(id: string) {
    try {
      setIsLoading(true);
      setError(null);

      const [sess, summaries, cardio, pullups] = await Promise.all([
        workoutRepo.getWorkoutSessionById(id),
        workoutRepo.getSessionExerciseSummary(id),
        workoutRepo.getCardioBySession(id),
        pullupRepo.getPullupsBySession(id),
      ]);

      if (!sess) {
        setError('Тренировка не найдена');
        setIsLoading(false);
        return;
      }

      setSession(sess);
      setExerciseSummaries(summaries);
      setCardioLogs(cardio);
      setPullupLogs(pullups);      

      // Detect weight changes by comparing logged weight vs current exercise weight
      const changes: WeightChangeInfo[] = [];
      for (const summary of summaries) {
        if (!summary.hasAddedWeight || summary.isSkipped) continue;

        const workingSets = summary.sets.filter(
          (s) => s.setType === 'working' && !s.isSkipped
        );
        if (workingSets.length === 0) continue;

        // The weight used in the workout
        const loggedWeight = workingSets[0]!.weight;
        // The current weight in the exercise table (may have changed after progression)
        const currentWeight = summary.workingWeight;

        if (currentWeight !== null && currentWeight !== loggedWeight) {
          changes.push({
            exerciseId: summary.exerciseId,
            type: currentWeight > loggedWeight ? 'increase' : 'decrease',
            oldWeight: loggedWeight,
            newWeight: currentWeight,
          });
        }
      }
      setWeightChanges(changes);
    } catch (err) {
      console.error('Failed to load workout summary:', err);
      setError('Ошибка загрузки данных');
    } finally {
      setIsLoading(false);
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

  const pullupResultCard = useMemo(() => {
    if (pullupLogs.length === 0) return null;
    const first = pullupLogs[0]!;
    if (first.skipped) return { text: 'Подтягивания: пропущено', skipped: true, totalReps: 0, sets: [] };
    const dayName = getPullupDayName(
      first.pullupDay as 1 | 2 | 3 | 4 | 5,
      first.effectiveDay !== first.pullupDay ? (first.effectiveDay as 1 | 2 | 3 | 4) : undefined
    );
    const totalReps = pullupLogs.reduce((sum, l) => sum + l.reps, 0);
    return {
      text: `${dayName}: ${totalReps} повт.`,
      skipped: false,
      totalReps,
      sets: pullupLogs,
    };
  }, [pullupLogs]);

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

  // Helper to get weight change for an exercise
  function getWeightChange(exerciseId: string): WeightChangeInfo | undefined {
    return weightChanges.find((wc) => wc.exerciseId === exerciseId);
  }

  // --- Render ---

  if (isLoading) return <LoadingScreen />;

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#121212] px-4">
        <p className="text-[#B0B0B0] text-lg mb-4">{error ?? 'Тренировка не найдена'}</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="px-6 py-3 bg-[#4CAF50] text-white rounded-xl font-semibold active:bg-[#388E3C] transition-colors"
        >
          На главную
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
            onClick={() => navigate('/', { replace: true })}
            className="w-10 h-10 rounded-full bg-[#1E1E1E] flex items-center justify-center active:bg-[#2A2A2A] transition-colors"
          >
            <Home size={20} className="text-[#B0B0B0]" />
          </button>
          <div className="flex flex-col items-center">
            <h1 className={`text-lg font-bold ${dayTextClass}`}>{dayName}</h1>
            <p className="text-xs text-[#707070]">
              {formatDate(session.date)} · {directionLabel}
            </p>
          </div>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {/* Duration */}
          <div className="bg-[#252525] rounded-xl p-3 flex flex-col items-center gap-1">
            <Clock size={20} className="text-[#2196F3]" />
            <span className="text-xs text-[#B0B0B0]">Время</span>
            <span className="text-lg font-bold text-white">{durationStr}</span>
          </div>

          {/* Tonnage */}
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
              {exerciseCounts.completed + exerciseCounts.skipped + exerciseCounts.notDone}
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

        {/* Pull-up result */}
        {pullupResultCard && (
          <div className="bg-[#252525] rounded-xl p-3 mt-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={18} className="text-[#FF9800]" />
              <span className="text-sm font-semibold text-white">
                {pullupResultCard.text}
              </span>
            </div>
            {!pullupResultCard.skipped && pullupResultCard.sets.length > 0 && (
              <div className="ml-7 flex flex-wrap gap-1.5">
                {pullupResultCard.sets.map((s, i) => (
                  <div
                    key={i}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      s.succeeded
                        ? 'bg-[#4CAF50]/15 text-[#81C784]'
                        : 'bg-[#FF9800]/15 text-[#FF9800]'
                    }`}
                  >
                    {s.reps}
                    {s.gripType && (
                      <span className="text-[10px] opacity-70 ml-0.5">
                        {s.gripType === 'normal' ? 'О' : s.gripType === 'reverse' ? 'Б' : 'Ш'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}        

        {/* Weight changes banner */}
        {weightChanges.length > 0 && (
          <div className="mt-4 mb-1">
            <h3 className="text-sm font-semibold text-[#B0B0B0] mb-2">
              Изменения весов
            </h3>
            <div className="flex flex-col gap-2">
              {weightChanges.map((wc) => {
                const summary = exerciseSummaries.find(
                  (s) => s.exerciseId === wc.exerciseId
                );
                const isIncrease = wc.type === 'increase';
                return (
                  <div
                    key={wc.exerciseId}
                    className={`rounded-xl p-3 flex items-center gap-3 ${
                      isIncrease
                        ? 'bg-[#4CAF50]/10 border border-[#4CAF50]/30'
                        : 'bg-[#F44336]/10 border border-[#F44336]/30'
                    }`}
                  >
                    {isIncrease ? (
                      <TrendingUp size={20} className="text-[#4CAF50] shrink-0" />
                    ) : (
                      <TrendingDown size={20} className="text-[#F44336] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {summary?.exerciseName ?? ''}
                      </p>
                      <p
                        className={`text-xs ${
                          isIncrease ? 'text-[#81C784]' : 'text-[#F44336]'
                        }`}
                      >
                        {formatWeight(wc.oldWeight)} → {formatWeight(wc.newWeight)}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        isIncrease ? 'text-[#4CAF50]' : 'text-[#F44336]'
                      }`}
                    >
                      {isIncrease ? '+' : ''}
                      {formatDecimal(wc.newWeight - wc.oldWeight)} кг
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Exercise details */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-[#B0B0B0] mb-2">
            Результаты по упражнениям
          </h3>
          <div className="flex flex-col gap-2">
            {exerciseSummaries.map((summary) => (
              <ExerciseSummaryCard
                key={summary.exerciseId}
                summary={summary}
                weightChange={getWeightChange(summary.exerciseId)}
                dayColor={dayColor}
              />
            ))}
          </div>
        </div>

        {/* Home button */}
        <button
          onClick={() => navigate('/', { replace: true })}
          className="w-full mt-6 mb-4 py-4 rounded-xl bg-[#1E1E1E] text-[#B0B0B0] font-semibold text-base active:bg-[#2A2A2A] transition-colors flex items-center justify-center gap-2 border border-[#333333]"
        >
          <Home size={20} />
          На главную
        </button>
      </div>
    </div>
  );
}

// ==========================================
// Exercise Summary Card Component
// ==========================================

interface ExerciseSummaryCardProps {
  summary: ExerciseSummary;
  weightChange?: WeightChangeInfo;
  dayColor: string;
}

function ExerciseSummaryCard({
  summary,
  weightChange,
  dayColor,
}: ExerciseSummaryCardProps) {
  const { exerciseName, sets, isSkipped, hasAddedWeight, totalKg } = summary;

  // Separate warmup and working sets
  const warmupSets = sets.filter((s) => s.setType === 'warmup' && !s.isSkipped);
  const workingSets = sets.filter((s) => s.setType === 'working' && !s.isSkipped);

  // Working set reps for summary line
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

  // No sets recorded at all
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
      {/* Exercise name + weight change indicator */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-1 h-8 rounded-full shrink-0"
          style={{ backgroundColor: dayColor }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{exerciseName}</p>
        </div>
        {weightChange && (
          <div
            className={`flex items-center gap-1 shrink-0 ${
              weightChange.type === 'increase' ? 'text-[#4CAF50]' : 'text-[#F44336]'
            }`}
          >
            {weightChange.type === 'increase' ? (
              <TrendingUp size={14} />
            ) : (
              <TrendingDown size={14} />
            )}
          </div>
        )}
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
