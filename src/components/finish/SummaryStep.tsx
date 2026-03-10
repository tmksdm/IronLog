// src/components/finish/SummaryStep.tsx

/**
 * Step 2 of FinishWorkoutModal.
 * Post-workout weight input, summary of exercises, cardio result, save.
 */

import { useState, useMemo } from 'react';
import { useWorkoutStore } from '../../stores/workoutStore';
import type { ActiveExercise } from '../../stores/workoutStore';
import {
  ChevronUp,
  ChevronDown,
  Dumbbell,
  Clock,
  Scale,
  Activity,
  CheckCircle2,
  CircleDot,
  CircleOff,
} from 'lucide-react';
import { formatWorkoutDuration, formatTimeMMSS } from '../../utils/format';

interface SummaryStepProps {
  onFinish: (weightAfter: number | null) => void;
  onBack: () => void;
  isSaving: boolean;
}

const DAY_NAMES: Record<number, string> = {
  1: 'Присед',
  2: 'Тяга',
  3: 'Жим',
};

function countByStatus(exercises: ActiveExercise[]) {
  let completed = 0;
  let skipped = 0;
  let notStarted = 0;
  let inProgress = 0;

  for (const ex of exercises) {
    switch (ex.status) {
      case 'completed':
        completed++;
        break;
      case 'skipped':
        skipped++;
        break;
      case 'in_progress':
        inProgress++;
        break;
      default:
        notStarted++;
    }
  }

  return { completed, skipped, notStarted, inProgress };
}

function calculateTonnage(exercises: ActiveExercise[]): number {
  let total = 0;
  for (const ex of exercises) {
    if (ex.status === 'skipped') continue;
    for (const s of ex.sets) {
      if (s.isCompleted && s.weight > 0 && s.setType === 'working') {
        total += s.weight * (s.actualReps ?? 0);
      }
    }
  }
  return total;
}

export default function SummaryStep({ onFinish, onBack, isSaving }: SummaryStepProps) {
  const session = useWorkoutStore((s) => s.session);
  const exercises = useWorkoutStore((s) => s.exercises);
  const cardioType = useWorkoutStore((s) => s.cardioType);
  const jumpRopeCount = useWorkoutStore((s) => s.jumpRopeCount);
  const treadmillSeconds = useWorkoutStore((s) => s.treadmillSeconds);
  const isCardioCompleted = useWorkoutStore((s) => s.isCardioCompleted);

  // Weight after — default to weightBefore
  const [weightAfter, setWeightAfter] = useState<string>(
    session?.weightBefore ? session.weightBefore.toString() : ''
  );

  const counts = useMemo(() => countByStatus(exercises), [exercises]);
  const tonnage = useMemo(() => calculateTonnage(exercises), [exercises]);
  const totalExercises = exercises.length;

  // Workout duration using the real formatWorkoutDuration(timeStart, timeEnd)
  const durationStr = useMemo(() => {
    if (!session?.timeStart || !session?.timeEnd) return '—';
    return formatWorkoutDuration(session.timeStart, session.timeEnd) ?? '—';
  }, [session]);

  const dayName = session ? (DAY_NAMES[session.dayTypeId] ?? '') : '';

  const handleWeightChange = (delta: number) => {
    const current = parseFloat(weightAfter.replace(',', '.')) || 0;
    const next = Math.max(0, +(current + delta).toFixed(2));
    setWeightAfter(next.toString());
  };

  const handleFinish = () => {
    const parsed = parseFloat(weightAfter.replace(',', '.'));
    onFinish(isNaN(parsed) || parsed <= 0 ? null : parsed);
  };

  // Cardio result text
  const cardioResult = useMemo(() => {
    if (!isCardioCompleted) return null;
    if (cardioType === 'jump_rope' && jumpRopeCount !== null) {
      return `Скакалка: ${jumpRopeCount} прыжков`;
    }
    if (cardioType === 'treadmill_3km' && treadmillSeconds !== null) {
      return `Бег 3 км: ${formatTimeMMSS(treadmillSeconds)}`;
    }
    return null;
  }, [isCardioCompleted, cardioType, jumpRopeCount, treadmillSeconds]);

  return (
    <div className="flex flex-col gap-4 px-4">
      <h3 className="text-lg font-semibold text-white text-center">
        Итоги тренировки
      </h3>

      {/* Duration + Tonnage cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#252525] rounded-xl p-3 flex flex-col items-center gap-1">
          <Clock size={20} className="text-[#2196F3]" />
          <span className="text-xs text-[#B0B0B0]">Время</span>
          <span className="text-base font-bold text-white">{durationStr}</span>
        </div>
        <div className="bg-[#252525] rounded-xl p-3 flex flex-col items-center gap-1">
          <Dumbbell size={20} className="text-[#FF9800]" />
          <span className="text-xs text-[#B0B0B0]">Тоннаж</span>
          <span className="text-base font-bold text-white">
            {Math.round(tonnage)} кг
          </span>
        </div>
      </div>

      {/* Exercise counts */}
      <div className="bg-[#252525] rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[#B0B0B0]">Упражнения</span>
          <span className="text-sm text-white font-semibold">{dayName}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {counts.completed > 0 && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={16} className="text-[#4CAF50]" />
              <span className="text-sm text-white">{counts.completed}</span>
            </div>
          )}
          {counts.inProgress > 0 && (
            <div className="flex items-center gap-1.5">
              <CircleDot size={16} className="text-[#FF9800]" />
              <span className="text-sm text-white">{counts.inProgress}</span>
            </div>
          )}
          {counts.skipped > 0 && (
            <div className="flex items-center gap-1.5">
              <CircleOff size={16} className="text-[#F44336]" />
              <span className="text-sm text-white">{counts.skipped}</span>
            </div>
          )}
          {counts.notStarted > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full border-2 border-[#555555]" />
              <span className="text-sm text-white">{counts.notStarted}</span>
            </div>
          )}
          <span className="text-xs text-[#707070] ml-auto self-center">
            из {totalExercises}
          </span>
        </div>
      </div>

      {/* Cardio result */}
      {cardioResult && (
        <div className="bg-[#252525] rounded-xl p-3 flex items-center gap-2">
          <Activity size={18} className="text-[#81C784]" />
          <span className="text-sm text-white">{cardioResult}</span>
        </div>
      )}

      {/* Weight after input */}
      <div className="bg-[#252525] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Scale size={18} className="text-[#B0B0B0]" />
          <span className="text-sm text-[#B0B0B0]">Вес после тренировки</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => handleWeightChange(-0.25)}
            className="w-11 h-11 rounded-xl bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
          >
            <ChevronDown size={22} className="text-[#B0B0B0]" />
          </button>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              onFocus={(e) => e.target.select()}
              value={weightAfter}
              onChange={(e) => setWeightAfter(e.target.value)}
              placeholder="0"
              className="w-28 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#4CAF50] placeholder:text-[#555555]"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#707070]">
              кг
            </span>
          </div>
          <button
            onClick={() => handleWeightChange(0.25)}
            className="w-11 h-11 rounded-xl bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
          >
            <ChevronUp size={22} className="text-[#B0B0B0]" />
          </button>
        </div>
        <p className="text-xs text-[#707070] text-center mt-2">кнопки ±0,25 кг</p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-2 pb-2">
        <button
          onClick={onBack}
          disabled={isSaving}
          className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] font-semibold text-base active:bg-[#333333] transition-colors disabled:opacity-40"
        >
          Назад
        </button>
        <button
          onClick={handleFinish}
          disabled={isSaving}
          className="flex-1 py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors disabled:opacity-40"
        >
          {isSaving ? 'Сохранение...' : 'Завершить'}
        </button>
      </div>
    </div>
  );
}
