// src/components/finish/PullupStep.tsx

/**
 * Pull-up step in post-workout tabs.
 * All execution state is stored in workoutStore.pullupInProgress
 * so that switching tabs or app crash doesn't lose progress.
 *
 * NOTE: Pull-up program progression is NOT applied here.
 * It is deferred to ActiveWorkoutPage.handleFinalSave() so that
 * deleting a test workout doesn't leave stale progression in localStorage.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useWorkoutStore } from '../../stores/workoutStore';
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
import { Check, SkipForward, ChevronRight } from 'lucide-react';

interface PullupStepProps {
  onNext: (result: PullupStepResult) => void;
}

// Fallback grip list for safety
const DAY3_GRIPS_DEFAULT: GripType[] = [
  'normal', 'normal', 'normal',
  'reverse', 'reverse', 'reverse',
  'wide', 'wide', 'wide',
];

// ---- Helper ----

function buildInitialState(plan: ReturnType<typeof buildDayPlan>): PullupInProgressState {
  return {
    plan: {
      dayNumber: plan.dayNumber,
      effectiveDay: plan.effectiveDay,
      day5ActualDay: plan.day5ActualDay,
      targetReps: plan.targetReps,
      grips: plan.grips,
      plannedSets: plan.plannedSets,
      restSeconds: plan.restSeconds,
    },
    started: false,
    completedSets: [],
    currentSetIndex: 0,
    ladderFailed: false,
    ladderFinalSet: false,
    isResting: false,
    restSecondsLeft: 0,
    restSecondsTotal: 0,
  };
}

// ---- Rest Timer Component ----
// Uses its OWN local state for the countdown to avoid hammering the store every second.
// Only writes to store on finish (rest complete).

function RestTimer({
  initialSeconds,
  totalSeconds,
  onFinish,
}: {
  initialSeconds: number;
  totalSeconds: number;
  onFinish: () => void;
}) {
  const [left, setLeft] = useState(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Start interval on mount
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          // Use setTimeout to avoid calling setState during render
          setTimeout(() => onFinishRef.current(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkip = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    onFinishRef.current();
  }, []);

  const min = Math.floor(left / 60);
  const sec = left % 60;

  // SVG ring
  const SIZE = 200;
  const STROKE = 10;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? left / totalSeconds : 0;
  const offset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-[#B0B0B0]">Отдых</p>
      <div className="relative flex items-center justify-center">
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            stroke="#333333"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            stroke="#FF9800"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-1000 linear"
          />
        </svg>
        <span className="absolute text-5xl font-bold text-white font-mono">
          {min}:{sec.toString().padStart(2, '0')}
        </span>
      </div>
      <button
        onClick={handleSkip}
        className="px-6 py-2.5 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] text-sm font-semibold active:bg-[#333333] transition-colors"
      >
        Пропустить отдых
      </button>
    </div>
  );
}

// ---- Day 1: Max Reps ----

function Day1Max({
  stateRef,
  onUpdate,
  onComplete,
}: {
  stateRef: React.MutableRefObject<PullupInProgressState>;
  onUpdate: (updates: Partial<PullupInProgressState>) => void;
  onComplete: (sets: PullupInProgressState['completedSets']) => void;
}) {
  const state = stateRef.current;
  const TOTAL_SETS = state.plan.plannedSets ?? 5;
  const sets = state.completedSets;
  const currentSet = sets.length + 1;

  const inputRef = useRef<HTMLInputElement>(null);

  const handleConfirm = useCallback(() => {
    const val = parseInt(inputRef.current?.value ?? '', 10);
    if (isNaN(val) || val < 0) return;

    const s = stateRef.current;
    const result = {
      setNumber: s.completedSets.length + 1,
      reps: val,
      grip: null as 'normal' | 'reverse' | 'wide' | null,
      targetReps: null as number | null,
      succeeded: true,
    };

    const newSets = [...s.completedSets, result];

    if (newSets.length >= (s.plan.plannedSets ?? 5)) {
      onComplete(newSets);
    } else {
      const restSec = s.plan.restSeconds ?? 90;
      onUpdate({
        completedSets: newSets,
        isResting: true,
        restSecondsLeft: restSec,
        restSecondsTotal: restSec,
      });
    }

    if (inputRef.current) inputRef.current.value = '';
  }, [stateRef, onUpdate, onComplete]);

  const handleRestFinish = useCallback(() => {
    onUpdate({
      isResting: false,
      restSecondsLeft: 0,
      restSecondsTotal: 0,
    });
  }, [onUpdate]);

  if (state.isResting && state.restSecondsLeft > 0) {
    return (
      <RestTimer
        initialSeconds={state.restSecondsLeft}
        totalSeconds={state.restSecondsTotal}
        onFinish={handleRestFinish}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progress */}
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
  stateRef,
  onUpdate,
  onComplete,
}: {
  stateRef: React.MutableRefObject<PullupInProgressState>;
  onUpdate: (updates: Partial<PullupInProgressState>) => void;
  onComplete: (sets: PullupInProgressState['completedSets']) => void;
}) {
  const state = stateRef.current;
  const sets = state.completedSets;
  const currentStep = state.currentSetIndex || 1;
  const failed = state.ladderFailed;
  const finalSet = state.ladderFinalSet;

  const inputRef = useRef<HTMLInputElement>(null);

  const handleStepSuccess = useCallback(() => {
    const s = stateRef.current;
    const step = s.currentSetIndex || 1;
    const result = {
      setNumber: s.completedSets.length + 1,
      reps: step,
      grip: null as 'normal' | 'reverse' | 'wide' | null,
      targetReps: step,
      succeeded: true,
    };

    const newSets = [...s.completedSets, result];
    const restSec = getLadderRestTime(step);
    onUpdate({
      completedSets: newSets,
      isResting: true,
      restSecondsLeft: restSec,
      restSecondsTotal: restSec,
    });
  }, [stateRef, onUpdate]);

  const handleStepFail = useCallback(() => {
    onUpdate({ ladderFailed: true });
    if (inputRef.current) inputRef.current.value = '';
  }, [onUpdate]);

  const handleFailConfirm = useCallback(() => {
    const val = parseInt(inputRef.current?.value ?? '', 10);
    if (isNaN(val) || val < 0) return;

    const s = stateRef.current;
    const step = s.currentSetIndex || 1;
    const result = {
      setNumber: s.completedSets.length + 1,
      reps: val,
      grip: null as 'normal' | 'reverse' | 'wide' | null,
      targetReps: step,
      succeeded: false,
    };

    const newSets = [...s.completedSets, result];
    const restSec = getLadderRestTime(val);
    onUpdate({
      completedSets: newSets,
      ladderFinalSet: true,
      isResting: true,
      restSecondsLeft: restSec,
      restSecondsTotal: restSec,
    });

    if (inputRef.current) inputRef.current.value = '';
  }, [stateRef, onUpdate]);

  const handleFinalConfirm = useCallback(() => {
    const val = parseInt(inputRef.current?.value ?? '', 10);
    if (isNaN(val) || val < 0) return;

    const s = stateRef.current;
    const result = {
      setNumber: s.completedSets.length + 1,
      reps: val,
      grip: null as 'normal' | 'reverse' | 'wide' | null,
      targetReps: null as number | null,
      succeeded: true,
    };

    onComplete([...s.completedSets, result]);
  }, [stateRef, onComplete]);

  const handleRestFinish = useCallback(() => {
    const s = stateRef.current;
    if (s.ladderFinalSet) {
      onUpdate({
        isResting: false,
        restSecondsLeft: 0,
        restSecondsTotal: 0,
      });
    } else {
      onUpdate({
        isResting: false,
        restSecondsLeft: 0,
        restSecondsTotal: 0,
        currentSetIndex: (s.currentSetIndex || 1) + 1,
      });
    }
  }, [stateRef, onUpdate]);

  if (state.isResting && state.restSecondsLeft > 0) {
    return (
      <RestTimer
        initialSeconds={state.restSecondsLeft}
        totalSeconds={state.restSecondsTotal}
        onFinish={handleRestFinish}
      />
    );
  }

  // Final max set (after rest)
  if (finalSet && !state.isResting) {
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
          onClick={handleFinalConfirm}
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
          onClick={handleFailConfirm}
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
        Подтянитесь {currentStep} {currentStep === 1 ? 'раз' : currentStep < 5 ? 'раза' : 'раз'}
      </p>

      <div className="flex gap-3 w-full">
        <button
          onClick={handleStepFail}
          className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-[#F44336] font-semibold text-base active:bg-[#333333] transition-colors"
        >
          Не смог
        </button>
        <button
          onClick={handleStepSuccess}
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
  stateRef,
  onUpdate,
  onComplete,
}: {
  stateRef: React.MutableRefObject<PullupInProgressState>;
  onUpdate: (updates: Partial<PullupInProgressState>) => void;
  onComplete: (sets: PullupInProgressState['completedSets']) => void;
}) {
  const state = stateRef.current;
  const totalSets = state.plan.plannedSets ?? 9;
  const grips = state.plan.grips ?? DAY3_GRIPS_DEFAULT;
  const target = state.plan.targetReps ?? 4;

  const sets = state.completedSets;
  const currentSet = state.currentSetIndex;
  const currentGrip = grips[currentSet] ?? 'normal';

  const handleSuccess = useCallback(() => {
    const s = stateRef.current;
    const idx = s.currentSetIndex;
    const g = (s.plan.grips ?? DAY3_GRIPS_DEFAULT)[idx] ?? 'normal';
    const t = s.plan.targetReps ?? 4;
    const total = s.plan.plannedSets ?? 9;

    const result = {
      setNumber: idx + 1,
      reps: t,
      grip: g,
      targetReps: t,
      succeeded: true,
    };

    const newSets = [...s.completedSets, result];

    if (idx + 1 >= total) {
      onComplete(newSets);
    } else {
      const restSec = s.plan.restSeconds ?? 60;
      onUpdate({
        completedSets: newSets,
        isResting: true,
        restSecondsLeft: restSec,
        restSecondsTotal: restSec,
      });
    }
  }, [stateRef, onUpdate, onComplete]);

  const handleFail = useCallback(() => {
    const s = stateRef.current;
    const idx = s.currentSetIndex;
    const g = (s.plan.grips ?? DAY3_GRIPS_DEFAULT)[idx] ?? 'normal';
    const t = s.plan.targetReps ?? 4;
    const total = s.plan.plannedSets ?? 9;

    const result = {
      setNumber: idx + 1,
      reps: 0,
      grip: g,
      targetReps: t,
      succeeded: false,
    };

    const newSets = [...s.completedSets, result];

    if (idx + 1 >= total) {
      onComplete(newSets);
    } else {
      const restSec = s.plan.restSeconds ?? 60;
      onUpdate({
        completedSets: newSets,
        isResting: true,
        restSecondsLeft: restSec,
        restSecondsTotal: restSec,
      });
    }
  }, [stateRef, onUpdate, onComplete]);

  const handleRestFinish = useCallback(() => {
    const s = stateRef.current;
    onUpdate({
      isResting: false,
      restSecondsLeft: 0,
      restSecondsTotal: 0,
      currentSetIndex: s.currentSetIndex + 1,
    });
  }, [stateRef, onUpdate]);

  if (state.isResting && state.restSecondsLeft > 0) {
    return (
      <RestTimer
        initialSeconds={state.restSecondsLeft}
        totalSeconds={state.restSecondsTotal}
        onFinish={handleRestFinish}
      />
    );
  }

  // Group indicator
  const gripBlockLabel = (() => {
    const gripBlock = Math.floor(currentSet / 3) + 1;
    const totalBlocks = Math.ceil(totalSets / 3);
    return `Блок ${gripBlock}/${totalBlocks}: ${getGripName(currentGrip)} хват`;
  })();

  const completedCount = sets.filter((s) => s.succeeded).length;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Set progress bar */}
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
          onClick={handleFail}
          className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-[#F44336] font-semibold text-base active:bg-[#333333] transition-colors"
        >
          Не смог
        </button>
        <button
          onClick={handleSuccess}
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

// ---- Completed View ----

function CompletedView({ result }: { result: PullupStepResult }) {
  const dayName = getPullupDayName(
    result.dayNumber,
    result.day5ActualDay ?? undefined
  );

  if (result.skipped) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 px-4">
        <div className="w-16 h-16 rounded-full bg-[#2A2A2A] flex items-center justify-center">
          <SkipForward size={32} className="text-[#707070]" />
        </div>
        <p className="text-base text-[#B0B0B0]">Подтягивания пропущены</p>
        <p className="text-sm text-[#707070]">{dayName}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 px-4">
      <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center">
        <Check size={32} className="text-[#4CAF50]" />
      </div>
      <p className="text-lg font-semibold text-white">Подтягивания выполнены</p>
      <p className="text-sm text-[#B0B0B0]">{dayName}</p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        <div className="bg-[#252525] rounded-xl p-3 flex flex-col items-center gap-1">
          <span className="text-xs text-[#B0B0B0]">Подходов</span>
          <span className="text-xl font-bold text-white">{result.sets.length}</span>
        </div>
        <div className="bg-[#252525] rounded-xl p-3 flex flex-col items-center gap-1">
          <span className="text-xs text-[#B0B0B0]">Всего повт.</span>
          <span className="text-xl font-bold text-[#FF9800]">{result.totalReps}</span>
        </div>
      </div>

      {result.sets.length > 0 && (
        <div className="w-full max-w-xs">
          <div className="flex flex-wrap gap-2 justify-center">
            {result.sets.map((s, i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-full flex flex-col items-center justify-center text-xs font-bold ${
                  s.succeeded ? 'bg-[#4CAF50] text-white' : 'bg-[#F44336] text-white'
                }`}
              >
                <span>{s.reps}</span>
                {s.grip && (
                  <span className="text-[8px] opacity-70">
                    {s.grip === 'normal' ? 'О' : s.grip === 'reverse' ? 'Р' : 'Ш'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main PullupStep Component ----

export default function PullupStep({ onNext }: PullupStepProps) {
  const pullupInProgress = useWorkoutStore((s) => s.pullupInProgress);
  const pullupResult = useWorkoutStore((s) => s.pullupResult);
  const setPullupInProgress = useWorkoutStore((s) => s.setPullupInProgress);
  const updatePullupInProgress = useWorkoutStore((s) => s.updatePullupInProgress);

  // Keep a ref to the latest state so child callbacks don't need state as dependency
  const stateRef = useRef<PullupInProgressState | null>(pullupInProgress);
  stateRef.current = pullupInProgress;

  // Force re-render when store updates (stateRef alone won't trigger render)
  // pullupInProgress from useWorkoutStore already does this via Zustand subscription.

  // Initialize pullupInProgress on first mount if not already set and no result
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    if (!pullupInProgress && !pullupResult) {
      initialized.current = true;
      const programState = loadPullupProgram();
      const plan = buildDayPlan(programState);
      setPullupInProgress(buildInitialState(plan));
    }
  }, [pullupInProgress, pullupResult, setPullupInProgress]);

  // Stable callbacks that read from stateRef
  const handleUpdate = useCallback(
    (updates: Partial<PullupInProgressState>) => {
      updatePullupInProgress(updates);
    },
    [updatePullupInProgress]
  );

  const handleComplete = useCallback(
    (completedSets: PullupInProgressState['completedSets']) => {
      const s = stateRef.current;
      if (!s) return;

      const totalReps = calculateTotalReps(completedSets);

      const result: PullupStepResult = {
        dayNumber: s.plan.dayNumber,
        effectiveDay: s.plan.effectiveDay,
        day5ActualDay: s.plan.day5ActualDay,
        sets: completedSets,
        totalReps,
        skipped: false,
      };

      setPullupInProgress(null);
      onNext(result);
    },
    [setPullupInProgress, onNext]
  );

  const handleSkip = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;

    const result: PullupStepResult = {
      dayNumber: s.plan.dayNumber,
      effectiveDay: s.plan.effectiveDay,
      day5ActualDay: s.plan.day5ActualDay,
      sets: [],
      totalReps: 0,
      skipped: true,
    };

    setPullupInProgress(null);
    onNext(result);
  }, [setPullupInProgress, onNext]);

  const handleStart = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    updatePullupInProgress({
      started: true,
      currentSetIndex: s.plan.effectiveDay === 2 ? 1 : 0,
    });
  }, [updatePullupInProgress]);

  // If already completed, show completed view
  if (pullupResult) {
    return <CompletedView result={pullupResult} />;
  }

  // Still loading / initializing
  if (!pullupInProgress) {
    return null;
  }

  // Intro screen — show what day it is, let user start or skip
  if (!pullupInProgress.started) {
    const programState = loadPullupProgram();
    const fullPlan = buildDayPlan(programState);

    return (
      <div className="flex flex-col items-center gap-5 px-4 pt-4">
        <h3 className="text-lg font-semibold text-white">Подтягивания</h3>

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

  // Active execution — render the right day component
  const { plan } = pullupInProgress;

  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-4">
      <h3 className="text-lg font-semibold text-white">
        {getPullupDayName(plan.dayNumber, plan.day5ActualDay ?? undefined)}
      </h3>

      {plan.effectiveDay === 1 && (
        <Day1Max
          stateRef={stateRef as React.MutableRefObject<PullupInProgressState>}
          onUpdate={handleUpdate}
          onComplete={handleComplete}
        />
      )}
      {plan.effectiveDay === 2 && (
        <Day2Ladder
          stateRef={stateRef as React.MutableRefObject<PullupInProgressState>}
          onUpdate={handleUpdate}
          onComplete={handleComplete}
        />
      )}
      {(plan.effectiveDay === 3 || plan.effectiveDay === 4) && (
        <Day34Grips
          stateRef={stateRef as React.MutableRefObject<PullupInProgressState>}
          onUpdate={handleUpdate}
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}
