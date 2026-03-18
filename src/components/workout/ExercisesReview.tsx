// src/components/workout/ExercisesReview.tsx

/**
 * Read-only review of exercises after workout is finished.
 * Shows the same cards but without interactive controls.
 */

import { useWorkoutStore } from '../../stores/workoutStore';
import type { ActiveExercise } from '../../stores/workoutStore';
import { Card } from '../ui';
import { formatWeight, formatDecimal } from '../../utils/format';
import {
  Check,
  Star,
  Ban,
  CheckCircle2,
  CircleDot,
  CircleOff,
} from 'lucide-react';
import { getDayTypeColor } from '../../theme';

// ---- Read-only set row ----

function ReadOnlySetRow({
  set,
  hasWeight,
  isWarmup,
}: {
  set: { setNumber: number; setType: string; weight: number; targetReps: number; actualReps: number | null; isCompleted: boolean };
  hasWeight: boolean;
  isWarmup: boolean;
}) {
  const displayReps = set.actualReps ?? set.targetReps;
  const isCompleted = set.isCompleted;

  const rowPy = isWarmup ? 'py-1.5' : 'py-2';
  const labelSize = isWarmup ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  const checkSize = isWarmup ? 14 : 16;
  const repsSize = isWarmup ? 'text-base' : 'text-lg';
  const weightSize = isWarmup ? 'text-xs' : 'text-sm';
  const setLabel = isWarmup ? `Р${set.setNumber}` : `${set.setNumber}`;

  const weightDisplay =
    hasWeight && set.weight > 0 ? `${formatDecimal(set.weight)} кг` : null;

  let rowBg = 'bg-[#1E1E1E]';
  if (isCompleted) {
    rowBg = isWarmup ? 'bg-green-900/15' : 'bg-green-900/25';
  }

  return (
    <div className={`flex items-center rounded-xl px-3 ${rowPy} ${rowBg} gap-2`}>
      {/* Set number */}
      <div
        className={`${labelSize} rounded-full flex items-center justify-center font-bold shrink-0 ${
          isCompleted
            ? 'bg-green-600/30 text-green-400'
            : isWarmup
              ? 'bg-[#333] text-[#B0B0B0]'
              : 'bg-[#2A2A2A] text-white'
        }`}
      >
        {isCompleted ? (
          <Check size={checkSize} className="text-green-400" />
        ) : (
          setLabel
        )}
      </div>

      {/* Weight */}
      {weightDisplay && (
        <span className={`${weightSize} min-w-15 ${isWarmup ? 'text-[#707070]' : 'text-[#B0B0B0]'}`}>
          {weightDisplay}
        </span>
      )}

      {/* Reps */}
      <div className="flex-1 flex items-center justify-end">
        <span
          className={`${repsSize} font-bold ${
            isCompleted
              ? displayReps < set.targetReps
                ? 'text-orange-400'
                : displayReps > set.targetReps
                  ? 'text-blue-400'
                  : 'text-green-400'
              : isWarmup
                ? 'text-[#B0B0B0]'
                : 'text-[#707070]'
          }`}
        >
          {isCompleted ? displayReps : set.targetReps}
          {isCompleted && displayReps !== set.targetReps && (
            <span className="text-xs text-[#707070] ml-1">/{set.targetReps}</span>
          )}
        </span>
      </div>
    </div>
  );
}

// ---- Read-only exercise card ----

function ReadOnlyExerciseCard({
  activeExercise,
  dayTypeId,
}: {
  activeExercise: ActiveExercise;
  dayTypeId: number;
}) {
  const { exercise, sets, status, isPriority } = activeExercise;
  const isSkipped = status === 'skipped';
  const accentColor = getDayTypeColor(dayTypeId);

  const workingSets = sets.filter((s) => s.setType === 'working');
  const completedWorkingSets = workingSets.filter((s) => s.isCompleted).length;
  const totalWorkingSets = workingSets.length;

  const weightInfo =
    exercise.hasAddedWeight && exercise.workingWeight !== null
      ? formatWeight(exercise.workingWeight)
      : exercise.hasAddedWeight
        ? 'Вес не задан'
        : 'Собственный вес';

  return (
    <Card
      className={`${isSkipped ? 'opacity-50' : ''} border-l-4`}
      style={{ borderLeftColor: isSkipped ? '#F44336' : accentColor }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isPriority && (
              <span className="flex items-center gap-1 text-xs bg-orange-600/20 text-orange-400 px-2 py-0.5 rounded-full shrink-0">
                <Star size={12} />
                Приоритет
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-white">{exercise.name}</h3>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-sm text-[#B0B0B0]">{weightInfo}</span>
            {!isSkipped && totalWorkingSets > 0 && (
              <span className="text-sm text-[#707070]">
                {completedWorkingSets}/{totalWorkingSets}
              </span>
            )}
          </div>
        </div>

        {/* Status icon */}
        <div className="shrink-0 ml-2">
          {status === 'completed' && <CheckCircle2 size={20} className="text-[#4CAF50]" />}
          {status === 'in_progress' && <CircleDot size={20} className="text-[#FF9800]" />}
          {status === 'skipped' && <CircleOff size={20} className="text-[#F44336]" />}
        </div>
      </div>

      {/* Sets */}
      {!isSkipped && sets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sets.map((s) => (
            <ReadOnlySetRow
              key={s.id}
              set={s}
              hasWeight={exercise.hasAddedWeight}
              isWarmup={s.setType === 'warmup'}
            />
          ))}
        </div>
      )}

      {isSkipped && (
        <div className="text-center py-3">
          <p className="text-red-400 text-sm flex items-center justify-center gap-1.5">
            <Ban size={14} />
            Пропущено
          </p>
        </div>
      )}
    </Card>
  );
}

// ---- Main component ----

export function ExercisesReview() {
  const exercises = useWorkoutStore((s) => s.exercises);
  const session = useWorkoutStore((s) => s.session);
  const dayTypeId = session?.dayTypeId ?? 1;

  if (exercises.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[#707070]">Нет данных</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 px-4">
      {exercises.map((ae) => (
        <ReadOnlyExerciseCard
          key={ae.exercise.id}
          activeExercise={ae}
          dayTypeId={dayTypeId}
        />
      ))}
    </div>
  );
}
