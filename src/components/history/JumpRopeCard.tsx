import { CheckSquare, Hash, Square, Trash2 } from 'lucide-react';
import type { CardioLog } from '../../types';
import { formatDate } from '../../utils/format';
import { JUMP_ROPE_ACCENT } from './historyHelpers';

interface JumpRopeCardProps {
  entry: CardioLog;
  isSelecting: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

export function JumpRopeCard({
  entry,
  isSelecting,
  isSelected,
  onToggle,
  onDelete,
}: JumpRopeCardProps) {
  return (
    <div
      className={`w-full bg-[#252525] rounded-xl p-3.5 flex items-center gap-3 ${
        isSelected ? 'ring-2 ring-[#F44336]/60' : ''
      }`}
    >
      {isSelecting ? (
        <button
          aria-label={isSelected ? 'Снять выделение' : 'Выбрать запись'}
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
          style={{ backgroundColor: JUMP_ROPE_ACCENT }}
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold" style={{ color: JUMP_ROPE_ACCENT }}>Скакалка</span>
          <span className="text-[#707070] text-xs ml-auto shrink-0">
            {entry.date ? formatDate(entry.date) : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[#B0B0B0]">
          <Hash size={13} className="text-[#707070]" />
          <span className="text-xs">{entry.count ?? 0} прыжков</span>
        </div>
      </div>

      {!isSelecting && (
        <button
          onClick={onDelete}
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center active:bg-[#F44336]/10 transition-colors"
          title="Удалить"
        >
          <Trash2 size={18} className="text-[#707070]" />
        </button>
      )}
    </div>
  );
}
