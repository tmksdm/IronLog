// src/components/home/StartWorkoutModal.tsx

import { useState, useEffect } from 'react';
import type { DayType, Direction, WorkoutSession } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { NumberStepper } from '../ui/NumberStepper';
import { getDayTypeColor } from '../../theme';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { formatDecimal } from '../../utils';

interface StartWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (weightBefore: number | null) => void;
  dayType: DayType;
  direction: Direction;
  lastSession: WorkoutSession | null;
}

export function StartWorkoutModal({
  isOpen,
  onClose,
  onStart,
  dayType,
  direction,
  lastSession,
}: StartWorkoutModalProps) {
  // Initialize weight from last session's weightBefore or weightAfter
  const defaultWeight =
    lastSession?.weightAfter ?? lastSession?.weightBefore ?? 80;

  const [weight, setWeight] = useState<number>(defaultWeight);

  // Reset weight when modal opens
  useEffect(() => {
    if (isOpen) {
      setWeight(
        lastSession?.weightAfter ?? lastSession?.weightBefore ?? 80
      );
    }
  }, [isOpen, lastSession]);

  const accentColor = getDayTypeColor(dayType.id);

  const handleStart = () => {
    onStart(weight);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Начать тренировку">
      <div className="flex flex-col gap-6">
        {/* Day type + direction info */}
        <div className="flex items-center justify-center gap-3 py-3 bg-[#252525] rounded-xl">
          <span className="text-xl font-bold" style={{ color: accentColor }}>
            {dayType.nameRu}
          </span>
          <div className="flex items-center gap-1.5">
            {direction === 'normal' ? (
              <ArrowRight size={20} className="text-green-400" />
            ) : (
              <ArrowLeft size={20} className="text-orange-400" />
            )}
            <span className="text-sm text-[#B0B0B0]">
              {direction === 'normal' ? 'Прямой' : 'Обратный'}
            </span>
          </div>
        </div>

        {/* Weight input */}
        <div className="flex flex-col items-center">
          <NumberStepper
            value={weight}
            onChange={setWeight}
            min={30}
            max={250}
            step={0.25}
            inputStep={0.01}            
            label="Вес до тренировки"
            unit="кг"
            formatValue={(v) => formatDecimal(v)}
            size="lg"
          />
        </div>

        {/* Start button */}
        <Button
          variant="primary"
          size="xl"
          fullWidth
          onClick={handleStart}
        >
          Начать
        </Button>
      </div>
    </Modal>
  );
}
