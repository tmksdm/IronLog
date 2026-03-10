// src/components/workout/RestTimer.tsx

/**
 * Rest timer with two modes:
 * - Expanded: near-fullscreen overlay with large circular SVG ring
 * - Collapsed: small floating bubble at bottom
 *
 * Timer auto-starts after completing a set.
 * Tap to toggle between modes. Auto-disappears when reaching 0.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { useWorkoutStore } from '../../stores/workoutStore';
import { colors } from '../../theme';

// SVG ring constants
const RING_SIZE = 240;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Mini ring for collapsed mode
const MINI_SIZE = 56;
const MINI_STROKE = 4;
const MINI_RADIUS = (MINI_SIZE - MINI_STROKE) / 2;
const MINI_CIRCUMFERENCE = 2 * Math.PI * MINI_RADIUS;

export function RestTimer() {
  const isRunning = useWorkoutStore((s) => s.isRestTimerRunning);
  const seconds = useWorkoutStore((s) => s.restTimerSeconds);
  const defaultSeconds = useWorkoutStore((s) => s.restTimerDefault);
  const tickRestTimer = useWorkoutStore((s) => s.tickRestTimer);
  const stopRestTimer = useWorkoutStore((s) => s.stopRestTimer);
  const startRestTimer = useWorkoutStore((s) => s.startRestTimer);

  const [isExpanded, setIsExpanded] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick the timer every second
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        tickRestTimer();
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, tickRestTimer]);

  // Auto-expand when timer starts
  useEffect(() => {
    if (isRunning && seconds === defaultSeconds) {
      setIsExpanded(true);
    }
  }, [isRunning, seconds, defaultSeconds]);

  const handleClose = useCallback(() => {
    stopRestTimer();
  }, [stopRestTimer]);

  const handleRestart = useCallback(() => {
    startRestTimer();
    setIsExpanded(true);
  }, [startRestTimer]);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (!isRunning) return null;

  const progress = seconds / defaultSeconds;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const miniStrokeDashoffset = MINI_CIRCUMFERENCE * (1 - progress);

  // Expanded mode
  if (isExpanded) {
    return (
      <div
        className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85"
        onClick={handleToggle}
      >
        {/* SVG Ring */}
        <div className="relative">
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            className="transform -rotate-90"
          >
            {/* Background ring */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.surfaceLight}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {/* Progress ring */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.primary}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-1000 linear"
            />
          </svg>

          {/* Seconds display */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-8xl font-bold text-white font-mono">
              {seconds}
            </span>
          </div>
        </div>

        {/* Control buttons */}
        <div
          className="flex items-center gap-6 mt-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 px-5 py-3 rounded-xl
                       bg-[#333] active:bg-[#444] text-[#B0B0B0] text-sm"
            onClick={handleClose}
          >
            <X size={18} />
            Закрыть
          </button>
          <button
            className="flex items-center gap-2 px-5 py-3 rounded-xl
                       bg-[#333] active:bg-[#444] text-[#B0B0B0] text-sm"
            onClick={handleRestart}
          >
            <RotateCcw size={18} />
            Заново
          </button>
        </div>
      </div>
    );
  }

  // Collapsed mode — floating bubble
  return (
    <button
      className="fixed bottom-6 right-6 z-40 w-[72px] h-[72px] rounded-full
                 bg-[#1E1E1E] border border-[#333] shadow-xl
                 flex items-center justify-center"
      onClick={handleToggle}
    >
      <svg
        width={MINI_SIZE}
        height={MINI_SIZE}
        className="absolute transform -rotate-90"
      >
        <circle
          cx={MINI_SIZE / 2}
          cy={MINI_SIZE / 2}
          r={MINI_RADIUS}
          stroke={colors.surfaceLight}
          strokeWidth={MINI_STROKE}
          fill="none"
        />
        <circle
          cx={MINI_SIZE / 2}
          cy={MINI_SIZE / 2}
          r={MINI_RADIUS}
          stroke={colors.primary}
          strokeWidth={MINI_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={MINI_CIRCUMFERENCE}
          strokeDashoffset={miniStrokeDashoffset}
          className="transition-[stroke-dashoffset] duration-1000 linear"
        />
      </svg>
      <span className="text-lg font-bold text-white font-mono z-10">
        {seconds}
      </span>
    </button>
  );
}
