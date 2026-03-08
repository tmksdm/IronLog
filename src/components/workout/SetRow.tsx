// src/components/workout/SetRow.tsx

/**
 * A single set row within an exercise card.
 * Shows set number, weight, target reps, actual reps (or stepper), and a complete button.
 */

import { useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import type { ActiveSet } from '../../stores/workoutStore';
import { formatDecimal } from '../../utils/format';

interface SetRowProps {
  set: ActiveSet;
  setIndex: number;
  exerciseIndex: number;
  isSkipped: boolean;
  hasWeight: boolean;
  onComplete: (exerciseIndex: number, setIndex: number, actualReps?: number) => void;
  onUpdateReps: (exerciseIndex: number, setIndex: number, reps: number) => void;
}

export function SetRow({
  set,
  setIndex,
  exerciseIndex,
  isSkipped,
  hasWeight,
  onComplete,
  onUpdateReps,
}: SetRowProps) {
  const [isEditing, setIsEditing] = useState(false);

  const isWarmup = set.setType === 'warmup';
  const isCompleted = set.isCompleted;
  const displayReps = set.actualReps ?? set.targetReps;

  // Determine the set label
  const setLabel = isWarmup ? `Р${set.setNumber}` : `${set.setNumber}`;

  // Weight display
  const weightDisplay = hasWeight && set.weight > 0
    ? `${formatDecimal(set.weight)} кг`
    : null;

  const handleQuickComplete = () => {
    if (isSkipped || isCompleted) return;
    onComplete(exerciseIndex, setIndex);
  };

  const handleEditToggle = () => {
    if (isSkipped) return;
    if (!isCompleted) {
      // If not completed yet, toggle editing mode
      setIsEditing(!isEditing);
    } else {
      // If already completed, toggle to allow correction
      setIsEditing(!isEditing);
    }
  };

  const handleRepsChange = (delta: number) => {
    const newReps = Math.max(0, displayReps + delta);
    onUpdateReps(exerciseIndex, setIndex, newReps);

    // If set was already completed, the reps update happens in-place
    // If not completed and reps changed, auto-complete with new value
    if (!isCompleted) {
      onComplete(exerciseIndex, setIndex, newReps);
    }
  };

  const handleConfirmEdit = () => {
    if (!isCompleted) {
      onComplete(exerciseIndex, setIndex, displayReps);
    }
    setIsEditing(false);
  };

  // Row background color
  let rowBg = 'bg-[#1E1E1E]';
  if (isSkipped) {
    rowBg = 'bg-red-900/20';
  } else if (isCompleted) {
    rowBg = isWarmup ? 'bg-green-900/15' : 'bg-green-900/25';
  }

  return (
    <div className={`flex items-center rounded-xl px-3 py-2.5 ${rowBg} gap-2`}>
      {/* Set number label */}
      <div className={`
        w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0
        ${isWarmup ? 'bg-[#333] text-[#B0B0B0]' : 'bg-[#2A2A2A] text-white'}
        ${isCompleted && !isSkipped ? 'bg-green-600/30 text-green-400' : ''}
      `}>
        {isCompleted && !isSkipped ? (
          <Check size={16} className="text-green-400" />
        ) : (
          setLabel
        )}
      </div>

      {/* Weight */}
      {weightDisplay && (
        <span className={`text-sm min-w-[60px] ${isWarmup ? 'text-[#707070]' : 'text-[#B0B0B0]'}`}>
          {weightDisplay}
        </span>
      )}

      {/* Reps area */}
      <div className="flex-1 flex items-center justify-end gap-2">
        {isEditing && !isSkipped ? (
          // Stepper mode
          <div className="flex items-center gap-1.5">
            <button
              className="w-10 h-10 rounded-full bg-[#333] active:bg-[#444]
                         flex items-center justify-center"
              onClick={() => handleRepsChange(-1)}
            >
              <Minus size={18} className="text-white" />
            </button>

            <span className="text-xl font-bold text-white min-w-[40px] text-center">
              {displayReps}
            </span>

            <button
              className="w-10 h-10 rounded-full bg-[#333] active:bg-[#444]
                         flex items-center justify-center"
              onClick={() => handleRepsChange(1)}
            >
              <Plus size={18} className="text-white" />
            </button>

            <button
              className="w-10 h-10 rounded-full bg-green-600 active:bg-green-700
                         flex items-center justify-center ml-1"
              onClick={handleConfirmEdit}
            >
              <Check size={18} className="text-white" />
            </button>
          </div>
        ) : (
          // Display mode
          <>
            {/* Target / actual reps — tappable to edit */}
            <button
              className={`
                text-lg font-bold min-w-[40px] text-center rounded-lg px-2 py-1
                ${isSkipped
                  ? 'text-red-400 line-through'
                  : isCompleted
                    ? displayReps < set.targetReps
                      ? 'text-orange-400'
                      : displayReps > set.targetReps
                        ? 'text-blue-400'
                        : 'text-green-400'
                    : 'text-white'
                }
                ${!isSkipped ? 'active:bg-white/10' : ''}
              `}
              onClick={handleEditToggle}
              disabled={isSkipped}
            >
              {isCompleted ? displayReps : set.targetReps}
              {isCompleted && displayReps !== set.targetReps && (
                <span className="text-xs text-[#707070] ml-1">/{set.targetReps}</span>
              )}
            </button>

            {/* Quick complete button */}
            {!isCompleted && !isSkipped && (
              <button
                className="w-12 h-12 rounded-full bg-green-600 active:bg-green-700
                           flex items-center justify-center shrink-0
                           shadow-lg shadow-green-900/30"
                onClick={handleQuickComplete}
              >
                <Check size={22} className="text-white" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
