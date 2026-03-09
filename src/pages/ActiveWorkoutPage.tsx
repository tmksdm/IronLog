// src/pages/ActiveWorkoutPage.tsx

/**
 * Full active workout page.
 * Vertical scrollable list of exercise cards with navigation grid,
 * header with timer, rest timer overlay, finish modal, and cancel actions.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkoutStore } from '../stores/workoutStore';
import { useAppStore } from '../stores/appStore';
import {
  WorkoutHeader,
  ExerciseNavGrid,
  ExerciseCard,
  RestTimer,
  ConfirmModal,
} from '../components/workout';
import { FinishWorkoutModal } from '../components/finish';

export function ActiveWorkoutPage() {
  const navigate = useNavigate();

  // Store subscriptions
  const session = useWorkoutStore((s) => s.session);
  const isActive = useWorkoutStore((s) => s.isActive);
  const exercises = useWorkoutStore((s) => s.exercises);
  const currentExerciseIndex = useWorkoutStore((s) => s.currentExerciseIndex);
  const setCurrentExercise = useWorkoutStore((s) => s.setCurrentExercise);
  const completeSet = useWorkoutStore((s) => s.completeSet);
  const updateSetReps = useWorkoutStore((s) => s.updateSetReps);
  const skipExercise = useWorkoutStore((s) => s.skipExercise);
  const unskipExercise = useWorkoutStore((s) => s.unskipExercise);
  const cancelWorkout = useWorkoutStore((s) => s.cancelWorkout);
  const startRestTimer = useWorkoutStore((s) => s.startRestTimer);
  const recordEndTime = useWorkoutStore((s) => s.recordEndTime);

  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  // Local state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelFinal, setShowCancelFinal] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState<number | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);

  // Refs for scrolling
  const exerciseRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Redirect to home if no active workout
  useEffect(() => {
    if (!isActive || !session) {
      navigate('/', { replace: true });
    }
  }, [isActive, session, navigate]);

  // ---- Handlers ----

  const handleCompleteSet = useCallback(
    (exerciseIndex: number, setIndex: number, actualReps?: number) => {
      completeSet(exerciseIndex, setIndex, actualReps);
      startRestTimer();
    },
    [completeSet, startRestTimer]
  );

  const handleUpdateSetReps = useCallback(
    (exerciseIndex: number, setIndex: number, reps: number) => {
      updateSetReps(exerciseIndex, setIndex, reps);
    },
    [updateSetReps]
  );

  const handleSkipRequest = useCallback((exerciseIndex: number) => {
    setShowSkipConfirm(exerciseIndex);
  }, []);

  const handleSkipConfirm = useCallback(() => {
    if (showSkipConfirm !== null) {
      skipExercise(showSkipConfirm);

      // Auto-advance to next non-completed/non-skipped exercise
      const nextIdx = exercises.findIndex(
        (e, i) =>
          i > showSkipConfirm! &&
          e.status !== 'completed' &&
          e.status !== 'skipped'
      );
      if (nextIdx !== -1) {
        setCurrentExercise(nextIdx);
        scrollToExercise(nextIdx);
      }
    }
    setShowSkipConfirm(null);
  }, [showSkipConfirm, skipExercise, exercises, setCurrentExercise]);

  const handleUnskip = useCallback(
    (exerciseIndex: number) => {
      unskipExercise(exerciseIndex);
    },
    [unskipExercise]
  );

  const handleSelectExercise = useCallback(
    (index: number) => {
      setCurrentExercise(index);
      scrollToExercise(index);
    },
    [setCurrentExercise]
  );

  const handleFinishPress = useCallback(() => {
    setShowFinishConfirm(true);
  }, []);

  const handleFinishConfirm = useCallback(() => {
    setShowFinishConfirm(false);
    recordEndTime(); // Record end time only after confirmation
    setIsFinishModalOpen(true);
  }, [recordEndTime]);


  const handleFinishModalClose = useCallback(() => {
    setIsFinishModalOpen(false);
  }, []);

  const handleCancelPress = useCallback(() => {
    setShowCancelConfirm(true);
  }, []);

  const handleCancelFirst = useCallback(() => {
    setShowCancelConfirm(false);
    setShowCancelFinal(true);
  }, []);

  const handleCancelFinal = useCallback(async () => {
    setShowCancelFinal(false);
    await cancelWorkout();
    await refreshNextDayInfo();
    navigate('/', { replace: true });
  }, [cancelWorkout, refreshNextDayInfo, navigate]);

  // ---- Scroll helpers ----

  const scrollToExercise = (index: number) => {
    const el = exerciseRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const setExerciseRef = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      if (el) {
        exerciseRefs.current.set(index, el);
      } else {
        exerciseRefs.current.delete(index);
      }
    },
    []
  );

  // ===== EARLY RETURN (all hooks above) =====

  if (!session || !isActive) return null;

  const exercisesDone = exercises.filter(
    (e) => e.status === 'completed'
  ).length;
  const exercisesTotal = exercises.length;

  return (
    <div className="flex flex-col h-screen bg-[#121212]">
      {/* Fixed header */}
      <WorkoutHeader
        session={session}
        exercisesDone={exercisesDone}
        exercisesTotal={exercisesTotal}
        onFinish={handleFinishPress}
        onCancel={handleCancelPress}
      />

      {/* Navigation grid */}
      <ExerciseNavGrid
        exercises={exercises}
        currentIndex={currentExerciseIndex}
        onSelect={handleSelectExercise}
      />

      {/* Scrollable exercise cards */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 pb-24"
      >
        <div className="flex flex-col gap-4 py-4">
          {exercises.map((ae, idx) => (
            <div
              key={ae.exercise.id}
              ref={(el) => setExerciseRef(idx, el)}
            >
              <ExerciseCard
                activeExercise={ae}
                exerciseIndex={idx}
                dayTypeId={session.dayTypeId}
                onCompleteSet={handleCompleteSet}
                onUpdateSetReps={handleUpdateSetReps}
                onSkip={handleSkipRequest}
                onUnskip={handleUnskip}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Rest timer overlay / bubble */}
      <RestTimer />

      {/* Finish workout modal */}
      <FinishWorkoutModal
        isOpen={isFinishModalOpen}
        onClose={handleFinishModalClose}
      />

      {/* Cancel confirmation — step 1 */}
      <ConfirmModal
        isOpen={showCancelConfirm}
        title="Отменить тренировку?"
        message="Все записанные подходы будут удалены."
        confirmText="Да, отменить"
        cancelText="Нет, продолжить"
        onConfirm={handleCancelFirst}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* Cancel confirmation — step 2 (final) */}
      <ConfirmModal
        isOpen={showCancelFinal}
        title="Точно отменить?"
        message="Последний шанс — тренировка будет удалена безвозвратно."
        confirmText="Удалить"
        cancelText="Нет"
        onConfirm={handleCancelFinal}
        onCancel={() => setShowCancelFinal(false)}
      />

      {/* Finish confirmation */}
      <ConfirmModal
        isOpen={showFinishConfirm}
        title="Завершить тренировку?"
        message="Время тренировки будет зафиксировано."
        confirmText="Завершить"
        cancelText="Отмена"
        onConfirm={handleFinishConfirm}
        onCancel={() => setShowFinishConfirm(false)}
      />


      {/* Skip confirmation */}
      <ConfirmModal
        isOpen={showSkipConfirm !== null}
        title="Пропустить упражнение?"
        message="Можно вернуть в работу в любой момент."
        confirmText="Пропустить"
        cancelText="Отмена"
        onConfirm={handleSkipConfirm}
        onCancel={() => setShowSkipConfirm(null)}
      />
    </div>
  );
}
