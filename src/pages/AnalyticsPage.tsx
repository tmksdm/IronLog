// src/pages/AnalyticsPage.tsx

/**
 * Analytics page — 5 tabs: Тоннаж, Вес тела, Время, Бег, Упражнение.
 * All metric tabs share the same layout: monthly chart + table, yearly chart + table.
 * Y-axis scales from actual minimum (not 0) for better data visibility.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Weight,
  Scale,
  Timer,
  Footprints,
  Dumbbell,
  BarChart3,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '../components/ui';
import { colors, getDayTypeColor } from '../theme';
import {
  getMonthlyTonnage,
  getYearlyTonnage,
  getMonthlyBodyWeight,
  getYearlyBodyWeight,
  getMonthlyDuration,
  getYearlyDuration,
  getMonthlyRunTime,
  getYearlyRunTime,
  getExerciseProgress,
  getAllExercisesForPicker,
} from '../db/repositories/analyticsRepository';
import {
  formatDecimal,
  formatTonnage,
  formatDurationMinutes,
  formatTimeMMSS,
  formatDateShort,
} from '../utils/format';
import type {
  DayTypeId,
  MonthlyTonnage,
  YearlyTonnage,
  MonthlyBodyWeight,
  YearlyBodyWeight,
  MonthlyDuration,
  YearlyDuration,
  MonthlyRunTime,
  YearlyRunTime,
  ExerciseProgressPoint,
  ExercisePickerItem,
} from '../types';

// ==========================================
// Tab definitions
// ==========================================

type TabKey = 'tonnage' | 'bodyweight' | 'duration' | 'running' | 'exercise';

const TABS: { key: TabKey; label: string; Icon: React.FC<{ size?: number; className?: string }> }[] = [
  { key: 'tonnage', label: 'Тоннаж', Icon: Weight },
  { key: 'bodyweight', label: 'Вес тела', Icon: Scale },
  { key: 'duration', label: 'Время', Icon: Timer },
  { key: 'running', label: 'Бег', Icon: Footprints },
  { key: 'exercise', label: 'Упражнение', Icon: Dumbbell },
];

// ==========================================
// Day type filter
// ==========================================

type DayTypeFilter = 'all' | DayTypeId;

const DAY_TYPE_FILTERS: { key: DayTypeFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 1, label: 'Присед' },
  { key: 2, label: 'Тяга' },
  { key: 3, label: 'Жим' },
];

// ==========================================
// Shared month names
// ==========================================

const MONTH_NAMES = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

// ==========================================
// Generic helpers for 12-month / 12-year slot filling
// ==========================================

interface MonthlyRow {
  year: number;
  month: number;
}

/**
 * Build 12-month chart data from any monthly dataset.
 * getValue extracts the numeric value from a row.
 * Months without data get value = null (gaps in chart).
 */
function buildLast12Months<T extends MonthlyRow>(
  data: T[],
  getValue: (row: T) => number
): ChartDataPoint[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const dataMap = new Map<string, number>();
  for (const d of data) {
    dataMap.set(`${d.year}-${d.month}`, getValue(d));
  }

  const result: ChartDataPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    let m = currentMonth - i;
    let y = currentYear;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const key = `${y}-${m}`;
    result.push({
      label: m.toString().padStart(2, '0'),
      value: dataMap.has(key) ? dataMap.get(key)! : null,
      fullLabel: `${MONTH_NAMES[m - 1]} ${y}`,
    });
  }

  return result;
}

interface YearlyRow {
  year: number;
}

/**
 * Build 12-year chart data from any yearly dataset.
 */
function buildLast12Years<T extends YearlyRow>(
  data: T[],
  getValue: (row: T) => number
): ChartDataPoint[] {
  const now = new Date();
  const currentYear = now.getFullYear();

  const dataMap = new Map<number, number>();
  for (const d of data) {
    dataMap.set(d.year, getValue(d));
  }

  const result: ChartDataPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const y = currentYear - i;
    result.push({
      label: y.toString().slice(2),
      value: dataMap.has(y) ? dataMap.get(y)! : null,
      fullLabel: y.toString(),
    });
  }

  return result;
}

// ==========================================
// Shared chart components
// ==========================================

interface ChartDataPoint {
  label: string;
  value: number | null;
  fullLabel?: string;
}

/**
 * Compute Y-axis domain from actual data: [min - padding, max + padding].
 * Skips null values. Falls back to [0, 'auto'] if no data.
 */
function computeYDomain(
  data: ChartDataPoint[]
): [number | string, number | string] {
  const values = data
    .map((d) => d.value)
    .filter((v): v is number => v !== null && v > 0);

  if (values.length === 0) return [0, 'auto'];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // Add ~15% padding, round to nice numbers
  const padding = range > 0 ? range * 0.15 : max * 0.05 || 2;
  const yMin = Math.floor((min - padding) * 2) / 2; // round down to 0.5
  const yMax = Math.ceil((max + padding) * 2) / 2;  // round up to 0.5

  return [Math.max(0, yMin), yMax];
}

function AnalyticsChart({
  data,
  lineColor,
  formatValue,
  height = 200,
}: {
  data: ChartDataPoint[];
  lineColor: string;
  formatValue?: (v: number) => string;
  height?: number;
}) {
  if (data.length === 0) return null;

  const hasData = data.some((d) => d.value !== null && d.value > 0);
  if (!hasData) return null;

  const formatTooltipValue = formatValue ?? ((v: number) => `${Math.round(v)}`);
  const yDomain = computeYDomain(data);

  return (
    <Card className="!p-0 overflow-hidden">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke={colors.textMuted}
            tick={{ fill: colors.textMuted, fontSize: 10 }}
            axisLine={{ stroke: colors.border }}
            tickLine={false}
          />
          <YAxis
            stroke={colors.textMuted}
            tick={{ fill: colors.textMuted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
            domain={yDomain}
            tickFormatter={(v) => `${Math.round(v)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: colors.textSecondary }}
            itemStyle={{ color: lineColor }}
            formatter={(value: number) => [formatTooltipValue(value), '']}
            labelFormatter={(label, payload) => {
              const point = payload?.[0]?.payload as ChartDataPoint | undefined;
              return point?.fullLabel ?? label;
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={2}
            dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: lineColor, strokeWidth: 2, stroke: colors.background }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ==========================================
// Empty state
// ==========================================

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="flex flex-col items-center justify-center py-8 gap-3">
      <BarChart3 size={40} className="text-[#555]" />
      <p className="text-sm text-[#707070] text-center">{message}</p>
    </Card>
  );
}

// ==========================================
// Stat table
// ==========================================

function StatTable({
  rows,
}: {
  rows: { label: string; value: string; sub?: string }[];
}) {
  return (
    <Card className="!p-0 overflow-hidden">
      {rows.map((row, idx) => (
        <div
          key={idx}
          className={`flex items-center justify-between px-4 py-3 ${
            idx < rows.length - 1 ? 'border-b border-[#333]' : ''
          }`}
        >
          <span className="text-sm text-[#B0B0B0]">{row.label}</span>
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-white">{row.value}</span>
            {row.sub && (
              <span className="text-xs text-[#707070]">{row.sub}</span>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}

// ==========================================
// Tab: Тоннаж
// ==========================================

function TonnageTab() {
  const [filter, setFilter] = useState<DayTypeFilter>('all');
  const [monthly, setMonthly] = useState<MonthlyTonnage[]>([]);
  const [yearly, setYearly] = useState<YearlyTonnage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (f: DayTypeFilter) => {
    const dtId = f === 'all' ? undefined : f;
    const [m, y] = await Promise.all([
      getMonthlyTonnage(dtId),
      getYearlyTonnage(dtId),
    ]);
    setMonthly(m);
    setYearly(y);
  }, []);

  useEffect(() => {
    setLoading(true);
    load(filter).finally(() => setLoading(false));
  }, [filter, load]);

  const filterColor =
    filter === 'all' ? colors.primary : getDayTypeColor(filter as number);

  const monthly12 = buildLast12Months(monthly, (r) => r.avgTotalKg);
  const yearly12 = buildLast12Years(yearly, (r) => r.avgTotalKg);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col gap-6">
      {/* Day type filter chips */}
      <div className="flex gap-2 flex-wrap">
        {DAY_TYPE_FILTERS.map((opt) => {
          const isActive = filter === opt.key;
          const chipColor =
            opt.key === 'all'
              ? colors.primary
              : getDayTypeColor(opt.key as number);

          return (
            <button
              key={String(opt.key)}
              onClick={() => setFilter(opt.key)}
              className="px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors"
              style={{
                backgroundColor: isActive ? chipColor + '30' : colors.surface,
                borderColor: isActive ? chipColor : colors.border,
                color: isActive ? chipColor : colors.textSecondary,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Monthly averages */}
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-bold text-white">Среднее за месяц</h3>
        <AnalyticsChart
          data={monthly12}
          lineColor={filterColor}
          formatValue={(v) => formatTonnage(v)}
        />
        {monthly.length > 0 && (
          <StatTable
            rows={monthly
              .slice()
              .reverse()
              .map((m) => ({
                label: m.label,
                value: formatTonnage(m.avgTotalKg),
                sub: `${m.workoutCount} тренир.`,
              }))}
          />
        )}
      </div>

      {/* Yearly averages */}
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-bold text-white">Среднее за год</h3>
        <AnalyticsChart
          data={yearly12}
          lineColor={filterColor}
          formatValue={(v) => formatTonnage(v)}
        />
        {yearly.length > 0 && (
          <StatTable
            rows={yearly
              .slice()
              .reverse()
              .map((y) => ({
                label: `${y.year}`,
                value: formatTonnage(y.avgTotalKg),
                sub: `${y.workoutCount} тренир.`,
              }))}
          />
        )}
      </div>
    </div>
  );
}

// ==========================================
// Tab: Вес тела
// ==========================================

function BodyWeightTab() {
  const [monthly, setMonthly] = useState<MonthlyBodyWeight[]>([]);
  const [yearly, setYearly] = useState<YearlyBodyWeight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMonthlyBodyWeight(), getYearlyBodyWeight()])
      .then(([m, y]) => {
        setMonthly(m);
        setYearly(y);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const monthly12 = buildLast12Months(monthly, (r) => r.avgWeight);
  const yearly12 = buildLast12Years(yearly, (r) => r.avgWeight);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-bold text-white">Среднее за месяц</h3>
        {monthly.length === 0 ? (
          <EmptyState message="Нет данных о весе тела" />
        ) : (
          <>
            <AnalyticsChart
              data={monthly12}
              lineColor={colors.secondary}
              formatValue={(v) => `${formatDecimal(v)} кг`}
            />
            <StatTable
              rows={monthly
                .slice()
                .reverse()
                .map((m) => ({
                  label: m.label,
                  value: `${formatDecimal(m.avgWeight)} кг`,
                  sub: `${m.measurementCount} измер.`,
                }))}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-bold text-white">Среднее за год</h3>
        {yearly.length === 0 ? (
          <EmptyState message="Нет данных о весе тела" />
        ) : (
          <>
            <AnalyticsChart
              data={yearly12}
              lineColor={colors.secondary}
              formatValue={(v) => `${formatDecimal(v)} кг`}
            />
            <StatTable
              rows={yearly
                .slice()
                .reverse()
                .map((y) => ({
                  label: `${y.year}`,
                  value: `${formatDecimal(y.avgWeight)} кг`,
                  sub: `${y.measurementCount} измер.`,
                }))}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Tab: Время
// ==========================================

function DurationTab() {
  const [monthly, setMonthly] = useState<MonthlyDuration[]>([]);
  const [yearly, setYearly] = useState<YearlyDuration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMonthlyDuration(), getYearlyDuration()])
      .then(([m, y]) => {
        setMonthly(m);
        setYearly(y);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const monthly12 = buildLast12Months(monthly, (r) => r.avgDurationMin);
  const yearly12 = buildLast12Years(yearly, (r) => r.avgDurationMin);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-bold text-white">Среднее за месяц</h3>
        {monthly.length === 0 ? (
          <EmptyState message="Нет данных о длительности" />
        ) : (
          <>
            <AnalyticsChart
              data={monthly12}
              lineColor={colors.info}
              formatValue={(v) => formatDurationMinutes(v)}
            />
            <StatTable
              rows={monthly
                .slice()
                .reverse()
                .map((m) => ({
                  label: m.label,
                  value: formatDurationMinutes(m.avgDurationMin),
                  sub: `${m.workoutCount} тренир.`,
                }))}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-bold text-white">Среднее за год</h3>
        {yearly.length === 0 ? (
          <EmptyState message="Нет данных о длительности" />
        ) : (
          <>
            <AnalyticsChart
              data={yearly12}
              lineColor={colors.info}
              formatValue={(v) => formatDurationMinutes(v)}
            />
            <StatTable
              rows={yearly
                .slice()
                .reverse()
                .map((y) => ({
                  label: `${y.year}`,
                  value: formatDurationMinutes(y.avgDurationMin),
                  sub: `${y.workoutCount} тренир.`,
                }))}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Tab: Бег
// ==========================================

function RunningTab() {
  const [monthly, setMonthly] = useState<MonthlyRunTime[]>([]);
  const [yearly, setYearly] = useState<YearlyRunTime[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMonthlyRunTime(), getYearlyRunTime()])
      .then(([m, y]) => {
        setMonthly(m);
        setYearly(y);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const monthly12 = buildLast12Months(monthly, (r) => r.avgDurationSec);
  const yearly12 = buildLast12Years(yearly, (r) => r.avgDurationSec);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-bold text-white">Бег 3 км — среднее за месяц</h3>
        {monthly.length === 0 ? (
          <EmptyState message="Нет данных о беге" />
        ) : (
          <>
            <AnalyticsChart
              data={monthly12}
              lineColor="#66BB6A"
              formatValue={(v) => formatTimeMMSS(Math.round(v))}
            />
            <StatTable
              rows={monthly
                .slice()
                .reverse()
                .map((m) => ({
                  label: m.label,
                  value: formatTimeMMSS(m.avgDurationSec),
                  sub: `${m.runCount} забегов`,
                }))}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-bold text-white">Бег 3 км — среднее за год</h3>
        {yearly.length === 0 ? (
          <EmptyState message="Нет данных о беге" />
        ) : (
          <>
            <AnalyticsChart
              data={yearly12}
              lineColor="#66BB6A"
              formatValue={(v) => formatTimeMMSS(Math.round(v))}
            />
            <StatTable
              rows={yearly
                .slice()
                .reverse()
                .map((y) => ({
                  label: `${y.year}`,
                  value: formatTimeMMSS(y.avgDurationSec),
                  sub: `${y.runCount} забегов`,
                }))}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Tab: Упражнение
// ==========================================

function ExerciseTab() {
  const [exercises, setExercises] = useState<ExercisePickerItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExerciseProgressPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoad = useRef(true);

  useEffect(() => {
    getAllExercisesForPicker()
      .then(async (exList) => {
        setExercises(exList);
        if (exList.length > 0 && initialLoad.current) {
          initialLoad.current = false;
          const firstId = exList[0]!.id;
          setSelectedId(firstId);
          const p = await getExerciseProgress(firstId);
          setProgress(p);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSelectExercise = useCallback(async (id: string) => {
    setSelectedId(id);
    const p = await getExerciseProgress(id);
    setProgress(p);
  }, []);

  if (loading) return <LoadingSpinner />;

  // Group exercises by day type
  const grouped = new Map<DayTypeId, ExercisePickerItem[]>();
  for (const ex of exercises) {
    if (!grouped.has(ex.dayTypeId)) {
      grouped.set(ex.dayTypeId, []);
    }
    grouped.get(ex.dayTypeId)!.push(ex);
  }

  const DAY_TYPE_NAMES: Record<number, string> = { 1: 'Присед', 2: 'Тяга', 3: 'Жим' };

  const selectedExercise = exercises.find((e) => e.id === selectedId);
  const selectedColor = selectedExercise
    ? getDayTypeColor(selectedExercise.dayTypeId)
    : colors.primary;

  // Build chart data for working weight
  const weightPoints: ChartDataPoint[] = progress
    .filter((p) => p.workingWeight !== null)
    .map((p) => ({
      label: formatDateShort(p.date),
      value: p.workingWeight!,
      fullLabel: formatDateShort(p.date),
    }));

  const weightSparsed = sparseLabels(weightPoints, 8);

  // Build chart data for total reps
  const repsPoints: ChartDataPoint[] = progress.map((p) => ({
    label: formatDateShort(p.date),
    value: p.totalWorkingReps,
    fullLabel: formatDateShort(p.date),
  }));

  const repsSparsed = sparseLabels(repsPoints, 8);

  return (
    <div className="flex flex-col gap-6">
      {/* Exercise picker */}
      <div className="flex flex-col gap-4">
        <h3 className="text-base font-bold text-white">Выберите упражнение</h3>

        {Array.from(grouped.entries()).map(([dayTypeId, exList]) => {
          const groupColor = getDayTypeColor(dayTypeId);
          return (
            <div key={dayTypeId} className="flex flex-col gap-2">
              <span className="text-sm font-bold" style={{ color: groupColor }}>
                {DAY_TYPE_NAMES[dayTypeId] ?? ''}
              </span>
              <div className="flex flex-wrap gap-2">
                {exList.map((ex) => {
                  const isSelected = selectedId === ex.id;
                  return (
                    <button
                      key={ex.id}
                      onClick={() => handleSelectExercise(ex.id)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors truncate max-w-full"
                      style={{
                        backgroundColor: isSelected ? groupColor + '30' : colors.surface,
                        borderColor: isSelected ? groupColor : colors.border,
                        color: isSelected ? groupColor : colors.textSecondary,
                      }}
                    >
                      {ex.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected exercise data */}
      {selectedExercise && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-bold text-white">{selectedExercise.name}</h3>

          {progress.length === 0 ? (
            <EmptyState message="Нет данных для этого упражнения" />
          ) : (
            <>
              {/* Working weight chart */}
              {selectedExercise.hasAddedWeight && weightPoints.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#B0B0B0]">Рабочий вес</span>
                  {weightPoints.length >= 2 ? (
                    <AnalyticsChart
                      data={weightSparsed}
                      lineColor={selectedColor}
                      formatValue={(v) => `${formatDecimal(v)} кг`}
                    />
                  ) : (
                    <SingleStatCard
                      value={`${formatDecimal(weightPoints[0]!.value!)} кг`}
                    />
                  )}
                </div>
              )}

              {/* Total reps chart */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#B0B0B0]">
                  Повторения (сумма рабочих)
                </span>
                {repsPoints.length >= 2 ? (
                  <AnalyticsChart
                    data={repsSparsed}
                    lineColor={selectedColor}
                    formatValue={(v) => `${Math.round(v)}`}
                  />
                ) : (
                  <SingleStatCard
                    value={`${progress[0]!.workingReps.join('+')} = ${progress[0]!.totalWorkingReps}`}
                  />
                )}
              </div>

              {/* History table */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#B0B0B0]">История</span>
                <StatTable
                  rows={progress
                    .slice()
                    .reverse()
                    .map((p) => ({
                      label: formatDateShort(p.date),
                      value:
                        selectedExercise.hasAddedWeight && p.workingWeight
                          ? `${formatDecimal(p.workingWeight)} кг`
                          : `${p.workingReps.join('+')} = ${p.totalWorkingReps}`,
                      sub:
                        selectedExercise.hasAddedWeight
                          ? `${p.workingReps.join('+')} = ${p.totalWorkingReps}`
                          : p.totalKg > 0
                          ? `${Math.round(p.totalKg)} кг`
                          : undefined,
                    }))}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Utility: sparse labels for readability
// ==========================================

function sparseLabels(
  data: ChartDataPoint[],
  maxLabels: number
): ChartDataPoint[] {
  if (data.length <= maxLabels) return data;

  const keepSet = new Set<number>();
  const step = (data.length - 1) / (maxLabels - 1);
  for (let i = 0; i < maxLabels; i++) {
    keepSet.add(Math.round(i * step));
  }

  return data.map((d, idx) => ({
    ...d,
    label: keepSet.has(idx) ? d.label : '',
  }));
}

// ==========================================
// Single stat card
// ==========================================

function SingleStatCard({
  value,
}: {
  label?: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="flex flex-col items-center py-6 gap-1">
      <span className="text-xl font-bold text-white">{value}</span>
    </Card>
  );
}

// ==========================================
// Loading spinner
// ==========================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-[#4CAF50] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ==========================================
// Main component
// ==========================================

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('tonnage');

  return (
    <div className="min-h-screen bg-[#121212] pb-24">
      <div className="px-5 pt-14 pb-2">
        <h1 className="text-xl font-bold text-white">Статистика</h1>
      </div>

      <div className="px-5 py-2 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 w-max">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: isActive ? colors.primary + '20' : colors.surface,
                  borderColor: isActive ? colors.primary : colors.border,
                  color: isActive ? colors.primary : colors.textMuted,
                }}
              >
                <tab.Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 pt-4">
        {activeTab === 'tonnage' && <TonnageTab />}
        {activeTab === 'bodyweight' && <BodyWeightTab />}
        {activeTab === 'duration' && <DurationTab />}
        {activeTab === 'running' && <RunningTab />}
        {activeTab === 'exercise' && <ExerciseTab />}
      </div>
    </div>
  );
}
