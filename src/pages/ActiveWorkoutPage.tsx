// src/pages/ActiveWorkoutPage.tsx

/**
 * Full active workout page.
 * Two modes:
 * 1. Active workout — exercise cards, nav grid, header, rest timer
 * 2. Post-finish — tab-based flow (Exercises review | Cardio | Pullups | Summary)
 *
 * After pressing "Завершить" and confirming, switches to post-finish mode.
 * Rest timer works globally across all tabs.
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
  PostWorkoutTabs,
  ExercisesReview,
} from '../components/workout';
import CardioStep from '../components/finish/CardioStep';
import PullupStep from '../components/finish/PullupStep';
import SummaryStep from '../components/finish/SummaryStep';
import type { PullupStepResult } from '../types';
import { pullupRepo } from '../db';
import { applyRunResult } from '../utils/runningProgram';
import { applyAndSaveDayResult } from '../utils/pullupProgram';

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
  const activeTab = useWorkoutStore((s) => s.activeTab);
  const finishWorkout = useWorkoutStore((s) => s.finishWorkout);
  const isCardioCompleted = useWorkoutStore((s) => s.isCardioCompleted);
  const treadmillSucceeded = useWorkoutStore((s) => s.treadmillSucceeded);
  const cardioType = useWorkoutStore((s) => s.cardioType);
  const pullupResult = useWorkoutStore((s) => s.pullupResult);
  const savedPullupResult = useWorkoutStore((s) => s.pullupResult);
  const savePullupResultToStore = useWorkoutStore((s) => s.savePullupResult);

  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  // Local state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelFinal, setShowCancelFinal] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState<number | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Refs for scrolling
  const exerciseRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Redirect to home if no active workout
  useEffect(() => {
    if (!isActive || !session) {
      navigate('/', { replace: true });
    }
  }, [isActive, session, navigate]);

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

  // ---- Post-finish handlers ----

  // CardioStep calls onNext when done (saved or skipped)
  const handleCardioNext = useCallback(() => {
    // No-op: data is already in store. User can freely switch tabs.
  }, []);

  // PullupStep calls onNext with result when completed
  const handlePullupNext = useCallback(
    (result: PullupStepResult) => {
      savePullupResultToStore(result);
    },
    [savePullupResultToStore]
  );

  // SummaryStep "Завершить" — save everything to DB
  const handleFinalSave = useCallback(
    async (weightAfter: number | null) => {
      setIsSaving(true);
      try {
        const finishedSession = await finishWorkout(weightAfter);

        if (finishedSession) {
          // Save pull-up logs to DB
          const resultToSave = pullupResult ?? savedPullupResult;
          if (resultToSave) {
            await pullupRepo.savePullupSession({
              workoutSessionId: finishedSession.id,
              pullupDay: resultToSave.dayNumber,
              effectiveDay: resultToSave.effectiveDay,
              sets: resultToSave.sets,
              totalReps: resultToSave.totalReps,
              skipped: resultToSave.skipped,
            });
          }

          // --- Apply program progressions AFTER successful save ---

          // Running program
          if (
            isCardioCompleted &&
            cardioType === 'treadmill_3km' &&
            treadmillSucceeded !== null
          ) {
            applyRunResult(treadmillSucceeded);
          }

          // Pull-up program
          if (resultToSave) {
            applyAndSaveDayResult({
              dayNumber: resultToSave.dayNumber,
              day5ActualDay: resultToSave.day5ActualDay,
              sets: resultToSave.sets,
              totalReps: resultToSave.totalReps,
              skipped: resultToSave.skipped,
            });
          }

          await refreshNextDayInfo();
          navigate(`/summary/${finishedSession.id}`, { replace: true });
        }
      } catch (error) {
        console.error('Failed to finish workout:', error);
      } finally {
        setIsSaving(false);
      }
    },
    [
      finishWorkout,
      pullupResult,
      savedPullupResult,
      isCardioCompleted,
      cardioType,
      treadmillSucceeded,
      refreshNextDayInfo,
      navigate,
    ]
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

  if (!session || !isActive) return null;

  const exercisesDone = exercises.filter(
    (e) => e.status === 'completed'
  ).length;
  const exercisesTotal = exercises.length;

  // =======================================
  // POST-FINISH MODE
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
          postFinish
        />

        {/* Tab bar */}
        <PostWorkoutTabs />

        {/* Tab content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-8">
          {activeTab === 'exercises' && <ExercisesReview />}
          {activeTab === 'cardio' && <CardioStep onNext={handleCardioNext} />}
          {activeTab === 'pullups' && (
            <PullupStep onNext={handlePullupNext} />
          )}
          {activeTab === 'summary' && (
            <SummaryStep
              onFinish={handleFinalSave}
              isSaving={isSaving}
              pullupResult={pullupResult}
            />
          )}
        </div>

        {/* Rest timer — works globally across all tabs */}
        <RestTimer />
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
