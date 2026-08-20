import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';

const DURATION_SECONDS = 75;

interface JumpRopeCoreProps {
  onSave: (count: number) => void | Promise<void>;
}

export default function JumpRopeCore({ onSave }: JumpRopeCoreProps) {
  const [count, setCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(DURATION_SECONDS);
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
    setSecondsLeft(DURATION_SECONDS);
    setHasFinished(false);
    setIsRunning(true);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft((previous) => {
        if (previous <= 1) {
          stopTimer();
          setHasFinished(true);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return stopTimer;
  }, [isRunning, stopTimer]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const ringSize = 240;
  const ringStroke = 12;
  const radius = (ringSize - ringStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - secondsLeft / DURATION_SECONDS);

  return (
    <div className="flex flex-col items-center gap-5 px-4 pt-4">
      <h2 className="text-lg font-semibold text-white">Скакалка</h2>
      <p className="text-sm text-[#B0B0B0] text-center">
        1 минута 15 секунд — посчитайте количество прыжков
      </p>

      <div className="relative flex items-center justify-center">
        <svg width={ringSize} height={ringSize} className="-rotate-90" aria-hidden="true">
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="#333333"
            strokeWidth={ringStroke}
          />
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke={hasFinished ? '#4CAF50' : '#FF9800'}
            strokeWidth={ringStroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-1000 linear"
          />
        </svg>
        <div className="absolute flex flex-col items-center" aria-live="polite">
          <span className="text-7xl font-bold text-white font-mono">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
          {hasFinished && (
            <span className="text-base text-[#4CAF50] mt-2 font-semibold">Готово!</span>
          )}
        </div>
      </div>

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

      <label className="flex flex-col items-center gap-2 mt-2">
        <span className="text-sm text-[#B0B0B0]">Количество прыжков</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={count || ''}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            setCount(Number.isNaN(value) ? 0 : Math.max(0, value));
          }}
          onFocus={(event) => event.target.select()}
          placeholder="0"
          className="w-28 h-14 text-center text-2xl font-bold text-white bg-[#1E1E1E] border border-[#333333] rounded-xl outline-none focus:border-[#FF9800] placeholder:text-[#555555]"
        />
      </label>

      <button
        onClick={() => onSave(count)}
        disabled={count <= 0}
        className="w-full mt-4 py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors disabled:opacity-40 disabled:active:bg-[#4CAF50]"
      >
        Сохранить
      </button>
    </div>
  );
}
