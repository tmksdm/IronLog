// src/components/history/SessionCard.tsx

/**
 * Strength workout card in the History list. Clickable (opens detail).
 */

import { Clock, Dumbbell, Scale, ChevronRight, CheckSquare, Square } from 'lucide-react';
import type { WorkoutSession } from '../../types';
import {
  formatDate,
  formatTonnage,
  formatWorkoutDuration,
  formatDecimal,
} from '../../utils/format';
import { getDayTypeColor, DAY_TYPE_NAMES_RU } from '../../theme';

interface SessionCardProps {
  session: WorkoutSession;
  isSelecting: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  cardRef: (el: HTMLElement | null) => void;
}

export function SessionCard({
  session,
  isSelecting,
  isSelected,
  onToggle,
  onClick,
  cardRef,
}: SessionCardProps) {
  const accentColor = getDayTypeColor(session.dayTypeId);
  const dayName = DAY_TYPE_NAMES_RU[session.dayTypeId] ?? '';
  const directionLabel = session.direction === 'normal' ? '→' : '←';

  const duration =
    session.timeStart && session.timeEnd
      ? formatWorkoutDuration(session.timeStart, session.timeEnd)
      : null;

  const avgWeight =
    session.weightBefore !== null && session.weightAfter !== null
      ? (session.weightBefore + session.weightAfter) / 2
      : session.weightBefore ?? session.weightAfter;

  return (
    <button
      ref={cardRef}
      onClick={onClick}
      className={`w-full bg-[#252525] rounded-xl p-3.5 flex items-center gap-3
                  active:bg-[#2A2A2A] transition-colors text-left
                  ${isSelected ? 'ring-2 ring-[#F44336]/60' : ''}`}
    >
      {isSelecting ? (
        <div
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isSelected ? (
            <CheckSquare size={22} className="text-[#F44336]" />
          ) : (
            <Square size={22} className="text-[#555555]" />
          )}
        </div>
      ) : (
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: accentColor }}
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-white" style={{ color: accentColor }}>
            {dayName}
          </span>
          <span className="text-[#707070] text-sm">{directionLabel}</span>
          <span className="text-[#707070] text-xs ml-auto shrink-0">
            {formatDate(session.date)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[#B0B0B0]">
          {session.totalKg > 0 && (
            <div className="flex items-center gap-1">
              <Dumbbell size={13} className="text-[#707070]" />
              <span className="text-xs">{formatTonnage(session.totalKg)}</span>
            </div>
          )}
          {duration && (
            <div className="flex items-center gap-1">
              <Clock size={13} className="text-[#707070]" />
              <span className="text-xs">{duration}</span>
            </div>
          )}
          {avgWeight !== null && (
            <div className="flex items-center gap-1">
              <Scale size={13} className="text-[#707070]" />
              <span className="text-xs">{formatDecimal(avgWeight)} кг</span>
            </div>
          )}
        </div>
      </div>

      {!isSelecting && (
        <ChevronRight size={18} className="text-[#555555] shrink-0" />
      )}
    </button>
  );
}
