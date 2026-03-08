// src/components/workout/WorkoutHeader.tsx

/**
 * Top header bar for active workout.
 * Shows day type, direction, elapsed time, and action buttons.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Flag } from 'lucide-react';
import type { WorkoutSession } from '../../types';
import { getDayTypeColor } from '../../theme';

interface WorkoutHeaderProps {
  session: WorkoutSession;
  exercisesDone: number;
  exercisesTotal: number;
  onFinish: () => void;
  onCancel: () => void;
}

const dayNames: Record<number, string> = { 1: 'Присед', 2: 'Тяга', 3: 'Жим' };

export function WorkoutHeader({
  session,
  exercisesDone,
  exercisesTotal,
  onFinish,
  onCancel,
}: WorkoutHeaderProps) {
  const accentColor = getDayTypeColor(session.dayTypeId);
  const [elapsed, setElapsed] = useState('0:00');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const startTime = new Date(session.timeStart).getTime();

    const updateElapsed = () => {
      const now = Date.now();
      const diffSec = Math.floor((now - startTime) / 1000);
      const min = Math.floor(diffSec / 60);
      const sec = diffSec % 60;
      setElapsed(`${min}:${sec.toString().padStart(2, '0')}`);
    };

    updateElapsed();
    intervalRef.current = setInterval(updateElapsed, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session.timeStart]);

  const directionLabel = session.direction === 'normal' ? '→' : '←';
  const progressPercent = exercisesTotal > 0
    ? Math.round((exercisesDone / exercisesTotal) * 100)
    : 0;

  return (
    <div className="bg-[#1E1E1E] px-4 pt-3 pb-2">
      {/* Top row: day name + time + cancel */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold" style={{ color: accentColor }}>
            {dayNames[session.dayTypeId]}
          </h1>
          <span className="text-[#707070] text-lg">{directionLabel}</span>
          <span className="text-[#B0B0B0] text-sm font-mono">{elapsed}</span>
        </div>

        <button
          className="p-2 rounded-full active:bg-white/10"
          onClick={onCancel}
        >
          <X size={24} className="text-[#707070]" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-[#333] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: accentColor,
            }}
          />
        </div>

        <span className="text-xs text-[#B0B0B0] shrink-0">
          {exercisesDone}/{exercisesTotal}
        </span>

        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                     bg-green-600 active:bg-green-700 text-white text-sm font-semibold shrink-0"
          onClick={onFinish}
        >
          <Flag size={14} />
          Завершить
        </button>
      </div>
    </div>
  );
}
