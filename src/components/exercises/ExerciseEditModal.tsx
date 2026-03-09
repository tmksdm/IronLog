// src/components/exercises/ExerciseEditModal.tsx

/**
 * Modal for creating or editing an exercise.
 * Shows relevant fields based on hasAddedWeight toggle.
 */

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal, Button, NumberStepper } from '../ui';
import {
  createExercise,
  updateExercise,
  deactivateExercise,
  reactivateExercise,
  getMaxSortOrder,
} from '../../db/repositories/exerciseRepository';
import type { Exercise, DayTypeId } from '../../types';

interface ExerciseEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  exercise: Exercise | null; // null = create mode
  dayTypeId: DayTypeId;
}

export function ExerciseEditModal({
  isOpen,
  onClose,
  onSaved,
  exercise,
  dayTypeId,
}: ExerciseEditModalProps) {
  const isEditing = exercise !== null;

  // Form state
  const [name, setName] = useState('');
  const [hasAddedWeight, setHasAddedWeight] = useState(true);
  const [workingWeight, setWorkingWeight] = useState(40);
  const [weightIncrement, setWeightIncrement] = useState(2.5);
  const [warmup1Percent, setWarmup1Percent] = useState(60);
  const [warmup2Percent, setWarmup2Percent] = useState(80);
  const [maxRepsPerSet, setMaxRepsPerSet] = useState(8);
  const [minRepsPerSet, setMinRepsPerSet] = useState(4);
  const [numWorkingSets, setNumWorkingSets] = useState(3);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  // Initialize form when modal opens or exercise changes
  useEffect(() => {
    if (!isOpen) return;

    if (exercise) {
      setName(exercise.name);
      setHasAddedWeight(exercise.hasAddedWeight);
      setWorkingWeight(exercise.workingWeight ?? 40);
      setWeightIncrement(exercise.weightIncrement);
      setWarmup1Percent(exercise.warmup1Percent ?? 60);
      setWarmup2Percent(exercise.warmup2Percent ?? 80);
      setMaxRepsPerSet(exercise.maxRepsPerSet);
      setMinRepsPerSet(exercise.minRepsPerSet);
      setNumWorkingSets(exercise.numWorkingSets);
    } else {
      // Defaults for new exercise
      setName('');
      setHasAddedWeight(true);
      setWorkingWeight(40);
      setWeightIncrement(2.5);
      setWarmup1Percent(60);
      setWarmup2Percent(80);
      setMaxRepsPerSet(8);
      setMinRepsPerSet(4);
      setNumWorkingSets(3);
    }
    setShowDeactivateConfirm(false);
  }, [isOpen, exercise]);

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);

    try {
      if (isEditing) {
        // Update existing
        await updateExercise(exercise.id, {
          name: name.trim(),
          hasAddedWeight,
          workingWeight: hasAddedWeight ? workingWeight : null,
          weightIncrement: hasAddedWeight ? weightIncrement : 0,
          warmup1Percent: hasAddedWeight ? warmup1Percent : null,
          warmup2Percent: hasAddedWeight ? warmup2Percent : null,
          maxRepsPerSet,
          minRepsPerSet: hasAddedWeight ? Math.max(4, minRepsPerSet) : minRepsPerSet,
          numWorkingSets,
        });
      } else {
        // Create new
        const maxOrder = await getMaxSortOrder(dayTypeId);
        await createExercise({
          dayTypeId,
          name: name.trim(),
          sortOrder: maxOrder + 1,
          hasAddedWeight,
          workingWeight: hasAddedWeight ? workingWeight : null,
          weightIncrement: hasAddedWeight ? weightIncrement : 0,
          warmup1Percent: hasAddedWeight ? warmup1Percent : null,
          warmup2Percent: hasAddedWeight ? warmup2Percent : null,
          warmup1Reps: 12,
          warmup2Reps: 10,
          maxRepsPerSet,
          minRepsPerSet: hasAddedWeight ? Math.max(4, minRepsPerSet) : minRepsPerSet,
          numWorkingSets,
          isTimed: false,
          timerDurationSeconds: null,
          timerPrepSeconds: null,
          isActive: true,
        });
      }
      onSaved();
    } catch (err) {
      console.error('Failed to save exercise:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!exercise) return;
    setIsSaving(true);
    try {
      await deactivateExercise(exercise.id);
      onSaved();
    } catch (err) {
      console.error('Failed to deactivate:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReactivate = async () => {
    if (!exercise) return;
    setIsSaving(true);
    try {
      await reactivateExercise(exercise.id);
      onSaved();
    } catch (err) {
      console.error('Failed to reactivate:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Редактировать' : 'Новое упражнение'}
    >
      <div className="space-y-5">
        {/* Name */}
        <div>
          <label className="text-sm text-[#B0B0B0] block mb-1.5">Название</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Жим лёжа"
            className="w-full px-4 py-3 rounded-xl bg-[#2A2A2A] text-white
                       placeholder-[#555] outline-none focus:ring-2 focus:ring-green-600
                       text-base"
            autoFocus={!isEditing}
          />
        </div>

        {/* Has added weight toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#B0B0B0]">Со штангой / гантелями</span>
          <button
            onClick={() => setHasAddedWeight(!hasAddedWeight)}
            className={`
              w-12 h-7 rounded-full transition-colors relative
              ${hasAddedWeight ? 'bg-green-600' : 'bg-[#555]'}
            `}
          >
            <div
              className={`
                absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform
                ${hasAddedWeight ? 'translate-x-5.5' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>

        {/* Weight fields (only when hasAddedWeight) */}
        {hasAddedWeight && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <NumberStepper
                label="Рабочий вес"
                value={workingWeight}
                onChange={setWorkingWeight}
                min={0}
                max={300}
                step={2.5}
                unit="кг"
                size="sm"
              />
              <NumberStepper
                label="Шаг веса"
                value={weightIncrement}
                onChange={setWeightIncrement}
                min={0.5}
                max={10}
                step={0.5}
                unit="кг"
                size="sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <NumberStepper
                label="Разминка 1"
                value={warmup1Percent}
                onChange={setWarmup1Percent}
                min={30}
                max={80}
                step={5}
                unit="%"
                size="sm"
              />
              <NumberStepper
                label="Разминка 2"
                value={warmup2Percent}
                onChange={setWarmup2Percent}
                min={50}
                max={95}
                step={5}
                unit="%"
                size="sm"
              />
            </div>
          </>
        )}

        {/* Reps parameters */}
        <div className="grid grid-cols-3 gap-3">
          <NumberStepper
            label="Макс повт."
            value={maxRepsPerSet}
            onChange={(v) => {
              setMaxRepsPerSet(v);
              // Keep min ≤ max
              if (minRepsPerSet > v) setMinRepsPerSet(v);
            }}
            min={hasAddedWeight ? 4 : 1}
            max={99}
            step={1}
            size="sm"
          />
          <NumberStepper
            label="Мин повт."
            value={minRepsPerSet}
            onChange={(v) => setMinRepsPerSet(v)}
            min={hasAddedWeight ? 4 : 0}
            max={maxRepsPerSet}
            step={1}
            size="sm"
          />
          <NumberStepper
            label="Подходы"
            value={numWorkingSets}
            onChange={setNumWorkingSets}
            min={1}
            max={5}
            step={1}
            size="sm"
          />
        </div>

        {/* Action buttons */}
        <div className="space-y-2 pt-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleSave}
            disabled={!canSave || isSaving}
          >
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>

          {/* Deactivate / Reactivate (only for existing exercises) */}
          {isEditing && (
            <>
              {exercise.isActive ? (
                showDeactivateConfirm ? (
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="md"
                      fullWidth
                      onClick={handleDeactivate}
                      disabled={isSaving}
                    >
                      <Trash2 size={18} />
                      Да, деактивировать
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => setShowDeactivateConfirm(false)}
                    >
                      Нет
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="md"
                    fullWidth
                    onClick={() => setShowDeactivateConfirm(true)}
                    className="!text-red-400"
                  >
                    <Trash2 size={18} />
                    Деактивировать
                  </Button>
                )
              ) : (
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={handleReactivate}
                  disabled={isSaving}
                >
                  Восстановить
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
