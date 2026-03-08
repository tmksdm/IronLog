// src/components/home/RestoreWorkoutModal.tsx

import type { WorkoutSnapshot } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { formatDate } from '../../utils';
import { getDayTypeColor } from '../../theme';
import { AlertTriangle } from 'lucide-react';

interface RestoreWorkoutModalProps {
  isOpen: boolean;
  snapshot: WorkoutSnapshot | null;
  onRestore: () => void;
  onDiscard: () => void;
}

export function RestoreWorkoutModal({
  isOpen,
  snapshot,
  onRestore,
  onDiscard,
}: RestoreWorkoutModalProps) {
  if (!snapshot) return null;

  const dayNames: Record<number, string> = {
    1: 'Присед',
    2: 'Тяга',
    3: 'Жим',
  };
  const dayName = dayNames[snapshot.session.dayTypeId] ?? 'Тренировка';
  const accentColor = getDayTypeColor(snapshot.session.dayTypeId);

  const completedCount = snapshot.exercises.filter(
    (e: any) => e.status === 'completed'
  ).length;
  const totalCount = snapshot.exercises.length;

  return (
    <Modal isOpen={isOpen} onClose={onDiscard} title="Незавершённая тренировка" persistent>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 text-orange-400">
          <AlertTriangle size={24} />
          <p className="text-sm">
            Обнаружена незавершённая тренировка. Хотите продолжить?
          </p>
        </div>

        <div className="bg-[#252525] rounded-xl p-4 space-y-1">
          <p className="font-bold text-lg" style={{ color: accentColor }}>
            {dayName}
          </p>
          <p className="text-sm text-[#B0B0B0]">
            {formatDate(snapshot.session.date)}
          </p>
          <p className="text-sm text-[#B0B0B0]">
            Выполнено: {completedCount} из {totalCount} упражнений
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" fullWidth onClick={onDiscard}>
            Отменить
          </Button>
          <Button variant="primary" fullWidth onClick={onRestore}>
            Продолжить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
