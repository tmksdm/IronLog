// src/pages/ActiveWorkoutPage.tsx

/**
 * Placeholder for active workout page.
 * Will be fully implemented in the next step.
 */

import { useNavigate } from 'react-router-dom';
import { useWorkoutStore } from '../stores/workoutStore';
import { Button } from '../components/ui';
import { getDayTypeColor } from '../theme';
import { useEffect } from 'react';

export function ActiveWorkoutPage() {
  const { session, isActive, exercises, cancelWorkout } = useWorkoutStore();
  const navigate = useNavigate();

  // Redirect to home if no active workout
  useEffect(() => {
    if (!isActive || !session) {
      navigate('/', { replace: true });
    }
  }, [isActive, session, navigate]);

  if (!session || !isActive) return null;

  const accentColor = getDayTypeColor(session.dayTypeId);
  const dayNames: Record<number, string> = { 1: 'Присед', 2: 'Тяга', 3: 'Жим' };

  const completedCount = exercises.filter((e) => e.status === 'completed').length;
  const skippedCount = exercises.filter((e) => e.status === 'skipped').length;

  const handleCancel = async () => {
    await cancelWorkout();
    const { useAppStore } = await import('../stores/appStore');
    await useAppStore.getState().refreshNextDayInfo();
    navigate('/', { replace: true });
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#121212] px-5 pt-6">
      <h1 className="text-2xl font-bold mb-2" style={{ color: accentColor }}>
        {dayNames[session.dayTypeId]}
      </h1>
      <p className="text-[#B0B0B0] mb-1">
        Направление: {session.direction === 'normal' ? 'прямой' : 'обратный'}
      </p>
      <p className="text-[#B0B0B0] mb-6">
        Упражнений: {exercises.length} | Выполнено: {completedCount} | Пропущено: {skippedCount}
      </p>

      {/* Exercise list preview */}
      <div className="flex flex-col gap-2 mb-8">
        {exercises.map((ae, idx) => (
          <div
            key={idx}
            className="bg-[#252525] rounded-xl p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              {ae.isPriority && (
                <span className="text-xs bg-orange-600 text-white px-1.5 py-0.5 rounded">
                  !!
                </span>
              )}
              <span className="text-white text-sm">{ae.exercise.name}</span>
            </div>
            <span
              className="text-xs font-semibold px-2 py-1 rounded"
              style={{
                color: '#fff',
                backgroundColor:
                  ae.status === 'completed'
                    ? '#4CAF50'
                    : ae.status === 'in_progress'
                    ? '#FF9800'
                    : ae.status === 'skipped'
                    ? '#F44336'
                    : '#555',
              }}
            >
              {ae.status === 'completed'
                ? 'Готово'
                : ae.status === 'in_progress'
                ? 'В процессе'
                : ae.status === 'skipped'
                ? 'Пропуск'
                : 'Ожидает'}
            </span>
          </div>
        ))}
      </div>

      <p className="text-center text-[#707070] text-sm mb-6">
        Полный экран тренировки будет в следующем обновлении
      </p>

      <Button variant="danger" fullWidth onClick={handleCancel}>
        Отменить тренировку
      </Button>
    </div>
  );
}
