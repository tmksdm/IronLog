// src/components/finish/CardioStep.tsx

/**
 * Step 1 of FinishWorkoutModal.
 * Cardio input: jump rope (countdown timer + count) or treadmill 3km (mm:ss).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWorkoutStore } from '../../stores/workoutStore';
import { Play, Square, Timer } from 'lucide-react';

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

  const initialMin = treadmillSeconds ? Math.floor(treadmillSeconds / 60) : 0;
  const initialSec = treadmillSeconds ? treadmillSeconds % 60 : 0;

  const [minutes, setMinutes] = useState<number>(initialMin);
  const [seconds, setSeconds] = useState<number>(initialSec);

  const totalSeconds = minutes * 60 + seconds;

  const handleSave = () => {
    saveTreadmill(totalSeconds);
    onNext();
  };

  return (
    <div className="flex flex-col items-center gap-5 px-4">
      <h3 className="text-lg font-semibold text-white">Бег 3 км</h3>
      <p className="text-sm text-[#B0B0B0] text-center">
        Введите время прохождения дистанции
      </p>

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