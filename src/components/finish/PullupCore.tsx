// src/components/finish/PullupCore.tsx

/**
 * Standalone pull-up execution core.
 *
 * Self-contained: does NOT depend on workoutStore. Holds in-progress state
 * via the parent (controlled component) so the parent can persist it for
 * crash resilience. Has its OWN rest timer (not the global workout RestTimer).
 *
 * Reports:
 *  - onStateChange(state): every meaningful change (for crash-resilience persist)
 *  - onComplete(result):   when the session finishes
 *  - onSkip(result):       when the user skips the session
 *
 * Progression is NOT applied here  the parent applies it on save.
 *
 * The day-execution logic (days 15, ladder, grips) mirrors PullupStep
 * but uses a local rest timer instead of the global one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadPullupProgram,
  buildDayPlan,
  calculateTotalReps,
  getLadderRestTime,
  getGripName,
  getPullupDayName,
  type GripType,
} from '../../utils/pullupProgram';
import type { PullupStepResult, PullupInProgressState } from '../../types';
import { Check, SkipForward, ChevronRight, X, RotateCcw } from 'lucide-react';
import { buildInitialPullupState } from './pullupState';
import { createCountdownDeadline, getCountdownSecondsLeft } from '../../utils/countdown';
import { useAccurateRestTimer } from '../workout/useAccurateRestTimer';

// Fallback grip list for safety
const DAY3_GRIPS_DEFAULT: GripType[] = [
  'normal', 'normal', 'normal',
  'reverse', 'reverse', 'reverse',
  'wide', 'wide', 'wide',
];

function finishRest(prev: PullupInProgressState): PullupInProgressState {
  const cleared = {
    ...prev,
    isResting: false,
    restSecondsLeft: 0,
    restSecondsTotal: 0,
    restEndsAt: null,
  };
  if (prev.plan.effectiveDay === 2 && !prev.ladderFinalSet) {
    return { ...cleared, currentSetIndex: (prev.currentSetIndex || 1) + 1 };
  }
  return cleared;
}

interface PullupCoreProps {
  /** Restore from a saved snapshot (crash resilience). If null, a fresh plan is built. */
  initialState?: PullupInProgressState | null;
  /** Called on every state change so the parent can persist for crash resilience. */
  onStateChange?: (state: PullupInProgressState) => void;
  /** Called when the session is completed. */
  onComplete: (result: PullupStepResult) => void;
  /** Called when the session is skipped. */
  onSkip: (result: PullupStepResult) => void;
}

// ---- Local Rest Timer (self-contained, not the global one) ----

function LocalRestTimer({
  secondsLeft,
  secondsTotal,
  onSkipRest,
  onAddRest,
}: {
  secondsLeft: number;
  secondsTotal: number;
  onSkipRest: () => void;
  onAddRest: () => void;
}) {
  const RING_SIZE = 220;
  const RING_STROKE = 12;
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = secondsTotal > 0 ? secondsLeft / secondsTotal : 0;
  const dashoffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <p className="text-sm text-[#B0B0B0]">Отдых между подходами</p>

      <div className="relative">
        <svg width={RING_SIZE} height={RING_SIZE} className="transform -rotate-90">
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            stroke="#2A2A2A"
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            stroke="#FF9800"
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            className="transition-[stroke-dashoffset] duration-1000 linear"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-6xl font-bold text-white font-mono">{secondsLeft}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={onAddRest}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] text-sm active:bg-[#333333]"
        >
          <RotateCcw size={18} />
          +15 сек
        </button>
        <button
          onClick={onSkipRest}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] text-sm active:bg-[#333333]"
        >
          <X size={18} />
          Пропустить
        </button>
      </div>
    </div>
  );
}

// ---- Day 1: Max Reps ----

function Day1Max({
  state,
  onRecordSet,
}: {
  state: PullupInProgressState;
  onRecordSet: (reps: number, succeeded: boolean, targetReps: number | null) => void;
}) {
  const TOTAL_SETS = state.plan.plannedSets ?? 5;
  const sets = state.completedSets;
  const currentSet = sets.length + 1;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleConfirm = useCallback(() => {
    const val = parseInt(inputRef.current?.value ?? '', 10);
    if (isNaN(val) || val < 0) return;
    onRecordSet(val, true, null);
    if (inputRef.current) inputRef.current.value = '';
  }, [onRecordSet]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-2">
        {Array.from({ length: TOTAL_SETS }, (_, i) => (
          <div
            key={i}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              i < sets.length
                ? 'bg-[#4CAF50] text-white'
                : i === sets.length
                  ? 'bg-[#FF9800] text-white'
                  : 'bg-[#333333] text-[#707070]'
            }`}
          >
            {i < sets.length ? (sets[i]?.reps ?? 0) : i + 1}
          </div>
        ))}
      </div>

      <p className="text-base text-white font-semibold">
        Подход {currentSet} из {TOTAL_SETS}
      </p>
      <p className="text-sm text-[#B0B0B0]">Подтянитесь на максимум</p>

      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        defaultValue=""
        onFocus={(e) => e.target.select()}
        placeholder="0"
        className="w-28 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#FF9800] placeholder:text-[#555555]"
      />

      <button
        onClick={handleConfirm}
        className="w-full py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors"
      >
        <span className="flex items-center justify-center gap-2">
          <Check size={20} />
          Записать
        </span>
      </button>
    </div>
  );
}

// ---- Day 2: Ladder ----

function Day2Ladder({
  state,
  onLadderSuccess,
  onLadderFailStart,
  onLadderFailConfirm,
  onLadderFinalConfirm,
}: {
  state: PullupInProgressState;
  onLadderSuccess: () => void;
  onLadderFailStart: () => void;
  onLadderFailConfirm: (reps: number) => void;
  onLadderFinalConfirm: (reps: number) => void;
}) {
  const sets = state.completedSets;
  const currentStep = state.currentSetIndex || 1;
  const failed = state.ladderFailed;
  const finalSet = state.ladderFinalSet;
  const inputRef = useRef<HTMLInputElement>(null);

  // Final max set (after rest)
  if (finalSet) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-base text-[#FF9800] font-semibold">Финальный подход</p>
        <p className="text-sm text-[#B0B0B0]">Подтянитесь на максимум</p>
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          defaultValue=""
          onFocus={(e) => e.target.select()}
          placeholder="0"
          className="w-28 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#FF9800] placeholder:text-[#555555]"
        />
        <button
          onClick={() => {
            const val = parseInt(inputRef.current?.value ?? '', 10);
            if (isNaN(val) || val < 0) return;
            onLadderFinalConfirm(val);
          }}
          className="w-full py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors"
        >
          <span className="flex items-center justify-center gap-2">
            <Check size={20} />
            Завершить лесенку
          </span>
        </button>
      </div>
    );
  }

  // Failure input
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-base text-[#F44336] font-semibold">
          Не удалось сделать {currentStep}
        </p>
        <p className="text-sm text-[#B0B0B0]">Сколько получилось?</p>
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          defaultValue=""
          onFocus={(e) => e.target.select()}
          placeholder="0"
          className="w-28 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#F44336] placeholder:text-[#555555]"
        />
        <button
          onClick={() => {
            const val = parseInt(inputRef.current?.value ?? '', 10);
            if (isNaN(val) || val < 0) return;
            onLadderFailConfirm(val);
          }}
          className="w-full py-3.5 rounded-xl bg-[#F44336] text-white font-semibold text-base active:bg-[#D32F2F] transition-colors"
        >
          Записать и перейти к финальному подходу
        </button>
      </div>
    );
  }

  // Normal ladder step
  return (
    <div className="flex flex-col items-center gap-4">
      {sets.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {sets.map((s, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-full bg-[#4CAF50] text-white flex items-center justify-center text-sm font-bold"
            >
              {s.reps}
            </div>
          ))}
        </div>
      )}

      <div className="w-20 h-20 rounded-full bg-[#FF9800] flex items-center justify-center">
        <span className="text-3xl font-bold text-white">{currentStep}</span>
      </div>

      <p className="text-base text-white font-semibold">
        Подтянитесь {currentStep}{' '}
        {currentStep === 1 ? 'раз' : currentStep < 5 ? 'раза' : 'раз'}
      </p>

      <div className="flex gap-3 w-full">
        <button
          onClick={onLadderFailStart}
          className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-[#F44336] font-semibold text-base active:bg-[#333333] transition-colors"
        >
          Не смог
        </button>
        <button
          onClick={onLadderSuccess}
          className="flex-1 py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors"
        >
          <span className="flex items-center justify-center gap-2">
            <Check size={20} />
            Сделал
          </span>
        </button>
      </div>
    </div>
  );
}

// ---- Day 3/4: Grip Sets ----

function Day34Grips({
  state,
  onRecordGrip,
}: {
  state: PullupInProgressState;
  onRecordGrip: (succeeded: boolean) => void;
}) {
  const totalSets = state.plan.plannedSets ?? 9;
  const grips = state.plan.grips ?? DAY3_GRIPS_DEFAULT;
  const target = state.plan.targetReps ?? 4;
  const sets = state.completedSets;
  const currentSet = state.currentSetIndex;
  const currentGrip = grips[currentSet] ?? 'normal';

  const gripBlockLabel = (() => {
    const gripBlock = Math.floor(currentSet / 3) + 1;
    const totalBlocks = Math.ceil(totalSets / 3);
    return `Блок ${gripBlock}/${totalBlocks}: ${getGripName(currentGrip)} хват`;
  })();

  const completedCount = sets.filter((s) => s.succeeded).length;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap gap-1.5 justify-center">
        {Array.from({ length: totalSets }, (_, i) => {
          const s = sets[i];
          let color = 'bg-[#333333]';
          if (s) {
            color = s.succeeded ? 'bg-[#4CAF50]' : 'bg-[#F44336]';
          } else if (i === currentSet) {
            color = 'bg-[#FF9800]';
          }
          return (
            <div
              key={i}
              className={`w-6 h-6 rounded-full ${color} flex items-center justify-center`}
            >
              {s ? (
                <span className="text-[10px] font-bold text-white">
                  {s.succeeded ? '✓' : '✗'}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-sm text-[#B0B0B0]">{gripBlockLabel}</p>
      <p className="text-sm text-[#707070]">
        Засчитано: {completedCount} из {totalSets}
      </p>

      <div className="w-24 h-24 rounded-full bg-[#2A2A2A] border-4 border-[#FF9800] flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white">{target}</span>
        <span className="text-[10px] text-[#B0B0B0]">повт.</span>
      </div>

      <p className="text-base text-white font-semibold">
        Подход {currentSet + 1} из {totalSets}
      </p>

      <div className="flex gap-3 w-full">
        <button
          onClick={() => onRecordGrip(false)}
          className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-[#F44336] font-semibold text-base active:bg-[#333333] transition-colors"
        >
          Не смог
        </button>
        <button
          onClick={() => onRecordGrip(true)}
          className="flex-1 py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors"
        >
          <span className="flex items-center justify-center gap-2">
            <Check size={20} />
            Сделал {target}
          </span>
        </button>
      </div>
    </div>
  );
}

// ---- Main PullupCore ----

function PullupCore({
  initialState,
  onStateChange,
  onComplete,
  onSkip,
}: PullupCoreProps) {
  const [state, setState] = useState<PullupInProgressState>(
    () => initialState ?? buildInitialPullupState()
  );

  // Keep a ref so child callbacks always read the latest state
  const stateRef = useRef<PullupInProgressState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Report state changes upward for crash-resilience persist
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const syncRestTimer = useCallback((now: number) => {
    let finished = false;
    setState((prev) => {
      if (!prev.isResting) return prev;
      const restEndsAt = prev.restEndsAt
        ?? createCountdownDeadline(prev.restSecondsLeft, now);
      const restSecondsLeft = getCountdownSecondsLeft(restEndsAt, now);
      if (restSecondsLeft <= 0) {
        finished = true;
        return finishRest(prev);
      }
      if (
        restSecondsLeft === prev.restSecondsLeft
        && restEndsAt === prev.restEndsAt
      ) return prev;
      return { ...prev, restSecondsLeft, restEndsAt };
    });
    return finished;
  }, []);

  useAccurateRestTimer({
    isRunning: state.isResting,
    endsAt: state.restEndsAt
      ?? (state.isResting ? createCountdownDeadline(state.restSecondsLeft) : null),
    sync: syncRestTimer,
  });

  // ---- Start / Skip ----

  const handleStart = useCallback(() => {
    setState((prev) => ({
      ...prev,
      started: true,
      currentSetIndex: prev.plan.effectiveDay === 2 ? 1 : 0,
    }));
  }, []);

  const handleSkip = useCallback(() => {
    const s = stateRef.current;
    onSkip({
      dayNumber: s.plan.dayNumber,
      effectiveDay: s.plan.effectiveDay,
      day5ActualDay: s.plan.day5ActualDay,
      sets: [],
      totalReps: 0,
      skipped: true,
    });
  }, [onSkip]);

  const finishSession = useCallback(
    (completedSets: PullupInProgressState['completedSets']) => {
      const s = stateRef.current;
      onComplete({
        dayNumber: s.plan.dayNumber,
        effectiveDay: s.plan.effectiveDay,
        day5ActualDay: s.plan.day5ActualDay,
        sets: completedSets,
        totalReps: calculateTotalReps(completedSets),
        skipped: false,
      });
    },
    [onComplete]
  );

  // ---- Rest timer manual controls ----

  const handleSkipRest = useCallback(() => {
    setState((prev) => (prev.isResting ? finishRest(prev) : prev));
  }, []);

  const handleAddRest = useCallback(() => {
    setState((prev) =>
      prev.isResting
        ? {
            ...prev,
            restSecondsLeft: prev.restSecondsLeft + 15,
            restSecondsTotal: prev.restSecondsTotal + 15,
            restEndsAt: (prev.restEndsAt
              ?? createCountdownDeadline(prev.restSecondsLeft)) + 15_000,
          }
        : prev
    );
  }, []);

  // ---- Day 1 ----

  const handleDay1Record = useCallback(
    (reps: number) => {
      setState((prev) => {
        const result = {
          setNumber: prev.completedSets.length + 1,
          reps,
          grip: null as GripType | null,
          targetReps: null as number | null,
          succeeded: true,
        };
        const newSets = [...prev.completedSets, result];
        if (newSets.length >= (prev.plan.plannedSets ?? 5)) {
          setTimeout(() => finishSession(newSets), 0);
          return { ...prev, completedSets: newSets };
        }
        const restSec = prev.plan.restSeconds ?? 90;
        return {
          ...prev,
          completedSets: newSets,
          isResting: true,
          restSecondsLeft: restSec,
          restSecondsTotal: restSec,
          restEndsAt: createCountdownDeadline(restSec),
        };
      });
    },
    [finishSession]
  );

  // ---- Day 2 (ladder) ----

  const handleLadderSuccess = useCallback(() => {
    setState((prev) => {
      const step = prev.currentSetIndex || 1;
      const result = {
        setNumber: prev.completedSets.length + 1,
        reps: step,
        grip: null as GripType | null,
        targetReps: step,
        succeeded: true,
      };
      const restSec = getLadderRestTime(step);
      return {
        ...prev,
        completedSets: [...prev.completedSets, result],
        isResting: true,
        restSecondsLeft: restSec,
        restSecondsTotal: restSec,
        restEndsAt: createCountdownDeadline(restSec),
      };
    });
  }, []);

  const handleLadderFailStart = useCallback(() => {
    setState((prev) => ({ ...prev, ladderFailed: true }));
  }, []);

  const handleLadderFailConfirm = useCallback((reps: number) => {
    setState((prev) => {
      const step = prev.currentSetIndex || 1;
      const result = {
        setNumber: prev.completedSets.length + 1,
        reps,
        grip: null as GripType | null,
        targetReps: step,
        succeeded: false,
      };
      const restSec = getLadderRestTime(reps);
      return {
        ...prev,
        completedSets: [...prev.completedSets, result],
        ladderFailed: false,
        ladderFinalSet: true,
        isResting: true,
        restSecondsLeft: restSec,
        restSecondsTotal: restSec,
        restEndsAt: createCountdownDeadline(restSec),
      };
    });
  }, []);

  const handleLadderFinalConfirm = useCallback(
    (reps: number) => {
      const s = stateRef.current;
      const result = {
        setNumber: s.completedSets.length + 1,
        reps,
        grip: null as GripType | null,
        targetReps: null as number | null,
        succeeded: true,
      };
      finishSession([...s.completedSets, result]);
    },
    [finishSession]
  );

  // ---- Day 3/4 (grips) ----

  const handleGripRecord = useCallback(
    (succeeded: boolean) => {
      setState((prev) => {
        const idx = prev.currentSetIndex;
        const g = (prev.plan.grips ?? DAY3_GRIPS_DEFAULT)[idx] ?? 'normal';
        const t = prev.plan.targetReps ?? 4;
        const total = prev.plan.plannedSets ?? 9;

        // Guard against duplicate recording for the same index
        if (prev.completedSets.length > idx) return prev;

        const result = {
          setNumber: idx + 1,
          reps: succeeded ? t : 0,
          grip: g,
          targetReps: t,
          succeeded,
        };
        const newSets = [...prev.completedSets, result];

        if (newSets.length >= total) {
          setTimeout(() => finishSession(newSets), 0);
          return { ...prev, completedSets: newSets };
        }
        const restSec = prev.plan.restSeconds ?? 60;
        return {
          ...prev,
          completedSets: newSets,
          currentSetIndex: idx + 1,
          isResting: true,
          restSecondsLeft: restSec,
          restSecondsTotal: restSec,
          restEndsAt: createCountdownDeadline(restSec),
        };
      });
    },
    [finishSession]
  );

  // ---- Render ----

  // Resting view (shared across all days)
  if (state.isResting) {
    return (
      <LocalRestTimer
        secondsLeft={state.restSecondsLeft}
        secondsTotal={state.restSecondsTotal}
        onSkipRest={handleSkipRest}
        onAddRest={handleAddRest}
      />
    );
  }

  // Intro screen
  if (!state.started) {
    const programState = loadPullupProgram();
    const fullPlan = buildDayPlan(programState);
    return (
      <div className="flex flex-col items-center gap-5 px-4 pt-4">
        <div className="w-full bg-[#252525] rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#B0B0B0]">День</span>
            <span className="text-sm text-white font-semibold">
              {fullPlan.dayNumber} из 5
            </span>
          </div>
          <p className="text-base text-[#FF9800] font-semibold">
            {getPullupDayName(fullPlan.dayNumber, fullPlan.day5ActualDay ?? undefined)}
          </p>
          <p className="text-sm text-[#B0B0B0]">{fullPlan.description}</p>
        </div>

        <div className="flex gap-3 w-full mt-2">
          <button
            onClick={handleSkip}
            className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] font-semibold text-base active:bg-[#333333] transition-colors"
          >
            <span className="flex items-center justify-center gap-2">
              <SkipForward size={18} />
              Пропустить
            </span>
          </button>
          <button
            onClick={handleStart}
            className="flex-1 py-3.5 rounded-xl bg-[#FF9800] text-white font-semibold text-base active:bg-[#E68900] transition-colors"
          >
            <span className="flex items-center justify-center gap-2">
              Начать
              <ChevronRight size={18} />
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Active execution
  const { plan } = state;
  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-4">
      <h3 className="text-lg font-semibold text-white">
        {getPullupDayName(plan.dayNumber, plan.day5ActualDay ?? undefined)}
      </h3>

      {plan.effectiveDay === 1 && (
        <Day1Max state={state} onRecordSet={(reps) => handleDay1Record(reps)} />
      )}
      {plan.effectiveDay === 2 && (
        <Day2Ladder
          state={state}
          onLadderSuccess={handleLadderSuccess}
          onLadderFailStart={handleLadderFailStart}
          onLadderFailConfirm={handleLadderFailConfirm}
          onLadderFinalConfirm={handleLadderFinalConfirm}
        />
      )}
      {(plan.effectiveDay === 3 || plan.effectiveDay === 4) && (
        <Day34Grips state={state} onRecordGrip={handleGripRecord} />
      )}
    </div>
  );
}

export default PullupCore;
