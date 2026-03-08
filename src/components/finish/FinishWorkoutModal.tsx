// src/components/finish/FinishWorkoutModal.tsx

/**
 * Multi-step finish workout modal (bottom sheet).
 * Step 1: Cardio input → Step 2: Summary + weight after + save.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useAppStore } from '../../stores/appStore';
import CardioStep from './CardioStep';
import SummaryStep from './SummaryStep';
import { X } from 'lucide-react';

interface FinishWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FinishWorkoutModal({ isOpen, onClose }: FinishWorkoutModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  const finishWorkout = useWorkoutStore((s) => s.finishWorkout);
  const session = useWorkoutStore((s) => s.session);
  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  if (!isOpen || !session) return null;

  const handleCardioNext = () => {
    setStep(2);
  };

  const handleBackToCardio = () => {
    setStep(1);
  };

  const handleFinish = async (weightAfter: number | null) => {
    setIsSaving(true);
    try {
      const finishedSession = await finishWorkout(weightAfter);
      await refreshNextDayInfo();
      if (finishedSession) {
        // TODO: navigate to WorkoutSummaryPage when it's built
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error('Failed to finish workout:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    setStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 animate-fade-in"
        onClick={handleClose}
      />

      {/* Bottom sheet */}
      <div className="relative w-full max-w-[480px] bg-[#1E1E1E] rounded-t-2xl pb-8 pt-4 animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Drag handle */}
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 rounded-full bg-[#555555]" />
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          disabled={isSaving}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#2A2A2A] flex items-center justify-center active:bg-[#333333] transition-colors"
        >
          <X size={18} className="text-[#B0B0B0]" />
        </button>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-2 mb-4 mt-1">
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              step === 1 ? 'bg-[#4CAF50]' : 'bg-[#555555]'
            }`}
          />
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              step === 2 ? 'bg-[#4CAF50]' : 'bg-[#555555]'
            }`}
          />
        </div>

        {/* Step content */}
        {step === 1 && <CardioStep onNext={handleCardioNext} />}
        {step === 2 && (
          <SummaryStep
            onFinish={handleFinish}
            onBack={handleBackToCardio}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}
