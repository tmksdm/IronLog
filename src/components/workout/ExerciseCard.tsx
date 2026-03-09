// src/components/workout/ExerciseCard.tsx

/**
 * Full exercise card shown during active workout.
 * Contains all set rows, skip/unskip button, and exercise info.
 */

import type { ActiveExercise } from '../../stores/workoutStore';
import { SetRow } from './SetRow';
import { Card } from '../ui';
import { formatWeight } from '../../utils/format';
import { Ban, RotateCcw, Star } from 'lucide-react';
import { getDayTypeColor } from '../../theme';

interface ExerciseCardProps {
  activeExercise: ActiveExercise;
  exerciseIndex: number;
  dayTypeId: number;
  onCompleteSet: (exerciseIndex: number, setIndex: number, actualReps?: number) => void;
  onUpdateSetReps: (exerciseIndex: number, setIndex: number, reps: number) => void;
  onSkip: (exerciseIndex: number) => void;
  onUnskip: (exerciseIndex: number) => void;
}

export function ExerciseCard({
  activeExercise,
  exerciseIndex,
  dayTypeId,
  onCompleteSet,
  onUpdateSetReps,
  onSkip,
  onUnskip,
}: ExerciseCardProps) {
  const { exercise, sets, status, isPriority } = activeExercise;
  const isSkipped = status === 'skipped';
  const accentColor = getDayTypeColor(dayTypeId);

  // Count completed working sets
  const workingSets = sets.filter((s) => s.setType === 'working');
  const completedWorkingSets = workingSets.filter((s) => s.isCompleted).length;
  const totalWorkingSets = workingSets.length;

  // Working weight display
  const weightInfo = exercise.hasAddedWeight && exercise.workingWeight !== null
    ? formatWeight(exercise.workingWeight)
    : exercise.hasAddedWeight
      ? 'Вес не задан'
      : 'Собственный вес';

  return (
    <Card className={`
      ${isSkipped ? 'opacity-50' : ''}
      border-l-4
    `}
    style={{ borderLeftColor: isSkipped ? '#F44336' : accentColor }}
    >
      {/* Exercise header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isPriority && (
              <span className="flex items-center gap-1 text-xs bg-orange-600/20 text-orange-400
                             px-2 py-0.5 rounded-full shrink-0">
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

        {/* Skip / Unskip button */}
        <div className="shrink-0 ml-2">
          {isSkipped ? (
            <button
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl
                         bg-orange-600/20 active:bg-orange-600/30 text-orange-400 text-sm"
              onClick={() => onUnskip(exerciseIndex)}
            >
              <RotateCcw size={16} />
              Вернуть
            </button>
          ) : (
            <button
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl
                         bg-red-600/10 active:bg-red-600/20 text-red-400 text-sm"
              onClick={() => onSkip(exerciseIndex)}
            >
              <Ban size={16} />
              Пропустить
            </button>
          )}
        </div>
      </div>

      {/* Set rows */}
      {!isSkipped && sets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sets.map((set, idx) => (
            <SetRow
              key={set.id}
              set={set}
              setIndex={idx}
              exerciseIndex={exerciseIndex}
              isSkipped={isSkipped}
              hasWeight={exercise.hasAddedWeight}
              onComplete={onCompleteSet}
              onUpdateReps={onUpdateSetReps}
            />
          ))}
        </div>
      )}

      {/* Skipped state */}
      {isSkipped && (
        <div className="text-center py-4">
          <p className="text-red-400 text-sm">Упражнение пропущено</p>
          <p className="text-[#707070] text-xs mt-1">
            Будет приоритетным в следующий раз
          </p>
        </div>
      )}
    </Card>
  );
}
