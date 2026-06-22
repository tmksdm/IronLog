// src/components/history/PullupCard.tsx

/**
 * Standalone pull-up session card in the History list. Non-clickable; trash
 * icon for single deletion, checkbox in selection mode.
 */

import { Activity, Trash2, CheckSquare, Square } from 'lucide-react';
import type { StandalonePullupSession } from '../../types';
import { formatDate } from '../../utils/format';
import { getPullupDayName } from '../../utils/pullupProgram';
import { PULLUP_ACCENT } from './historyHelpers';

interface PullupCardProps {
  session: StandalonePullupSession;
  isSelecting: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

export function PullupCard({
  session,
  isSelecting,
  isSelected,
  onToggle,
  onDelete,
}: PullupCardProps) {
  const day5Rotation =
    session.pullupDay === 5
      ? (session.effectiveDay as 1 | 2 | 3 | 4)
      : undefined;
  const dayName = getPullupDayName(
    session.pullupDay as 1 | 2 | 3 | 4 | 5,
    day5Rotation
  );

  return (
    <div
      className={`w-full bg-[#252525] rounded-xl p-3.5 flex items-center gap-3
                  ${isSelected ? 'ring-2 ring-[#F44336]/60' : ''}`}
    >
      {isSelecting ? (
        <button
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center"
          onClick={onToggle}
        >
          {isSelected ? (
            <CheckSquare size={22} className="text-[#F44336]" />
          ) : (
            <Square size={22} className="text-[#555555]" />
          )}
        </button>
      ) : (
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: PULLUP_ACCENT }}
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold wrap-break-word" style={{ color: PULLUP_ACCENT }}>
            {dayName}
          </span>
          <span className="text-[#707070] text-xs ml-auto shrink-0">
            {formatDate(session.date)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[#B0B0B0]">
          <div className="flex items-center gap-1">
            <Activity size={13} className="text-[#707070]" />
            <span className="text-xs">{session.setCount} подх.</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium" style={{ color: PULLUP_ACCENT }}>
              {session.totalReps} повт.
            </span>
          </div>
        </div>
      </div>

      {!isSelecting && (
        <button
          onClick={onDelete}
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center
                     active:bg-[#F44336]/10 transition-colors"
          title="Удалить"
        >
          <Trash2 size={18} className="text-[#707070]" />
        </button>
      )}
    </div>
  );
}
