// src/components/settings/GymCostCalculator.tsx

/**
 * Gym membership cost calculator.
 * Calculates planned vs projected cost per workout based on subscription
 * price, duration, start date, and planned frequency.
 * Persists values in localStorage.
 *
 * Logic:
 * - Planned cost = price / (months × 4.33 × perWeek)
 * - Projected cost = based on actual training pace extrapolated to full period.
 *   If user did N workouts in D elapsed days, projected total = N / D × totalDays.
 *   Projected cost per workout = price / projectedTotal.
 */

import { useState, useEffect, useCallback } from 'react';
import { Calculator, TrendingDown, TrendingUp, CalendarDays } from 'lucide-react';
import { Card } from '../ui';
import { workoutRepo } from '../../db';
import { formatDecimal } from '../../utils/format';

// localStorage key
const STORAGE_KEY = 'ironlog_gym_cost';

interface GymCostData {
  price: number;       // Total subscription price (rubles)
  months: number;      // Subscription duration (months)
  perWeek: number;     // Planned workouts per week
  startDate: string;   // Subscription start date (YYYY-MM-DD)
}

/** Default start date = first day of current month */
function defaultStartDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}-01`;
}

const DEFAULTS: GymCostData = {
  price: 18000,
  months: 6,
  perWeek: 4,
  startDate: defaultStartDate(),
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
      startDate: typeof parsed.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)
        ? parsed.startDate
        : DEFAULTS.startDate,
    };
  } catch {
    return DEFAULTS;
  }
}

function saveData(data: GymCostData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Format YYYY-MM-DD to "15.03.2026" */
function fmtDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

/** Add N months to a YYYY-MM-DD string, return Date */
function addMonths(isoDate: string, months: number): Date {
  const d = new Date(isoDate + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Days between two dates (can be negative) */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((b.getTime() - a.getTime()) / msPerDay);
}

/** Format Date to YYYY-MM-DD */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Compact inline stepper for integer/number input.
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

/**
 * Date picker row — tap to open native date input.
 */
function DatePickerRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#B0B0B0] shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <CalendarDays size={16} className="text-[#555]" />
        <input
          type="date"
          value={value}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="bg-[#333] text-white font-bold text-base rounded-lg px-3 py-1.5
                     border-none outline-none appearance-none
                     [color-scheme:dark]"
        />
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

  // Derived dates
  const startDate = new Date(data.startDate + 'T00:00:00');
  const endDate = addMonths(data.startDate, data.months);
  const endDateStr = toISODate(endDate);
  const now = new Date();
  const totalDays = daysBetween(startDate, endDate);
  const elapsedDays = Math.max(1, daysBetween(startDate, now)); // at least 1 to avoid division by 0
  const daysLeft = daysBetween(now, endDate);
  const isExpired = daysLeft < 0;

  // Count actual workouts from subscription start date to today
  const loadActualCount = useCallback(async () => {
    try {
      const count = await workoutRepo.countSessionsInRange(
        startDate.toISOString(),
        now.toISOString()
      );
      setActualCount(count);
    } catch {
      setActualCount(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.startDate]);

  useEffect(() => {
    if (isExpanded) {
      loadActualCount();
    }
  }, [isExpanded, loadActualCount]);

  // ---- Planned calculations ----
  const totalWeeks = data.months * 4.33;
  const plannedWorkouts = Math.round(totalWeeks * data.perWeek);
  const plannedCost = plannedWorkouts > 0 ? data.price / plannedWorkouts : 0;

  // ---- Actual/Projected calculations ----
  // How many workouts SHOULD have happened by now at planned pace
  const expectedByNow = !isExpired
    ? Math.round((elapsedDays / totalDays) * plannedWorkouts)
    : plannedWorkouts;

  // Project: if user keeps current pace, how many total workouts by end of subscription
  let projectedTotal: number | null = null;
  let projectedCost: number | null = null;

  if (actualCount !== null && actualCount > 0 && totalDays > 0) {
    if (isExpired) {
      // Subscription ended — actual total is final
      projectedTotal = actualCount;
    } else {
      // Extrapolate current pace to full period
      projectedTotal = Math.round((actualCount / elapsedDays) * totalDays);
    }
    projectedCost = projectedTotal > 0 ? data.price / projectedTotal : null;
  }

  // Deficit: how many workouts behind schedule
  const deficit = actualCount !== null ? expectedByNow - actualCount : null;

  // Is the user behind? (projected cost > planned cost by >10%)
  const isBehind =
    projectedCost !== null &&
    plannedCost > 0 &&
    projectedCost > plannedCost * 1.1;

  const update = <K extends keyof GymCostData>(field: K, value: GymCostData[K]) => {
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
              {formatDecimal(plannedCost, 0)} ₽ за тренировку по плану
              {!isExpired && daysLeft <= 30 && daysLeft >= 0 && (
                <span className="text-yellow-500 ml-1">
                  · {daysLeft} дн. осталось
                </span>
              )}
              {isExpired && (
                <span className="text-red-400 ml-1">· истёк</span>
              )}
            </div>
          </div>
          <div
            className={`shrink-0 transition-transform duration-200 ${
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
            <DatePickerRow
              label="Дата оплаты"
              value={data.startDate}
              onChange={(v) => update('startDate', v)}
            />
          </div>

          {/* Subscription period info */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#555]">Период</span>
            <span className="text-xs text-[#707070]">
              {fmtDate(data.startDate)} — {fmtDate(endDateStr)}
            </span>
          </div>

          {!isExpired ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#555]">Осталось</span>
              <span className={`text-xs font-medium ${
                daysLeft <= 14 ? 'text-yellow-500' : 'text-[#707070]'
              }`}>
                {daysLeft} дн.
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#555]">Статус</span>
              <span className="text-xs font-medium text-red-400">
                Истёк {Math.abs(daysLeft)} дн. назад
              </span>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-[#333]" />

          {/* Planned result */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#B0B0B0]">По плану</span>
            <div className="text-right">
              <span className="text-lg font-bold text-green-500">
                {formatDecimal(plannedCost, 0)} ₽
              </span>
              <span className="text-xs text-[#707070] ml-2">
                / тренировка
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-[#555]">Всего по плану</span>
            <span className="text-xs text-[#707070]">
              ~{plannedWorkouts} тренировок за {data.months} мес
            </span>
          </div>

          {/* Actual / Projected section */}
          {actualCount !== null && (
            <>
              <div className="border-t border-[#333]" />

              {/* Current progress */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#B0B0B0]">Сходил</span>
                <span className="text-sm text-white font-medium">
                  {actualCount}
                  <span className="text-[#555]"> / {expectedByNow} ожид.</span>
                </span>
              </div>

              {/* Deficit warning */}
              {deficit !== null && deficit > 0 && !isExpired && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#555]">Отставание</span>
                  <span className="text-xs font-medium text-yellow-500">
                    −{deficit} тренировок
                  </span>
                </div>
              )}

              {deficit !== null && deficit <= 0 && !isExpired && actualCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#555]">Опережение</span>
                  <span className="text-xs font-medium text-green-400">
                    +{Math.abs(deficit)} тренировок
                  </span>
                </div>
              )}

              {/* Projected cost */}
              {projectedCost !== null && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#B0B0B0]">
                      {isExpired ? 'Итого' : 'Прогноз'}
                    </span>
                    <div className="text-right flex items-center gap-2">
                      {isBehind ? (
                        <TrendingUp size={16} className="text-red-400" />
                      ) : (
                        <TrendingDown size={16} className="text-green-400" />
                      )}
                      <span
                        className={`text-lg font-bold ${
                          isBehind ? 'text-red-400' : 'text-green-500'
                        }`}
                      >
                        {formatDecimal(projectedCost, 0)} ₽
                      </span>
                      <span className="text-xs text-[#707070]">
                        / тренировка
                      </span>
                    </div>
                  </div>

                  {!isExpired && projectedTotal !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#555]">
                        При текущем темпе
                      </span>
                      <span className="text-xs text-[#707070]">
                        ~{projectedTotal} тренировок к концу
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* No workouts yet */}
              {actualCount === 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#B0B0B0]">Прогноз</span>
                  <span className="text-sm text-[#555]">нет данных</span>
                </div>
              )}

              {/* Motivational nudge if behind */}
              {isBehind && projectedCost !== null && (
                <div className="bg-red-600/10 rounded-xl px-4 py-3 border border-red-600/20">
                  <p className="text-sm text-red-300">
                    При текущем темпе тренировка обойдётся в{' '}
                    <span className="font-bold">
                      {formatDecimal(projectedCost, 0)} ₽
                    </span>{' '}
                    вместо {formatDecimal(plannedCost, 0)} ₽. Не ленись!
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
