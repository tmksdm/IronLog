// src/components/finish/FinishWorkoutModal.tsx

/**
 * Multi-step finish workout modal (bottom sheet).
 * Step 1: Cardio → Step 2: Pull-ups → Step 3: Summary + save.
 *
 * Data preservation strategy:
 * - Cardio data lives in workoutStore (persisted to snapshot)
 * - Pullup result is saved to workoutStore snapshot after completion
 * - On open, auto-advances to the appropriate step based on saved data
 * - Backdrop clicks are always ignored
 * - Close button hidden during pull-ups (no way to save partial progress)
 * - Close button shows confirmation on steps 1 and 3 if data was entered
 *
 * IMPORTANT: All program progression (running + pullups) is applied HERE
 * in handleFinish(), AFTER the workout is successfully saved to DB.
 * This prevents stale progression if a test workout is later deleted.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useAppStore } from '../../stores/appStore';
import CardioStep from './CardioStep';
import PullupStep from './PullupStep';
import type { PullupStepResult } from '../../types';
import SummaryStep from './SummaryStep';
import { pullupRepo } from '../../db';
import { applyRunResult } from '../../utils/runningProgram';
import { applyAndSaveDayResult } from '../../utils/pullupProgram';
import { X } from 'lucide-react';

interface FinishWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FinishWorkoutModal({ isOpen, onClose }: FinishWorkoutModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [pullupResult, setPullupResult] = useState<PullupStepResult | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const navigate = useNavigate();

  const finishWorkout = useWorkoutStore((s) => s.finishWorkout);
  const session = useWorkoutStore((s) => s.session);
  const isCardioCompleted = useWorkoutStore((s) => s.isCardioCompleted);
  const treadmillSucceeded = useWorkoutStore((s) => s.treadmillSucceeded);
  const cardioType = useWorkoutStore((s) => s.cardioType);
  const savedPullupResult = useWorkoutStore((s) => s.pullupResult);
  const savePullupResultToStore = useWorkoutStore((s) => s.savePullupResult);
  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  // Determine the correct starting step based on already-saved data
  const determineStep = useCallback((): 1 | 2 | 3 => {
    if (savedPullupResult || pullupResult) return 3;
    if (isCardioCompleted) return 2;
    return 1;
  }, [savedPullupResult, pullupResult, isCardioCompleted]);

  const [step, setStep] = useState<1 | 2 | 3>(() => determineStep());

  // When modal opens, restore pullup result from snapshot and set correct step
  useEffect(() => {
    if (isOpen) {
      if (savedPullupResult && !pullupResult) {
        setPullupResult(savedPullupResult);
      }
      setStep(determineStep());
      setShowCloseConfirm(false);
    }
  }, [isOpen, savedPullupResult, pullupResult, determineStep]);

  if (!isOpen || !session) return null;

  // Check if user has entered any data worth protecting
  const hasEnteredData = isCardioCompleted || !!pullupResult || !!savedPullupResult;

  // On step 2 (pullups in progress), hide close button entirely —
  // partial pullup progress can't be saved, so closing would lose data
  const canClose = step !== 2;

  const handleCardioNext = () => {
    setStep(2);
  };

  const handlePullupNext = (result: PullupStepResult) => {
    setPullupResult(result);
    savePullupResultToStore(result);
    setStep(3);
  };

  const handleBackToCardio = () => {
    setStep(1);
  };

  const handleBackToPullups = () => {
    setStep(2);
  };

  const handleFinish = async (weightAfter: number | null) => {
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

        // Running program: apply result if treadmill cardio was completed
        if (isCardioCompleted && cardioType === 'treadmill_3km' && treadmillSucceeded !== null) {
          applyRunResult(treadmillSucceeded);
        }

        // Pull-up program: apply day result (progression/regression/advance)
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
  };

  const handleCloseAttempt = () => {
    if (isSaving || !canClose) return;
    if (hasEnteredData) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmClose = () => {
    setShowCloseConfirm(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop — no onClick to prevent accidental dismissal */}
      <div className="absolute inset-0 bg-black/70 animate-fade-in" />

      {/* Bottom sheet */}
      <div className="relative w-full max-w-120 bg-[#1E1E1E] rounded-t-2xl pb-8 pt-4 animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Drag handle */}
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 rounded-full bg-[#555555]" />
        </div>

        {/* Close button — hidden during pullups (step 2) */}
        {canClose && (
          <button
            onClick={handleCloseAttempt}
            disabled={isSaving}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
          >
            <X size={18} className="text-[#B0B0B0]" />
          </button>
        )}

        {/* Close confirmation overlay */}
        {showCloseConfirm && (
          <div className="absolute inset-0 z-10 bg-[#1E1E1E]/95 rounded-t-2xl flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 px-6 max-w-72">
              <p className="text-base text-white font-semibold text-center">
                Закрыть окно?
              </p>
              <p className="text-sm text-[#B0B0B0] text-center">
                Данные сохранены — вы продолжите с того же места, нажав «Завершить» снова
              </p>
              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => setShowCloseConfirm(false)}
                  className="flex-1 py-3.5 rounded-xl bg-[#4CAF50] text-white font-semibold text-base active:bg-[#388E3C] transition-colors"
                >
                  Остаться
                </button>
                <button
                  onClick={handleConfirmClose}
                  className="flex-1 py-3.5 rounded-xl bg-[#333333] text-[#B0B0B0] font-semibold text-base active:bg-[#444444] transition-colors"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-2 mb-4 mt-1">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                step === s ? 'bg-[#4CAF50]' : 'bg-[#555555]'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        {step === 1 && <CardioStep onNext={handleCardioNext} />}
        {step === 2 && (
          <PullupStep onNext={handlePullupNext} onBack={handleBackToCardio} />
        )}
        {step === 3 && (
          <SummaryStep
            onFinish={handleFinish}
            onBack={handleBackToPullups}
            isSaving={isSaving}
            pullupResult={pullupResult}
          />
        )}
      </div>
    </div>
  );
}
