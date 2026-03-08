// src/pages/HomePage.tsx

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { useWorkoutStore } from '../stores/workoutStore';
import { DayTypeCard, StartWorkoutModal, RestoreWorkoutModal } from '../components/home';
import { Button, LoadingScreen } from '../components/ui';
import type { WorkoutSession, DayTypeId } from '../types';
import { workoutRepo, workoutStateRepo } from '../db';
import { Dumbbell } from 'lucide-react';

export function HomePage() {
  const {
    dayTypes,
    nextDayTypeId,
    nextDirection,
    lastSession,
    isInitialized,
    isLoading,
    pendingRestore,
    clearPendingRestore,
    refreshNextDayInfo,
  } = useAppStore();

  const { startWorkout, restoreWorkout, isActive } = useWorkoutStore();
  const navigate = useNavigate();

  const [showStartModal, setShowStartModal] = useState(false);
  const [lastSessions, setLastSessions] = useState<Record<number, WorkoutSession | null>>({
    1: null,
    2: null,
    3: null,
  });

  // Load last session for each day type
  useEffect(() => {
    if (!isInitialized) return;

    async function loadLastSessions() {
      const sessions: Record<number, WorkoutSession | null> = { 1: null, 2: null, 3: null };
      for (const dt of [1, 2, 3] as DayTypeId[]) {
        sessions[dt] = await workoutRepo.getLastSessionByDayType(dt);
      }
      setLastSessions(sessions);
    }

    loadLastSessions();
  }, [isInitialized, lastSession]);

  // If workout is already active, redirect
  useEffect(() => {
    if (isActive) {
      navigate('/workout', { replace: true });
    }
  }, [isActive, navigate]);

  if (isLoading || !isInitialized) {
    return <LoadingScreen />;
  }

  const nextDayType = dayTypes.find((dt) => dt.id === nextDayTypeId);

  const handleStartWorkout = async (weightBefore: number | null) => {
    setShowStartModal(false);
    await startWorkout(nextDayTypeId, nextDirection, weightBefore);
    navigate('/workout');
  };

  const handleRestore = () => {
    if (pendingRestore) {
      restoreWorkout(pendingRestore);
      clearPendingRestore();
      navigate('/workout');
    }
  };

  const handleDiscardRestore = async () => {
    if (pendingRestore) {
      try {
        await workoutRepo.deleteWorkoutSession(pendingRestore.session.id);
      } catch (err) {
        console.error('Failed to delete orphaned session:', err);
      }
      await workoutStateRepo.clearWorkoutState();
      clearPendingRestore();
      refreshNextDayInfo();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#121212]">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <Dumbbell size={28} className="text-green-500" />
        <h1 className="text-2xl font-bold text-white">IronLog</h1>
      </header>

      {/* Main content */}
      <main className="flex-1 px-5 pb-24">
        <p className="text-sm text-[#B0B0B0] mb-3">Следующая тренировка</p>

        {/* Day type cards */}
        <div className="flex flex-col gap-3 mb-6">
          {dayTypes.map((dt) => (
            <DayTypeCard
              key={dt.id}
              dayType={dt}
              direction={nextDirection}
              lastSession={lastSessions[dt.id] ?? null}
              isNext={dt.id === nextDayTypeId}
            />
          ))}
        </div>

        <Button
          variant="primary"
          size="xl"
          fullWidth
          onClick={() => setShowStartModal(true)}
        >
          Начать тренировку
        </Button>
      </main>

      {/* Start workout modal */}
      {nextDayType && (
        <StartWorkoutModal
          isOpen={showStartModal}
          onClose={() => setShowStartModal(false)}
          onStart={handleStartWorkout}
          dayType={nextDayType}
          direction={nextDirection}
          lastSession={lastSession}
        />
      )}

      {/* Restore workout modal */}
      <RestoreWorkoutModal
        isOpen={!!pendingRestore}
        snapshot={pendingRestore}
        onRestore={handleRestore}
        onDiscard={handleDiscardRestore}
      />
    </div>
  );
}
