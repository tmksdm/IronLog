// src/pages/FinishWorkoutPage.tsx

/**
 * Temporary placeholder for the finish workout flow.
 * Will be replaced with full FinishWorkoutModal implementation.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkoutStore } from '../stores/workoutStore';
import { useAppStore } from '../stores/appStore';
import { Button, NumberStepper } from '../components/ui';

export function FinishWorkoutPage() {
  const navigate = useNavigate();
  const session = useWorkoutStore((s) => s.session);
  const exercises = useWorkoutStore((s) => s.exercises);
  const finishWorkout = useWorkoutStore((s) => s.finishWorkout);
  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  const [weightAfter, setWeightAfter] = useState(
    session?.weightBefore ?? 80
  );
  const [isSaving, setIsSaving] = useState(false);

  const exercisesDone = exercises.filter((e) => e.status === 'completed').length;
  const exercisesSkipped = exercises.filter((e) => e.status === 'skipped').length;
  const exercisesNotStarted = exercises.filter(
    (e) => e.status === 'not_started' || e.status === 'in_progress'
  ).length;

  const handleFinish = useCallback(async () => {
    setIsSaving(true);
    const finishedSession = await finishWorkout(weightAfter);
    await refreshNextDayInfo();
    setIsSaving(false);

    if (finishedSession) {
      // For now, just go home. WorkoutSummaryPage will be added later.
      navigate('/', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [finishWorkout, weightAfter, refreshNextDayInfo, navigate]);

  const handleBack = useCallback(() => {
    navigate('/workout', { replace: true });
  }, [navigate]);

  if (!session) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#121212] px-5 pt-6">
      <h1 className="text-2xl font-bold text-white mb-6">Завершение тренировки</h1>

      {/* Summary */}
      <div className="bg-[#252525] rounded-2xl p-4 mb-6">
        <div className="flex justify-between mb-2">
          <span className="text-[#B0B0B0]">Выполнено</span>
          <span className="text-green-400 font-bold">{exercisesDone}</span>
        </div>
        <div className="flex justify-between mb-2">
          <span className="text-[#B0B0B0]">Пропущено</span>
          <span className="text-red-400 font-bold">{exercisesSkipped}</span>
        </div>
        {exercisesNotStarted > 0 && (
          <div className="flex justify-between">
            <span className="text-[#B0B0B0]">Не начато</span>
            <span className="text-[#707070] font-bold">{exercisesNotStarted}</span>
          </div>
        )}
      </div>

      {/* Body weight after */}
      <div className="mb-8">
        <NumberStepper
          label="Вес после тренировки"
          value={weightAfter}
          onChange={setWeightAfter}
          min={30}
          max={200}
          step={0.25}
          unit="кг"
          formatValue={(v) => v.toFixed(2).replace('.', ',')}
          size="lg"
        />
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 mt-auto pb-8">
        <Button
          variant="primary"
          size="xl"
          fullWidth
          onClick={handleFinish}
          disabled={isSaving}
        >
          {isSaving ? 'Сохранение...' : 'Завершить тренировку'}
        </Button>

        <Button variant="ghost" fullWidth onClick={handleBack}>
          Вернуться к тренировке
        </Button>
      </div>
    </div>
  );
}
