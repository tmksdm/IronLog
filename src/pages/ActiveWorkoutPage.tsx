// src/pages/ActiveWorkoutPage.tsx

/**
 * Full active workout page.
 * Two modes:
 * 1. Active workout — exercise cards, nav grid, header, rest timer
 * 2. Post-finish — strength-only summary with body-weight-after input
 *
 * After pressing "Завершить" and confirming, switches to post-finish summary.
 * Cardio and pull-ups are standalone activities now (launched from Home), so
 * they are NOT part of the workout flow anymore (Stage 4).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkoutStore } from '../stores/workoutStore';
import { useAppStore } from '../stores/appStore';
import {
  WorkoutHeader,
  ExerciseNavGrid,
  ExerciseCard,
  ExerciseNameEditModal,
  RestTimer,
  ConfirmModal,
  ExercisesReview,
  BodyWeightEditModal,
} from '../components/workout';
import { LoadingScreen } from '../components/ui';
import FinishSummary from '../components/workout/FinishSummary';

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
  const postFinish = useWorkoutStore((s) => s.postFinish);
  const enterPostFinish = useWorkoutStore((s) => s.enterPostFinish);
  const finishWorkout = useWorkoutStore((s) => s.finishWorkout);
  const updateWeightBefore = useWorkoutStore((s) => s.updateWeightBefore);
  const renameExercise = useWorkoutStore((s) => s.renameExercise);

  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  // Local state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelFinal, setShowCancelFinal] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState<number | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showWeightEdit, setShowWeightEdit] = useState(false);
  const [renamingExerciseIndex, setRenamingExerciseIndex] = useState<number | null>(null);

  // Refs for scrolling
  const exerciseRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Redirect to home if no active workout. While the final save is in
  // progress, the page owns navigation to the summary and must not race it.
  useEffect(() => {
    if ((!isActive || !session) && !isSaving) {
      navigate('/', { replace: true });
    }
  }, [isActive, session, isSaving, navigate]);

  // ---- Active workout handlers ----

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
    recordEndTime();
    enterPostFinish();
  }, [recordEndTime, enterPostFinish]);

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

  // ---- Post-finish: save everything to DB (strength only) ----

  const handleFinalSave = useCallback(
    async (weightAfter: number | null) => {
      setIsSaving(true);
      try {
        const finishedSession = await finishWorkout(weightAfter);
        if (finishedSession) {
          await refreshNextDayInfo();
          navigate(`/summary/${finishedSession.id}`, { replace: true });
        }
      } catch (error) {
        console.error('Failed to finish workout:', error);
      } finally {
        setIsSaving(false);
      }
    },
    [finishWorkout, refreshNextDayInfo, navigate]
  );

  const handleWeightBeforeSave = useCallback(
    async (weightBefore: number | null) => {
      await updateWeightBefore(weightBefore);
    },
    [updateWeightBefore]
  );

  const handleExerciseNameSave = useCallback(
    async (name: string) => {
      if (renamingExerciseIndex === null) return;
      await renameExercise(renamingExerciseIndex, name);
    },
    [renameExercise, renamingExerciseIndex]
  );

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

  // finishWorkout marks the workout inactive before the summary navigation.
  // Keep a visible transition instead of briefly rendering the app background.
  if (isSaving && (!session || !isActive)) return <LoadingScreen />;
  if (!session || !isActive) return null;

  const exercisesDone = exercises.filter((e) => e.status === 'completed').length;
  const exercisesTotal = exercises.length;

  // =======================================
  // POST-FINISH MODE (strength-only summary)
  // =======================================
  if (postFinish) {
    return (
      <div className="flex flex-col h-screen bg-[#121212]">
        {/* Header — same as active workout, but finish button hidden */}
        <WorkoutHeader
          session={session}
          exercisesDone={exercisesDone}
          exercisesTotal={exercisesTotal}
          onFinish={() => {}} // No-op in post-finish
          onCancel={() => {}} // No-op in post-finish
          onEditWeight={() => setShowWeightEdit(true)}
          postFinish
        />

        {/* Content: exercise review + summary with weight input */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-8">
          <ExercisesReview />
          <FinishSummary onFinish={handleFinalSave} isSaving={isSaving} />
        </div>

        {/* Rest timer (in case a rest is still running) */}
        <RestTimer />
        <BodyWeightEditModal
          isOpen={showWeightEdit}
          weightBefore={session.weightBefore}
          showWeightAfter={false}
          onClose={() => setShowWeightEdit(false)}
          onSave={handleWeightBeforeSave}
        />
      </div>
    );
  }

  // =======================================
  // ACTIVE WORKOUT MODE
  // =======================================
  return (
    <div className="flex flex-col h-screen bg-[#121212]">
      {/* Fixed header */}
      <WorkoutHeader
        session={session}
        exercisesDone={exercisesDone}
        exercisesTotal={exercisesTotal}
        onFinish={handleFinishPress}
        onCancel={handleCancelPress}
        onEditWeight={() => setShowWeightEdit(true)}
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
            <div key={ae.exercise.id} ref={(el) => setExerciseRef(idx, el)}>
              <ExerciseCard
                activeExercise={ae}
                exerciseIndex={idx}
                dayTypeId={session.dayTypeId}
                onCompleteSet={handleCompleteSet}
                onUpdateSetReps={handleUpdateSetReps}
                onRename={setRenamingExerciseIndex}
                onSkip={handleSkipRequest}
                onUnskip={handleUnskip}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Rest timer overlay / bubble */}
      <RestTimer />

      <BodyWeightEditModal
        isOpen={showWeightEdit}
        weightBefore={session.weightBefore}
        showWeightAfter={false}
        onClose={() => setShowWeightEdit(false)}
        onSave={handleWeightBeforeSave}
      />

      <ExerciseNameEditModal
        isOpen={renamingExerciseIndex !== null}
        name={renamingExerciseIndex === null
          ? ''
          : exercises[renamingExerciseIndex]?.exercise.name ?? ''}
        onClose={() => setRenamingExerciseIndex(null)}
        onSave={handleExerciseNameSave}
      />

      {/* Cancel confirmation — step 1 */}
      <ConfirmModal
        isOpen={showCancelConfirm}
        title="Отменить тренировку?"
        message="Все данные этой тренировки будут потеряны."
        confirmText="Да, отменить"
        cancelText="Нет, продолжить"
        onConfirm={handleCancelFirst}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* Cancel confirmation — step 2 (final) */}
      <ConfirmModal
        isOpen={showCancelFinal}
        title="Точно отменить?"
        message="Это действие необратимо. Тренировка будет удалена."
        confirmText="Удалить"
        cancelText="Вернуться"
        onConfirm={handleCancelFinal}
        onCancel={() => setShowCancelFinal(false)}
      />

      {/* Finish confirmation */}
      <ConfirmModal
        isOpen={showFinishConfirm}
        title="Завершить тренировку?"
        message="Таймер будет остановлен."
        confirmText="Завершить"
        cancelText="Отмена"
        onConfirm={handleFinishConfirm}
        onCancel={() => setShowFinishConfirm(false)}
      />

      {/* Skip confirmation */}
      <ConfirmModal
        isOpen={showSkipConfirm !== null}
        title="Пропустить упражнение?"
        message="Оно станет приоритетным в следующую тренировку."
        confirmText="Пропустить"
        cancelText="Отмена"
        onConfirm={handleSkipConfirm}
        onCancel={() => setShowSkipConfirm(null)}
      />
    </div>
  );
}
