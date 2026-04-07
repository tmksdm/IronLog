// src/components/finish/PullupStep.tsx

/**
 * Pull-up step in post-workout tabs.
 * All execution state is stored in workoutStore.pullupInProgress
 * so that switching tabs or app crash doesn't lose progress.
 *
 * Rest timer uses the global RestTimer (workoutStore) so it can be
 * collapsed/expanded and works across tab switches.
 *
 * NOTE: Pull-up program progression is NOT applied here.
 * It is deferred to ActiveWorkoutPage.handleFinalSave() so that
 * deleting a test workout doesn't leave stale progression in localStorage.
 *
 * FIX (v0.17.3): Day34Grips now advances currentSetIndex immediately when
 * recording a set (in handleSuccess/handleFail), not after rest timer finishes.
 * This prevents infinite loop when rest timer is dismissed early.
 * Rest timer finish callback for days 3/4 now only clears isResting flag.
 */

import { useEffect, useCallback, useRef } from 'react';
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

// ---- Resting Indicator (shown inline when global timer is running) ----

function RestingIndicator({ state }: { state: PullupInProgressState }) {
  const isTimerRunning = useWorkoutStore((s) => s.isRestTimerRunning);

  if (!state.isResting || !isTimerRunning) return null;

  // Show a simple indicator — the actual timer is the global RestTimer
  // (expanded or collapsed bubble). This just tells the user what's happening.
  const total = state.plan.plannedSets ?? 5;
  const doneSets = state.completedSets.length;

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <p className="text-sm text-[#B0B0B0]">Отдых между подходами</p>
      <p className="text-xs text-[#707070]">
        Выполнено подходов: {doneSets} из {total}
      </p>
      <p className="text-xs text-[#555555]">
        Нажмите на таймер, чтобы развернуть/свернуть
      </p>
    </div>
  );
}

// ---- Day 1: Max Reps ----

function Day1Max({
  stateRef,
  onUpdate,
  onComplete,
  onStartRest,
}: {
  stateRef: React.MutableRefObject<PullupInProgressState>;
  onUpdate: (updates: Partial<PullupInProgressState>) => void;
  onComplete: (sets: PullupInProgressState['completedSets']) => void;
  onStartRest: (seconds: number) => void;
}) {
  const state = stateRef.current;
  const TOTAL_SETS = state.plan.plannedSets ?? 5;
  const sets = state.completedSets;
  const currentSet = sets.length + 1;
  const isTimerRunning = useWorkoutStore((s) => s.isRestTimerRunning);

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
      onStartRest(restSec);
    }

    if (inputRef.current) inputRef.current.value = '';
  }, [stateRef, onUpdate, onComplete, onStartRest]);

  // Show resting indicator when timer is running
  if (state.isResting && isTimerRunning) {
    return <RestingIndicator state={state} />;
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
  onStartRest,
}: {
  stateRef: React.MutableRefObject<PullupInProgressState>;
  onUpdate: (updates: Partial<PullupInProgressState>) => void;
  onComplete: (sets: PullupInProgressState['completedSets']) => void;
  onStartRest: (seconds: number) => void;
}) {
  const state = stateRef.current;
  const sets = state.completedSets;
  const currentStep = state.currentSetIndex || 1;
  const failed = state.ladderFailed;
  const finalSet = state.ladderFinalSet;
  const isTimerRunning = useWorkoutStore((s) => s.isRestTimerRunning);

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
    onStartRest(restSec);
  }, [stateRef, onUpdate, onStartRest]);

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
    onStartRest(restSec);

    if (inputRef.current) inputRef.current.value = '';
  }, [stateRef, onUpdate, onStartRest]);

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

  // Show resting indicator when timer is running
  if (state.isResting && isTimerRunning) {
    return <RestingIndicator state={state} />;
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
  onStartRest,
}: {
  stateRef: React.MutableRefObject<PullupInProgressState>;
  onUpdate: (updates: Partial<PullupInProgressState>) => void;
  onComplete: (sets: PullupInProgressState['completedSets']) => void;
  onStartRest: (seconds: number) => void;
}) {
  const state = stateRef.current;
  const totalSets = state.plan.plannedSets ?? 9;
  const grips = state.plan.grips ?? DAY3_GRIPS_DEFAULT;
  const target = state.plan.targetReps ?? 4;

  const sets = state.completedSets;
  // FIX: use completedSets.length as current set index for display
  // currentSetIndex is now always synced with completedSets.length
  const currentSet = state.currentSetIndex;
  const currentGrip = grips[currentSet] ?? 'normal';
  const isTimerRunning = useWorkoutStore((s) => s.isRestTimerRunning);

  const handleSuccess = useCallback(() => {
    const s = stateRef.current;
    const idx = s.currentSetIndex;
    const g = (s.plan.grips ?? DAY3_GRIPS_DEFAULT)[idx] ?? 'normal';
    const t = s.plan.targetReps ?? 4;
    const total = s.plan.plannedSets ?? 9;

    // FIX: guard against duplicate — if completedSets already has this index, skip
    if (s.completedSets.length > idx) return;

    const result = {
      setNumber: idx + 1,
      reps: t,
      grip: g,
      targetReps: t,
      succeeded: true,
    };

    const newSets = [...s.completedSets, result];

    if (newSets.length >= total) {
      // All sets done — complete immediately, no rest needed
      onComplete(newSets);
    } else {
      // FIX: advance currentSetIndex immediately along with recording the set
      const restSec = s.plan.restSeconds ?? 60;
      onUpdate({
        completedSets: newSets,
        currentSetIndex: idx + 1,
        isResting: true,
        restSecondsLeft: restSec,
        restSecondsTotal: restSec,
      });
      onStartRest(restSec);
    }
  }, [stateRef, onUpdate, onComplete, onStartRest]);

  const handleFail = useCallback(() => {
    const s = stateRef.current;
    const idx = s.currentSetIndex;
    const g = (s.plan.grips ?? DAY3_GRIPS_DEFAULT)[idx] ?? 'normal';
    const t = s.plan.targetReps ?? 4;
    const total = s.plan.plannedSets ?? 9;

    // FIX: guard against duplicate — if completedSets already has this index, skip
    if (s.completedSets.length > idx) return;

    const result = {
      setNumber: idx + 1,
      reps: 0,
      grip: g,
      targetReps: t,
      succeeded: false,
    };

    const newSets = [...s.completedSets, result];

    if (newSets.length >= total) {
      // All sets done — complete immediately, no rest needed
      onComplete(newSets);
    } else {
      // FIX: advance currentSetIndex immediately along with recording the set
      const restSec = s.plan.restSeconds ?? 60;
      onUpdate({
        completedSets: newSets,
        currentSetIndex: idx + 1,
        isResting: true,
        restSecondsLeft: restSec,
        restSecondsTotal: restSec,
      });
      onStartRest(restSec);
    }
  }, [stateRef, onUpdate, onComplete, onStartRest]);

  // Show resting indicator when timer is running
  if (state.isResting && isTimerRunning) {
    return <RestingIndicator state={state} />;
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
  const startRestTimerWithDuration = useWorkoutStore((s) => s.startRestTimerWithDuration);
  const setOnRestTimerFinish = useWorkoutStore((s) => s.setOnRestTimerFinish);

  // Keep a ref to the latest state so child callbacks don't need state as dependency
  const stateRef = useRef<PullupInProgressState | null>(pullupInProgress);
  stateRef.current = pullupInProgress;

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

  // Register the rest timer finish callback for pullup rest transitions
  useEffect(() => {
    if (!pullupInProgress?.isResting) {
      // No rest in progress — clear callback
      return;
    }

    const handleRestFinish = () => {
      const s = stateRef.current;
      if (!s || !s.isResting) return;

      if (s.plan.effectiveDay === 2 && !s.ladderFinalSet) {
        // Ladder: advance to next step
        updatePullupInProgress({
          isResting: false,
          restSecondsLeft: 0,
          restSecondsTotal: 0,
          currentSetIndex: (s.currentSetIndex || 1) + 1,
        });
      } else if (s.plan.effectiveDay === 2 && s.ladderFinalSet) {
        // Ladder: after failure rest, show final max set
        updatePullupInProgress({
          isResting: false,
          restSecondsLeft: 0,
          restSecondsTotal: 0,
        });
      } else if (s.plan.effectiveDay === 3 || s.plan.effectiveDay === 4) {
        // FIX: Days 3/4 — currentSetIndex was already advanced in handleSuccess/handleFail.
        // Just clear the resting flag.
        updatePullupInProgress({
          isResting: false,
          restSecondsLeft: 0,
          restSecondsTotal: 0,
        });
      } else {
        // Day 1: just clear rest
        updatePullupInProgress({
          isResting: false,
          restSecondsLeft: 0,
          restSecondsTotal: 0,
        });
      }
    };

    setOnRestTimerFinish(handleRestFinish);

    return () => {
      // Cleanup: only clear if our callback is still the active one
      setOnRestTimerFinish(null);
    };
  }, [pullupInProgress?.isResting, pullupInProgress?.plan.effectiveDay, pullupInProgress?.ladderFinalSet, updatePullupInProgress, setOnRestTimerFinish]);

  // FIX: Watch for rest timer being dismissed early (user tapped "Закрыть" on RestTimer).
  // When isRestTimerRunning goes false while pullupInProgress.isResting is still true,
  // we need to clear isResting so the next set becomes actionable.
  const isTimerRunning = useWorkoutStore((s) => s.isRestTimerRunning);
  const prevTimerRunning = useRef(isTimerRunning);

  useEffect(() => {
    const wasRunning = prevTimerRunning.current;
    prevTimerRunning.current = isTimerRunning;

    // Timer was running, now it's not, but pullup thinks we're still resting
    if (wasRunning && !isTimerRunning && pullupInProgress?.isResting) {
      // For Day 2 (ladder), we still need to advance currentSetIndex on rest end
      if (pullupInProgress.plan.effectiveDay === 2 && !pullupInProgress.ladderFinalSet) {
        updatePullupInProgress({
          isResting: false,
          restSecondsLeft: 0,
          restSecondsTotal: 0,
          currentSetIndex: (pullupInProgress.currentSetIndex || 1) + 1,
        });
      } else {
        // Days 1, 3, 4 (and ladder finalSet): just clear rest flag
        // For days 3/4 currentSetIndex was already advanced
        updatePullupInProgress({
          isResting: false,
          restSecondsLeft: 0,
          restSecondsTotal: 0,
        });
      }
    }
  }, [isTimerRunning, pullupInProgress?.isResting, pullupInProgress?.plan.effectiveDay, pullupInProgress?.ladderFinalSet, pullupInProgress?.currentSetIndex, updatePullupInProgress]);

  // Stable callbacks that read from stateRef
  const handleUpdate = useCallback(
    (updates: Partial<PullupInProgressState>) => {
      updatePullupInProgress(updates);
    },
    [updatePullupInProgress]
  );

  const handleStartRest = useCallback(
    (seconds: number) => {
      startRestTimerWithDuration(seconds);
    },
    [startRestTimerWithDuration]
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

      // Clear rest timer callback
      setOnRestTimerFinish(null);
      setPullupInProgress(null);
      onNext(result);
    },
    [setPullupInProgress, setOnRestTimerFinish, onNext]
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

    setOnRestTimerFinish(null);
    setPullupInProgress(null);
    onNext(result);
  }, [setPullupInProgress, setOnRestTimerFinish, onNext]);

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
          onStartRest={handleStartRest}
        />
      )}
      {plan.effectiveDay === 2 && (
        <Day2Ladder
          stateRef={stateRef as React.MutableRefObject<PullupInProgressState>}
          onUpdate={handleUpdate}
          onComplete={handleComplete}
          onStartRest={handleStartRest}
        />
      )}
      {(plan.effectiveDay === 3 || plan.effectiveDay === 4) && (
        <Day34Grips
          stateRef={stateRef as React.MutableRefObject<PullupInProgressState>}
          onUpdate={handleUpdate}
          onComplete={handleComplete}
          onStartRest={handleStartRest}
        />
      )}
    </div>
  );
}
