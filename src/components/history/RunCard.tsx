// src/components/history/RunCard.tsx

/**
 * Standalone run card in the History list. Non-clickable; trash icon for
 * single deletion, checkbox in selection mode.
 */

import { Clock, Trash2, CheckSquare, Square } from 'lucide-react';
import type { CardioLog } from '../../types';
import { formatDate, formatTimeMMSS } from '../../utils/format';
import { RUNNING_ACCENT } from './historyHelpers';

interface RunCardProps {
  run: CardioLog;
  isSelecting: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

export function RunCard({
  run,
  isSelecting,
  isSelected,
  onToggle,
  onDelete,
}: RunCardProps) {
  const resultLabel =
    run.succeeded === true
      ? 'справился'
      : run.succeeded === false
        ? 'не справился'
        : null;
  const resultColor =
    run.succeeded === true
      ? '#4CAF50'
      : run.succeeded === false
        ? '#F44336'
        : '#707070';

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
          style={{ backgroundColor: RUNNING_ACCENT }}
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold" style={{ color: RUNNING_ACCENT }}>
            Бег 3 км
          </span>
          <span className="text-[#707070] text-xs ml-auto shrink-0">
            {run.date ? formatDate(run.date) : ''}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[#B0B0B0]">
          {run.durationSeconds !== null && (
            <div className="flex items-center gap-1">
              <Clock size={13} className="text-[#707070]" />
              <span className="text-xs">{formatTimeMMSS(run.durationSeconds)}</span>
            </div>
          )}
          {resultLabel && (
            <span className="text-xs font-medium" style={{ color: resultColor }}>
              {resultLabel}
            </span>
          )}
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
