// src/pages/ExerciseEditorPage.tsx

/**
 * Exercise editor page — view, add, edit, reorder, and deactivate exercises
 * grouped by day type (Squat / Pull / Bench).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { Card } from '../components/ui';
import {
  getAllExercisesByDayType,
  updateSortOrders,
} from '../db/repositories/exerciseRepository';
import { getDayTypeBgClass } from '../theme';
import type { Exercise, DayTypeId } from '../types';
import { ExerciseEditModal } from '../components/exercises/ExerciseEditModal';

const TABS: Array<{ id: DayTypeId; label: string }> = [
  { id: 1, label: 'Присед' },
  { id: 2, label: 'Тяга' },
  { id: 3, label: 'Жим' },
];

export function ExerciseEditorPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DayTypeId>(1);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const loadExercises = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAllExercisesByDayType(activeTab);
      setExercises(data);
    } catch (err) {
      console.error('Failed to load exercises:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  // Split into active and inactive for display
  const activeExercises = exercises.filter((e) => e.isActive);
  const inactiveExercises = exercises.filter((e) => !e.isActive);

  // Move exercise up/down within active list
  const handleMove = async (exerciseId: string, direction: 'up' | 'down') => {
    const idx = activeExercises.findIndex((e) => e.id === exerciseId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === activeExercises.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newList = [...activeExercises];
    const current = newList[idx]!;
    const swap = newList[swapIdx]!;
    newList[idx] = swap;
    newList[swapIdx] = current;

    // Assign new sort orders (1-based)
    const updates = newList.map((e, i) => ({ id: e.id, sortOrder: i + 1 }));

    // Optimistic update
    setExercises([
      ...newList.map((e, i) => ({ ...e, sortOrder: i + 1 })),
      ...inactiveExercises,
    ]);

    try {
      await updateSortOrders(updates);
    } catch (err) {
      console.error('Failed to reorder:', err);
      await loadExercises(); // Rollback
    }
  };

  const handleEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
  };

  const handleCreate = () => {
    setIsCreating(true);
  };

  const handleModalClose = () => {
    setEditingExercise(null);
    setIsCreating(false);
  };

  const handleSaved = () => {
    handleModalClose();
    loadExercises();
  };

  return (
    <div className="min-h-screen bg-[#121212] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#121212] px-5 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full active:bg-white/10"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Упражнения</h1>
        </div>

        {/* Day type tabs */}
        <div className="flex gap-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
                  ${isActive
                    ? `${getDayTypeBgClass(tab.id)} text-white`
                    : 'bg-[#252525] text-[#707070]'
                  }
                `}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Exercise list */}
      <div className="px-5 mt-3 space-y-2">
        {isLoading ? (
          <div className="text-center text-[#707070] py-12">Загрузка...</div>
        ) : (
          <>
            {/* Active exercises */}
            {activeExercises.map((exercise, index) => (
              <ExerciseRow
                key={exercise.id}
                exercise={exercise}
                index={index}
                totalActive={activeExercises.length}
                dayTypeId={activeTab}
                onEdit={() => handleEdit(exercise)}
                onMoveUp={() => handleMove(exercise.id, 'up')}
                onMoveDown={() => handleMove(exercise.id, 'down')}
              />
            ))}

            {/* Add button */}
            <button
              onClick={handleCreate}
              className="w-full py-4 rounded-2xl border-2 border-dashed border-[#333]
                         text-[#707070] flex items-center justify-center gap-2
                         active:bg-white/5 transition-colors mt-4"
            >
              <Plus size={20} />
              <span className="font-medium">Добавить упражнение</span>
            </button>

            {/* Inactive exercises */}
            {inactiveExercises.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm text-[#707070] mb-2 px-1">
                  Неактивные ({inactiveExercises.length})
                </h3>
                {inactiveExercises.map((exercise) => (
                  <InactiveExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    onEdit={() => handleEdit(exercise)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit / Create Modal */}
      <ExerciseEditModal
        isOpen={editingExercise !== null || isCreating}
        onClose={handleModalClose}
        onSaved={handleSaved}
        exercise={editingExercise}
        dayTypeId={activeTab}
      />
    </div>
  );
}

// --- Exercise row (active) ---

interface ExerciseRowProps {
  exercise: Exercise;
  index: number;
  totalActive: number;
  dayTypeId: DayTypeId;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ExerciseRow({
  exercise,
  index,
  totalActive,
  dayTypeId,
  onEdit,
  onMoveUp,
  onMoveDown,
}: ExerciseRowProps) {
  const weightText = exercise.hasAddedWeight && exercise.workingWeight !== null
    ? `${exercise.workingWeight} кг`
    : exercise.hasAddedWeight
    ? 'Вес не задан'
    : 'Без веса';

  return (
    <Card className="flex items-center gap-2 !p-3">
      {/* Reorder arrows */}
      <div className="flex flex-col items-center shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={index === 0}
          className={`p-1 rounded active:bg-white/10 ${index === 0 ? 'opacity-20' : ''}`}
        >
          <ChevronUp size={18} className="text-[#B0B0B0]" />
        </button>
        <GripVertical size={14} className="text-[#555] my-[-2px]" />
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={index === totalActive - 1}
          className={`p-1 rounded active:bg-white/10 ${index === totalActive - 1 ? 'opacity-20' : ''}`}
        >
          <ChevronDown size={18} className="text-[#B0B0B0]" />
        </button>
      </div>

      {/* Order number */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
                    text-xs font-bold ${getDayTypeBgClass(dayTypeId)} text-white`}
      >
        {index + 1}
      </div>

      {/* Exercise info — tap to edit */}
      <button
        onClick={onEdit}
        className="flex-1 text-left min-w-0 py-1 active:opacity-70"
      >
        <div className="text-white font-medium text-sm truncate">
          {exercise.name}
        </div>
        <div className="text-xs text-[#707070] mt-0.5">
          {weightText}
          <span className="mx-1.5">·</span>
          {exercise.maxRepsPerSet}×{exercise.numWorkingSets}
          {exercise.hasAddedWeight && (
            <>
              <span className="mx-1.5">·</span>
              ±{exercise.weightIncrement}
            </>
          )}
        </div>
      </button>
    </Card>
  );
}

// --- Inactive exercise row ---

interface InactiveExerciseRowProps {
  exercise: Exercise;
  onEdit: () => void;
}

function InactiveExerciseRow({ exercise, onEdit }: InactiveExerciseRowProps) {
  return (
    <button
      onClick={onEdit}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
                 bg-[#1A1A1A] mb-1.5 active:bg-[#222] text-left"
    >
      <div className="w-7 h-7 rounded-full bg-[#333] flex items-center justify-center shrink-0">
        <span className="text-xs text-[#555]">—</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[#555] font-medium text-sm truncate">
          {exercise.name}
        </div>
        <div className="text-xs text-[#444] mt-0.5">Неактивно</div>
      </div>
    </button>
  );
}
