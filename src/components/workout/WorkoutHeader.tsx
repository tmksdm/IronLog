// src/components/workout/WorkoutHeader.tsx

/**
 * Top header bar for active workout.
 * Shows day type, direction, elapsed time, and action buttons.
 * In post-finish mode: no action buttons, just info.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Flag, Pencil, Scale } from 'lucide-react';
import type { WorkoutSession } from '../../types';
import { getDayTypeColor } from '../../theme';
import { formatDecimal } from '../../utils/format';

interface WorkoutHeaderProps {
  session: WorkoutSession;
  exercisesDone: number;
  exercisesTotal: number;
  onFinish: () => void;
  onCancel: () => void;
  onEditWeight: () => void;
  postFinish?: boolean;
}

const dayNames: Record<number, string> = { 1: 'Присед', 2: 'Тяга', 3: 'Жим' };

function formatElapsed(diffSec: number): string {
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function WorkoutHeader({
  session,
  exercisesDone,
  exercisesTotal,
  onFinish,
  onCancel,
  onEditWeight,
  postFinish = false,
}: WorkoutHeaderProps) {
  const accentColor = getDayTypeColor(session.dayTypeId);
  const startTime = new Date(session.timeStart).getTime();
  const [elapsed, setElapsed] = useState(() =>
    formatElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)))
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const effectStartTime = new Date(session.timeStart).getTime();
    // If timeEnd is already set, show fixed duration and don't tick
    if (session.timeEnd) return;

    // Otherwise, tick every second
    const updateElapsed = () => {
      const now = Date.now();
      const diffSec = Math.floor((now - effectStartTime) / 1000);
      setElapsed(formatElapsed(diffSec));
    };

    intervalRef.current = setInterval(updateElapsed, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session.timeStart, session.timeEnd]);

  const displayedElapsed = session.timeEnd
    ? formatElapsed(
        Math.max(
          0,
          Math.floor(
            (new Date(session.timeEnd).getTime() - new Date(session.timeStart).getTime()) / 1000
          )
        )
      )
    : elapsed;

  const directionLabel = session.direction === 'normal' ? '→' : '←';
  const progressPercent = exercisesTotal > 0
    ? Math.round((exercisesDone / exercisesTotal) * 100)
    : 0;

  return (
    <div className="bg-[#1E1E1E] px-4 pt-3 pb-2">
      {/* Top row: day name + time + body weight + cancel */}
      <div className="flex items-center mb-2">
        <div className="flex items-center gap-2 shrink-0">
          <h1 className="text-xl font-bold" style={{ color: accentColor }}>
            {dayNames[session.dayTypeId]}
          </h1>
          <span className="text-[#707070] text-lg">{directionLabel}</span>
          <span className={`text-sm font-mono ${session.timeEnd ? 'text-[#4CAF50]' : 'text-[#B0B0B0]'}`}>
            {displayedElapsed}
          </span>
        </div>

        <button
          type="button"
          onClick={onEditWeight}
          aria-label="Изменить вес до тренировки"
          className="flex items-center gap-1.5 ml-auto px-2 py-1 rounded-lg text-xs text-[#B0B0B0] active:bg-white/10"
        >
          <Scale size={14} />
          {session.weightBefore === null ? '—' : `${formatDecimal(session.weightBefore)} кг`}
          <Pencil size={12} className="text-[#81C784]" />
        </button>

        {!postFinish && (
          <button
            className="ml-1 p-2 rounded-full active:bg-white/10"
            onClick={onCancel}
          >
            <X size={24} className="text-[#707070]" />
          </button>
        )}
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

        {!postFinish && (
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                       bg-green-600 active:bg-green-700 text-white text-sm font-semibold shrink-0"
            onClick={onFinish}
          >
            <Flag size={14} />
            Завершить
          </button>
        )}
      </div>
    </div>
  );
}
