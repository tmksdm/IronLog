// src/components/finish/CardioStep.tsx

/**
 * Step 1 of FinishWorkoutModal.
 * Cardio input: jump rope (countdown timer + count) or treadmill 3km (mm:ss).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWorkoutStore } from '../../stores/workoutStore';
import { ChevronUp, ChevronDown, Play, Square, Timer } from 'lucide-react';

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

      {/* Jump count input */}
      <div className="flex flex-col items-center gap-2 mt-2">
        <span className="text-sm text-[#B0B0B0]">Количество прыжков</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCount((c) => Math.max(0, c - 10))}
            className="w-12 h-12 rounded-xl bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
          >
            <ChevronDown size={24} className="text-[#B0B0B0]" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            value={count || ''}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setCount(isNaN(val) ? 0 : Math.max(0, val));
            }}
            placeholder="0"
            className="w-24 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#FF9800] placeholder:text-[#555555]"
          />
          <button
            onClick={() => setCount((c) => c + 10)}
            className="w-12 h-12 rounded-xl bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
          >
            <ChevronUp size={24} className="text-[#B0B0B0]" />
          </button>
        </div>
        <span className="text-xs text-[#707070]">кнопки ±10</span>
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

  const adjustMinutes = (delta: number) => {
    setMinutes((m) => Math.max(0, Math.min(59, m + delta)));
  };

  const adjustSeconds = (delta: number) => {
    setSeconds((s) => {
      const next = s + delta;
      if (next < 0) return 55;
      if (next >= 60) return 0;
      return next;
    });
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

      {/* Time input: MM : SS */}
      <div className="flex items-center gap-2">
        {/* Minutes */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => adjustMinutes(1)}
            className="w-14 h-10 rounded-lg bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
          >
            <ChevronUp size={22} className="text-[#B0B0B0]" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            value={minutes.toString().padStart(2, '0')}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setMinutes(isNaN(val) ? 0 : Math.max(0, Math.min(59, val)));
            }}
            className="w-16 h-16 text-center text-3xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#2196F3]"
          />
          <button
            onClick={() => adjustMinutes(-1)}
            className="w-14 h-10 rounded-lg bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
          >
            <ChevronDown size={22} className="text-[#B0B0B0]" />
          </button>
          <span className="text-xs text-[#707070] mt-0.5">мин</span>
        </div>

        <span className="text-3xl font-bold text-[#707070] mb-8">:</span>

        {/* Seconds */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => adjustSeconds(5)}
            className="w-14 h-10 rounded-lg bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
          >
            <ChevronUp size={22} className="text-[#B0B0B0]" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            value={seconds.toString().padStart(2, '0')}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setSeconds(isNaN(val) ? 0 : Math.max(0, Math.min(59, val)));
            }}
            className="w-16 h-16 text-center text-3xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#2196F3]"
          />
          <button
            onClick={() => adjustSeconds(-5)}
            className="w-14 h-10 rounded-lg bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
          >
            <ChevronDown size={22} className="text-[#B0B0B0]" />
          </button>
          <span className="text-xs text-[#707070] mt-0.5">сек (±5)</span>
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
