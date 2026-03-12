// src/components/finish/CardioStep.tsx

/**
 * Step 1 of FinishWorkoutModal.
 * Cardio input: jump rope (countdown timer + count) or treadmill 3km (time + run program).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWorkoutStore } from '../../stores/workoutStore';
import {
  loadRunningProgram,
  initRunningProgram,
  applyRunResult,
  formatRunPlan,
  type RunningProgramState,
} from '../../utils/runningProgram';
import { Play, Square, Timer, Check, X, Settings2 } from 'lucide-react';

interface CardioStepProps {
  onNext: () => void;
}

// ---- Jump Rope Input ----

function JumpRopeInput({ onNext }: { onNext: () => void }) {
  const saveJumpRope = useWorkoutStore((s) => s.saveJumpRope);
  const jumpRopeCount = useWorkoutStore((s) => s.jumpRopeCount);
  const [count, setCount] = useState<number>(jumpRopeCount ?? 0);

  // Countdown timer: 1 min 15 sec = 75 seconds
  const DURATION = 75;
  const [secondsLeft, setSecondsLeft] = useState(DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const startTimer = useCallback(() => {
    if (isRunning) return;
    setSecondsLeft(DURATION);
    setHasFinished(false);
    setIsRunning(true);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          stopTimer();
          setHasFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, stopTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSave = () => {
    saveJumpRope(count);
    onNext();
  };

  // SVG ring for countdown
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const progress = secondsLeft / DURATION;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-5 px-4">
      <h3 className="text-lg font-semibold text-white">Скакалка</h3>
      <p className="text-sm text-[#B0B0B0] text-center">
        1 минута 15 секунд — посчитайте количество прыжков
      </p>

      {/* Countdown timer ring */}
      <div className="relative flex items-center justify-center">
        <svg width="170" height="170" className="-rotate-90">
          <circle
            cx="85" cy="85" r={radius}
            fill="none"
            stroke="#333333"
            strokeWidth="6"
          />
          <circle
            cx="85" cy="85" r={radius}
            fill="none"
            stroke={hasFinished ? '#4CAF50' : '#FF9800'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-4xl font-bold text-white font-mono">
            {formatTime(secondsLeft)}
          </span>
          {hasFinished && (
            <span className="text-sm text-[#4CAF50] mt-1">Готово!</span>
          )}
        </div>
      </div>

      {/* Timer controls */}
      <div className="flex gap-4">
        {!isRunning ? (
          <button
            onClick={startTimer}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FF9800] text-white font-semibold text-base active:scale-95 transition-transform"
          >
            <Play size={20} />
            {hasFinished ? 'Заново' : 'Старт'}
          </button>
        ) : (
          <button
            onClick={stopTimer}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#F44336] text-white font-semibold text-base active:scale-95 transition-transform"
          >
            <Square size={20} />
            Стоп
          </button>
        )}
      </div>

      {/* Jump count input — just the number field, no +/- buttons */}
      <div className="flex flex-col items-center gap-2 mt-2">
        <span className="text-sm text-[#B0B0B0]">Количество прыжков</span>
        <input
          type="number"
          inputMode="numeric"
          value={count || ''}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setCount(isNaN(val) ? 0 : Math.max(0, val));
          }}
          onFocus={(e) => e.target.select()}
          placeholder="0"
          className="w-28 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#FF9800] placeholder:text-[#555555]"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 w-full mt-4">
        <button
          onClick={onNext}
          className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] font-semibold text-base active:bg-[#333333] transition-colors"
        >
          Пропустить
        </button>
        <button
          onClick={handleSave}
          disabled={count <= 0}
          className="flex-1 py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors disabled:opacity-40 disabled:active:bg-[#4CAF50]"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

// ---- Treadmill Input ----

function TreadmillInput({ onNext }: { onNext: () => void }) {
  const saveTreadmill = useWorkoutStore((s) => s.saveTreadmill);
  const treadmillSeconds = useWorkoutStore((s) => s.treadmillSeconds);
  const treadmillSucceeded = useWorkoutStore((s) => s.treadmillSucceeded);

  const initialMin = treadmillSeconds ? Math.floor(treadmillSeconds / 60) : 0;
  const initialSec = treadmillSeconds ? treadmillSeconds % 60 : 0;

  const [minutes, setMinutes] = useState<number>(initialMin);
  const [seconds, setSeconds] = useState<number>(initialSec);
  const [succeeded, setSucceeded] = useState<boolean | null>(treadmillSucceeded ?? null);
  const [programState, setProgramState] = useState<RunningProgramState | null>(
    loadRunningProgram
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editSpeed, setEditSpeed] = useState('');

  const totalSeconds = minutes * 60 + seconds;

  // Handle result toggle
  const handleSucceeded = (value: boolean) => {
    setSucceeded(value);
  };

  const handleSave = () => {
    // Apply run result to program if we have a program and a result
    if (programState && succeeded !== null) {
      const newState = applyRunResult(succeeded);
      if (newState) {
        setProgramState(newState);
      }
    }
    saveTreadmill(totalSeconds, succeeded);
    onNext();
  };

  // Initialize program with a starting speed
  const handleInitProgram = () => {
    const speed = parseFloat(editSpeed.replace(',', '.'));
    if (isNaN(speed) || speed <= 0) return;
    const state = initRunningProgram(speed);
    setProgramState(state);
    setIsEditing(false);
    setEditSpeed('');
  };

  // Edit current program speed
  const handleStartEdit = () => {
    if (programState) {
      setEditSpeed(programState.mainSpeed.toString());
    }
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const speed = parseFloat(editSpeed.replace(',', '.'));
    if (isNaN(speed) || speed <= 0) return;
    if (programState) {
      // Reset to uniform at the new speed
      const newState: RunningProgramState = {
        mainSpeed: speed,
        endSpeed: null,
        endSegments: 0,
      };
      import('../../utils/runningProgram').then(({ saveRunningProgram }) => {
        saveRunningProgram(newState);
      });
      setProgramState(newState);
    } else {
      const state = initRunningProgram(speed);
      setProgramState(state);
    }
    setIsEditing(false);
    setEditSpeed('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditSpeed('');
  };

  return (
    <div className="flex flex-col items-center gap-5 px-4">
      <h3 className="text-lg font-semibold text-white">Бег 3 км</h3>

      {/* Run program plan */}
      {programState && !isEditing && (
        <div className="w-full bg-[#252525] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#B0B0B0]">План пробежки</span>
            <button
              onClick={handleStartEdit}
              className="w-8 h-8 rounded-lg bg-[#333333] flex items-center justify-center active:bg-[#444444] transition-colors"
            >
              <Settings2 size={16} className="text-[#B0B0B0]" />
            </button>
          </div>
          <p className="text-base text-white font-semibold">
            {formatRunPlan(programState)}
          </p>
        </div>
      )}

      {/* Setup / Edit program */}
      {(!programState || isEditing) && (
        <div className="w-full bg-[#252525] rounded-xl p-4">
          <p className="text-sm text-[#B0B0B0] mb-3 text-center">
            {programState ? 'Сбросить программу бега' : 'Настройка программы бега'}
          </p>
          <p className="text-xs text-[#707070] mb-3 text-center">
            {programState
              ? 'Введите новую базовую скорость (вся дистанция будет на ней)'
              : 'Введите начальную скорость (км/ч)'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={editSpeed}
                onChange={(e) => setEditSpeed(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="12"
                className="w-24 h-12 text-center text-xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#2196F3] placeholder:text-[#555555]"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#707070]">
                км/ч
              </span>
            </div>
            <button
              onClick={programState ? handleSaveEdit : handleInitProgram}
              disabled={!editSpeed.trim()}
              className="h-12 px-4 rounded-xl bg-[#2196F3] text-white font-semibold text-sm active:bg-[#1976D2] transition-colors disabled:opacity-40"
            >
              OK
            </button>
            {isEditing && (
              <button
                onClick={handleCancelEdit}
                className="h-12 px-3 rounded-xl bg-[#333333] text-[#B0B0B0] font-semibold text-sm active:bg-[#444444] transition-colors"
              >
                Отмена
              </button>
            )}
          </div>
        </div>
      )}

      {/* Timer icon */}
      <div className="w-16 h-16 rounded-full bg-[#2A2A2A] flex items-center justify-center">
        <Timer size={32} className="text-[#2196F3]" />
      </div>

      {/* Time input: MM : SS — just number fields, no arrows */}
      <div className="flex items-center gap-3">
        {/* Minutes */}
        <div className="flex flex-col items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            onFocus={(e) => e.target.select()}
            value={minutes.toString().padStart(2, '0')}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setMinutes(isNaN(val) ? 0 : Math.max(0, Math.min(59, val)));
            }}
            className="w-20 h-16 text-center text-3xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#2196F3]"
          />
          <span className="text-xs text-[#707070]">мин</span>
        </div>

        <span className="text-3xl font-bold text-[#707070] mb-5">:</span>

        {/* Seconds */}
        <div className="flex flex-col items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            onFocus={(e) => e.target.select()}
            value={seconds.toString().padStart(2, '0')}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setSeconds(isNaN(val) ? 0 : Math.max(0, Math.min(59, val)));
            }}
            className="w-20 h-16 text-center text-3xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#2196F3]"
          />
          <span className="text-xs text-[#707070]">сек</span>
        </div>
      </div>

      {/* Result buttons: succeeded / failed */}
      {programState && (
        <div className="w-full">
          <p className="text-sm text-[#B0B0B0] text-center mb-3">
            Удалось выполнить план?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleSucceeded(true)}
              className={`flex-1 py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.98] ${
                succeeded === true
                  ? 'bg-[#4CAF50] text-white'
                  : 'bg-[#2A2A2A] text-[#B0B0B0] active:bg-[#333333]'
              }`}
            >
              <Check size={20} />
              Да
            </button>
            <button
              onClick={() => handleSucceeded(false)}
              className={`flex-1 py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.98] ${
                succeeded === false
                  ? 'bg-[#F44336] text-white'
                  : 'bg-[#2A2A2A] text-[#B0B0B0] active:bg-[#333333]'
              }`}
            >
              <X size={20} />
              Нет
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 w-full mt-4">
        <button
          onClick={onNext}
          className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-[#B0B0B0] font-semibold text-base active:bg-[#333333] transition-colors"
        >
          Пропустить
        </button>
        <button
          onClick={handleSave}
          disabled={totalSeconds <= 0}
          className="flex-1 py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors disabled:opacity-40 disabled:active:bg-[#4CAF50]"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

// ---- Main CardioStep ----

export default function CardioStep({ onNext }: CardioStepProps) {
  const cardioType = useWorkoutStore((s) => s.cardioType);

  if (cardioType === 'jump_rope') {
    return <JumpRopeInput onNext={onNext} />;
  }

  return <TreadmillInput onNext={onNext} />;
}