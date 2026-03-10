// src/components/settings/GymCostCalculator.tsx

/**
 * Gym membership cost calculator.
 * Calculates cost per workout based on subscription price, duration, and planned frequency.
 * Persists values in localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { Calculator, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '../ui';
import { workoutRepo } from '../../db';
import { formatDecimal } from '../../utils/format';

// localStorage key
const STORAGE_KEY = 'ironlog_gym_cost';

interface GymCostData {
  price: number;       // Total subscription price (rubles)
  months: number;      // Subscription duration (months)
  perWeek: number;     // Planned workouts per week
}

const DEFAULTS: GymCostData = {
  price: 18000,
  months: 6,
  perWeek: 4,
};

function loadData(): GymCostData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      price: typeof parsed.price === 'number' && parsed.price > 0 ? parsed.price : DEFAULTS.price,
      months: typeof parsed.months === 'number' && parsed.months > 0 ? parsed.months : DEFAULTS.months,
      perWeek: typeof parsed.perWeek === 'number' && parsed.perWeek > 0 ? parsed.perWeek : DEFAULTS.perWeek,
    };
  } catch {
    return DEFAULTS;
  }
}

function saveData(data: GymCostData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Compact inline stepper for integer/number input — simpler than NumberStepper.
 * Tailored for the calculator card layout.
 */
function MiniStepper({
  value,
  onChange,
  min = 1,
  max = 999999,
  step = 1,
  label,
  unit,
  inputMode = 'numeric',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  unit?: string;
  inputMode?: 'numeric' | 'decimal';
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const decrease = () => onChange(Math.max(min, value - step));
  const increase = () => onChange(Math.min(max, value + step));

  const startEdit = () => {
    setEditText(value.toString());
    setIsEditing(true);
  };

  const commitEdit = () => {
    setIsEditing(false);
    const parsed = parseFloat(editText.replace(',', '.').trim());
    if (isNaN(parsed)) return;
    const snapped = Math.round(parsed / step) * step;
    const rounded = Math.round(snapped * 100) / 100;
    onChange(Math.min(max, Math.max(min, rounded)));
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#B0B0B0] shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={decrease}
          disabled={value <= min}
          className="w-8 h-8 rounded-full bg-[#333] active:bg-[#444] flex items-center
                     justify-center text-white text-lg disabled:opacity-30 select-none"
        >
          −
        </button>

        {isEditing ? (
          <input
            autoFocus
            type="text"
            inputMode={inputMode}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
            className="w-20 text-center text-white font-bold text-base bg-[#333]
                       rounded-lg outline-none ring-2 ring-green-600 py-1"
          />
        ) : (
          <button
            onClick={startEdit}
            className="min-w-[80px] text-center text-white font-bold text-base
                       rounded-lg py-1 active:bg-[#333] transition-colors"
          >
            {value.toLocaleString('ru-RU')}
            {unit && <span className="text-xs text-[#707070] ml-1">{unit}</span>}
          </button>
        )}

        <button
          onClick={increase}
          disabled={value >= max}
          className="w-8 h-8 rounded-full bg-[#333] active:bg-[#444] flex items-center
                     justify-center text-white text-lg disabled:opacity-30 select-none"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function GymCostCalculator() {
  const [data, setData] = useState<GymCostData>(loadData);
  const [actualCount, setActualCount] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Save to localStorage on every change
  useEffect(() => {
    saveData(data);
  }, [data]);

  // Count actual workouts in the subscription period
  const loadActualCount = useCallback(async () => {
    try {
      // Subscription end = today, subscription start = today minus N months
      const now = new Date();
      const start = new Date(now);
      start.setMonth(start.getMonth() - data.months);
      const count = await workoutRepo.countSessionsInRange(
        start.toISOString(),
        now.toISOString()
      );
      setActualCount(count);
    } catch {
      setActualCount(null);
    }
  }, [data.months]);

  useEffect(() => {
    if (isExpanded) {
      loadActualCount();
    }
  }, [isExpanded, loadActualCount]);

  // Calculations
  const totalWeeks = data.months * 4.33; // average weeks per month
  const plannedWorkouts = Math.round(totalWeeks * data.perWeek);
  const plannedCostPerWorkout = plannedWorkouts > 0 ? data.price / plannedWorkouts : 0;
  const actualCostPerWorkout =
    actualCount !== null && actualCount > 0 ? data.price / actualCount : null;

  // Is the user losing money? (actual cost > planned cost by >20%)
  const isOverpaying =
    actualCostPerWorkout !== null &&
    plannedCostPerWorkout > 0 &&
    actualCostPerWorkout > plannedCostPerWorkout * 1.2;

  const update = (field: keyof GymCostData, value: number) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      {/* Collapsed summary — always visible */}
      <Card
        onClick={() => setIsExpanded(!isExpanded)}
        className="!p-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-yellow-600/20">
            <Calculator size={20} className="text-yellow-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium">Стоимость абонемента</div>
            <div className="text-xs text-[#707070] mt-0.5">
              {formatDecimal(plannedCostPerWorkout, 0)} ₽ за тренировку по плану
            </div>
          </div>
          <div
            className={`text-right shrink-0 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" className="text-[#555]">
              <path
                d="M6 8l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </Card>

      {/* Expanded details */}
      {isExpanded && (
        <Card className="!p-5 mt-2 space-y-5">
          {/* Inputs */}
          <div className="space-y-4">
            <MiniStepper
              label="Цена"
              value={data.price}
              onChange={(v) => update('price', v)}
              min={1000}
              max={200000}
              step={1000}
              unit="₽"
            />
            <MiniStepper
              label="Срок"
              value={data.months}
              onChange={(v) => update('months', v)}
              min={1}
              max={24}
              step={1}
              unit="мес"
            />
            <MiniStepper
              label="Раз в неделю"
              value={data.perWeek}
              onChange={(v) => update('perWeek', v)}
              min={1}
              max={7}
              step={1}
            />
          </div>

          {/* Divider */}
          <div className="border-t border-[#333]" />

          {/* Planned result */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#B0B0B0]">По плану</span>
            <div className="text-right">
              <span className="text-lg font-bold text-green-500">
                {formatDecimal(plannedCostPerWorkout, 0)} ₽
              </span>
              <span className="text-xs text-[#707070] ml-2">
                / тренировка
              </span>
            </div>
          </div>

          {/* Planned sessions count */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#555]">Ожидаемое кол-во</span>
            <span className="text-xs text-[#707070]">
              ~{plannedWorkouts} тренировок за {data.months} мес
            </span>
          </div>

          {/* Actual result (if we have workout data) */}
          {actualCount !== null && (
            <>
              <div className="border-t border-[#333]" />

              <div className="flex items-center justify-between">
                <span className="text-sm text-[#B0B0B0]">Фактически</span>
                <div className="text-right flex items-center gap-2">
                  {actualCostPerWorkout !== null ? (
                    <>
                      {isOverpaying ? (
                        <TrendingUp size={16} className="text-red-400" />
                      ) : (
                        <TrendingDown size={16} className="text-green-400" />
                      )}
                      <span
                        className={`text-lg font-bold ${
                          isOverpaying ? 'text-red-400' : 'text-green-500'
                        }`}
                      >
                        {formatDecimal(actualCostPerWorkout, 0)} ₽
                      </span>
                      <span className="text-xs text-[#707070]">
                        / тренировка
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-[#555]">нет данных</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-[#555]">
                  За последние {data.months} мес
                </span>
                <span className="text-xs text-[#707070]">
                  {actualCount} тренировок
                </span>
              </div>

              {/* Motivational nudge if overpaying */}
              {isOverpaying && actualCostPerWorkout !== null && (
                <div className="bg-red-600/10 rounded-xl px-4 py-3 border border-red-600/20">
                  <p className="text-sm text-red-300">
                    Переплата{' '}
                    <span className="font-bold">
                      {formatDecimal(actualCostPerWorkout - plannedCostPerWorkout, 0)} ₽
                    </span>{' '}
                    за каждую тренировку. Не ленись!
                  </p>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
