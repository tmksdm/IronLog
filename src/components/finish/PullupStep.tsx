// src/components/finish/PullupStep.tsx

/**
 * Pull-up step in FinishWorkoutModal.
 * Shown between Cardio and Summary steps.
 * Handles all 5 pull-up day types with interactive set tracking and rest timers.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  loadPullupProgram,
  buildDayPlan,
  applyAndSaveDayResult,
  calculateTotalReps,
  getLadderRestTime,
  getGripName,
  getPullupDayName,
  type PullupProgramState,
  type PullupDayPlan,
  type PullupSetResult,
  type GripType,
} from '../../utils/pullupProgram';
import type { PullupStepResult } from '../../types';
import { Check, SkipForward, ChevronRight } from 'lucide-react';

interface PullupStepProps {
  /** Called when pull-ups are done (completed or skipped). Passes result to parent. */
  onNext: (result: PullupStepResult) => void;
  /** Called to go back to the previous step (cardio). Only works before starting. */
  onBack?: () => void;
}

// ---- Rest Timer Component ----

function RestTimer({
  seconds,
  onFinish,
}: {
  seconds: number;
  onFinish: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLeft(seconds);
    intervalRef.current = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [seconds, onFinish]);

  const min = Math.floor(left / 60);
  const sec = left % 60;

  // SVG ring
  const SIZE = 200;
  const STROKE = 10;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = left / seconds;
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
        onClick={onFinish}
        className="px-6 py-2.5 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] text-sm font-semibold active:bg-[#333333] transition-colors"
      >
        Пропустить отдых
      </button>
    </div>
  );
}

// ---- Day 1: Max Reps ----

function Day1Max({
  plan,
  onComplete,
}: {
  plan: PullupDayPlan;
  onComplete: (sets: PullupSetResult[]) => void;
}) {
  const TOTAL_SETS = plan.plannedSets ?? 5;
  const [sets, setSets] = useState<PullupSetResult[]>([]);
  const [currentSet, setCurrentSet] = useState(1);
  const [reps, setReps] = useState('');
  const [resting, setResting] = useState(false);

  const handleConfirm = () => {
    const val = parseInt(reps, 10);
    if (isNaN(val) || val < 0) return;

    const result: PullupSetResult = {
      setNumber: currentSet,
      reps: val,
      grip: null,
      targetReps: null,
      succeeded: true, // max effort — always "succeeded"
    };

    const newSets = [...sets, result];
    setSets(newSets);
    setReps('');

    if (currentSet >= TOTAL_SETS) {
      onComplete(newSets);
    } else {
      setResting(true);
    }
  };

  const handleRestFinish = useCallback(() => {
    setResting(false);
    setCurrentSet((prev) => prev + 1);
  }, []);

  if (resting) {
    return <RestTimer seconds={plan.restSeconds ?? 90} onFinish={handleRestFinish} />;
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

      {/* Reps input */}
      <input
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onFocus={(e) => e.target.select()}
        placeholder="0"
        className="w-28 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#FF9800] placeholder:text-[#555555]"
      />

      <button
        onClick={handleConfirm}
        disabled={!reps.trim()}
        className="w-full py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors disabled:opacity-40"
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
  onComplete,
}: {
  plan: PullupDayPlan;
  onComplete: (sets: PullupSetResult[]) => void;
}) {
  const [sets, setSets] = useState<PullupSetResult[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [failed, setFailed] = useState(false);
  const [finalSet, setFinalSet] = useState(false);
  const [reps, setReps] = useState('');
  const [resting, setResting] = useState(false);
  const [restTime, setRestTime] = useState(0);

  // After a successful step, rest = step × 10s, then move to next
  const handleStepSuccess = () => {
    const result: PullupSetResult = {
      setNumber: sets.length + 1,
      reps: currentStep,
      grip: null,
      targetReps: currentStep,
      succeeded: true,
    };

    const newSets = [...sets, result];
    setSets(newSets);
    setRestTime(getLadderRestTime(currentStep));
    setResting(true);
  };

  // Step failed — user enters actual reps
  const handleStepFail = () => {
    setFailed(true);
    setReps('');
  };

  // Confirm failure reps
  const handleFailConfirm = () => {
    const val = parseInt(reps, 10);
    if (isNaN(val) || val < 0) return;

    const result: PullupSetResult = {
      setNumber: sets.length + 1,
      reps: val,
      grip: null,
      targetReps: currentStep,
      succeeded: false,
    };

    const newSets = [...sets, result];
    setSets(newSets);

    // Rest = actual reps × 10s, then final max set
    setRestTime(getLadderRestTime(val));
    setFinalSet(true);
    setResting(true);
  };

  // Final max-effort set
  const handleFinalConfirm = () => {
    const val = parseInt(reps, 10);
    if (isNaN(val) || val < 0) return;

    const result: PullupSetResult = {
      setNumber: sets.length + 1,
      reps: val,
      grip: null,
      targetReps: null,
      succeeded: true,
    };

    onComplete([...sets, result]);
  };

  const handleRestFinish = useCallback(() => {
    setResting(false);
    if (finalSet) {
      // Ready for final max set
      setReps('');
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [finalSet]);

  if (resting) {
    return <RestTimer seconds={restTime} onFinish={handleRestFinish} />;
  }

  // Final max set
  if (finalSet && !resting) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-base text-[#FF9800] font-semibold">Финальный подход</p>
        <p className="text-sm text-[#B0B0B0]">Подтянитесь на максимум</p>

        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="0"
          className="w-28 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#FF9800] placeholder:text-[#555555]"
        />

        <button
          onClick={handleFinalConfirm}
          disabled={!reps.trim()}
          className="w-full py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors disabled:opacity-40"
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
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="0"
          className="w-28 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#F44336] placeholder:text-[#555555]"
        />

        <button
          onClick={handleFailConfirm}
          disabled={!reps.trim()}
          className="w-full py-3.5 rounded-xl bg-[#F44336] text-white font-semibold text-base active:bg-[#D32F2F] transition-colors disabled:opacity-40"
        >
          Записать и перейти к финальному подходу
        </button>
      </div>
    );
  }

  // Normal ladder step
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Previous steps history */}
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
  plan,
  onComplete,
}: {
  plan: PullupDayPlan;
  onComplete: (sets: PullupSetResult[]) => void;
}) {
  const totalSets = plan.plannedSets ?? 9;
  const grips = plan.grips ?? DAY3_GRIPS_DEFAULT;
  const target = plan.targetReps ?? 4;

  const [sets, setSets] = useState<PullupSetResult[]>([]);
  const [currentSet, setCurrentSet] = useState(0); // 0-based index
  const [resting, setResting] = useState(false);

  const currentGrip = grips[currentSet] ?? 'normal';

  const handleSuccess = () => {
    const result: PullupSetResult = {
      setNumber: currentSet + 1,
      reps: target,
      grip: currentGrip,
      targetReps: target,
      succeeded: true,
    };

    const newSets = [...sets, result];
    setSets(newSets);

    if (currentSet + 1 >= totalSets) {
      onComplete(newSets);
    } else {
      setResting(true);
    }
  };

  const handleFail = () => {
    const result: PullupSetResult = {
      setNumber: currentSet + 1,
      reps: 0,
      grip: currentGrip,
      targetReps: target,
      succeeded: false,
    };

    const newSets = [...sets, result];
    setSets(newSets);

    if (currentSet + 1 >= totalSets) {
      onComplete(newSets);
    } else {
      setResting(true);
    }
  };

  const handleRestFinish = useCallback(() => {
    setResting(false);
    setCurrentSet((prev) => prev + 1);
  }, []);

  if (resting) {
    return <RestTimer seconds={plan.restSeconds ?? 60} onFinish={handleRestFinish} />;
  }

  // Group indicator — which grip block we're in
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
          let color = 'bg-[#333333]'; // pending
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

      {/* Current set */}
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

// Fallback grip list for safety
const DAY3_GRIPS_DEFAULT: GripType[] = [
  'normal', 'normal', 'normal',
  'reverse', 'reverse', 'reverse',
  'wide', 'wide', 'wide',
];

// ---- Main PullupStep Component ----

export default function PullupStep({ onNext, onBack }: PullupStepProps) {
  const [programState] = useState<PullupProgramState>(() => loadPullupProgram());
  const plan = useMemo(() => buildDayPlan(programState), [programState]);
  const [started, setStarted] = useState(false);

  const handleComplete = (sets: PullupSetResult[]) => {
    const totalReps = calculateTotalReps(sets);

    const result: PullupStepResult = {
      dayNumber: plan.dayNumber,
      effectiveDay: plan.effectiveDay,
      day5ActualDay: plan.day5ActualDay,
      sets,
      totalReps,
      skipped: false,
    };

    // Apply progression/regression
    applyAndSaveDayResult({
      dayNumber: plan.dayNumber,
      day5ActualDay: plan.day5ActualDay,
      sets,
      totalReps,
      skipped: false,
    });

    onNext(result);
  };

  const handleSkip = () => {
    const result: PullupStepResult = {
      dayNumber: plan.dayNumber,
      effectiveDay: plan.effectiveDay,
      day5ActualDay: plan.day5ActualDay,
      sets: [],
      totalReps: 0,
      skipped: true,
    };

    // Do NOT apply progression — day stays the same
    // (applyDayResult with skipped=true won't advance)
    applyAndSaveDayResult({
      dayNumber: plan.dayNumber,
      day5ActualDay: plan.day5ActualDay,
      sets: [],
      totalReps: 0,
      skipped: true,
    });

    onNext(result);
  };

  // Intro screen — show what day it is, let user start or skip
  if (!started) {
    return (
      <div className="flex flex-col items-center gap-5 px-4">
        <h3 className="text-lg font-semibold text-white">Подтягивания</h3>

        <div className="w-full bg-[#252525] rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#B0B0B0]">День</span>
            <span className="text-sm text-white font-semibold">
              {plan.dayNumber} из 5
            </span>
          </div>
          <p className="text-base text-[#FF9800] font-semibold">
            {getPullupDayName(plan.dayNumber, plan.day5ActualDay ?? undefined)}
          </p>
          <p className="text-sm text-[#B0B0B0]">{plan.description}</p>
        </div>

        {onBack && (
          <button
            onClick={onBack}
            className="w-full py-3 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] font-semibold text-sm active:bg-[#333333] transition-colors mt-2"
          >
            ← Назад к кардио
          </button>
        )}

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
            onClick={() => setStarted(true)}
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
  return (
    <div className="flex flex-col items-center gap-4 px-4">
      <h3 className="text-lg font-semibold text-white">
        {getPullupDayName(plan.dayNumber, plan.day5ActualDay ?? undefined)}
      </h3>

      {plan.effectiveDay === 1 && (
        <Day1Max plan={plan} onComplete={handleComplete} />
      )}
      {plan.effectiveDay === 2 && (
        <Day2Ladder plan={plan} onComplete={handleComplete} />
      )}
      {(plan.effectiveDay === 3 || plan.effectiveDay === 4) && (
        <Day34Grips plan={plan} onComplete={handleComplete} />
      )}
    </div>
  );
}
