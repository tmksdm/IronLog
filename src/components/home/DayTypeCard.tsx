// src/components/home/DayTypeCard.tsx

import type { DayType, Direction, WorkoutSession } from '../../types';
import { Card } from '../ui/Card';
import { getDayTypeColor, getDayTypeBgClass } from '../../theme';
import { formatDate, formatTonnage, formatWorkoutDuration, formatWeight, calculateAverageBodyWeight } from '../../utils';
import { ArrowRight, ArrowLeft, Dumbbell } from 'lucide-react';

interface DayTypeCardProps {
  dayType: DayType;
  direction: Direction;
  lastSession: WorkoutSession | null;
  isNext: boolean;
}

export function DayTypeCard({ dayType, direction, lastSession, isNext }: DayTypeCardProps) {
  const accentColor = getDayTypeColor(dayType.id);
  const bgClass = getDayTypeBgClass(dayType.id);

  return (
    <Card
      className={`relative overflow-hidden ${isNext ? 'ring-2' : 'opacity-60'}`}
      style={isNext ? { borderColor: accentColor, boxShadow: `0 0 0 2px ${accentColor}` } : undefined}
    >
      {/* Accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${bgClass}`} />

      <div className="pl-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Dumbbell size={18} style={{ color: accentColor }} />
            <h3 className="text-lg font-bold text-white">{dayType.nameRu}</h3>
          </div>

          {isNext && (
            <div className="flex items-center gap-1.5 bg-[#2A2A2A] rounded-lg px-2.5 py-1">
              {direction === 'normal' ? (
                <ArrowRight size={16} className="text-green-400" />
              ) : (
                <ArrowLeft size={16} className="text-orange-400" />
              )}
              <span className="text-xs text-[#B0B0B0]">
                {direction === 'normal' ? 'Прямой' : 'Обратный'}
              </span>
            </div>
          )}
        </div>

        {/* Last session info */}
        {lastSession ? (
          <div className="text-sm text-[#B0B0B0] space-y-0.5">
            <p>{formatDate(lastSession.date)}</p>
            <div className="flex gap-3">
              {lastSession.totalKg > 0 && (
                <span>{formatTonnage(lastSession.totalKg)}</span>
              )}
              {formatWorkoutDuration(lastSession.timeStart, lastSession.timeEnd) && (
                <span>{formatWorkoutDuration(lastSession.timeStart, lastSession.timeEnd)}</span>
              )}
              {calculateAverageBodyWeight(lastSession.weightBefore, lastSession.weightAfter) !== null && (
                <span>{formatWeight(calculateAverageBodyWeight(lastSession.weightBefore, lastSession.weightAfter)!)}</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#707070]">Нет тренировок</p>
        )}
      </div>
    </Card>
  );
}
