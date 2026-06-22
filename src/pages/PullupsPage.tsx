// src/pages/PullupsPage.tsx

/**
 * Standalone pull-up screen.
 * Reached from the home screen ("Турник" button), NOT the bottom nav.
 *
 * Crash resilience: the in-progress state is its OWN snapshot in the
 * `pullup_active_state` table (separate from the workout snapshot).
 * On entry, if an unfinished snapshot exists, the user is asked to
 * continue or start over.
 *
 * On save: writes a standalone pullup_logs entry (workout_session_id = null,
 * date = now), applies the pull-up program progression, clears the snapshot,
 * and pushes to cloud in the background.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PullupCore, buildInitialPullupState } from '../components/finish';
import { Button, LoadingScreen } from '../components/ui';
import { ConfirmModal } from '../components/workout';
import { pullupRepo, pullupStateRepo } from '../db';
import { applyAndSaveDayResult } from '../utils/pullupProgram';
import { getPullupDayName } from '../utils/pullupProgram';
import { pushToCloud } from '../lib/sync';
import type { PullupStepResult, PullupInProgressState } from '../types';
import { ChevronLeft, Check, SkipForward } from 'lucide-react';

type Phase = 'loading' | 'restore-prompt' | 'active' | 'done';

export function PullupsPage() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('loading');
  const [restoreState, setRestoreState] = useState<PullupInProgressState | null>(null);
  const [coreInitial, setCoreInitial] = useState<PullupInProgressState | null>(null);
  const [result, setResult] = useState<PullupStepResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Guard so the persist effect doesn't overwrite the snapshot before restore decision
  const savingRef = useRef(false);

  // ---- On mount: check for an unfinished snapshot ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await pullupStateRepo.loadPullupState();
        if (cancelled) return;
        if (snapshot?.inProgress && snapshot.inProgress.started) {
          // Only offer to restore a session that was actually started
          setRestoreState(snapshot.inProgress);
          setPhase('restore-prompt');
        } else {
          setCoreInitial(buildInitialPullupState());
          setPhase('active');
        }
      } catch (err) {
        console.error('Failed to load pullup snapshot:', err);
        if (!cancelled) {
          setCoreInitial(buildInitialPullupState());
          setPhase('active');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Persist in-progress state for crash resilience ----
  const handleStateChange = useCallback((state: PullupInProgressState) => {
    if (savingRef.current) return;
    // Fire-and-forget; the repository serializes writes via saveToStore.
    pullupStateRepo
      .savePullupState({ inProgress: state, updatedAt: new Date().toISOString() })
      .catch((err) => console.error('Failed to persist pullup snapshot:', err));
  }, []);

  // ---- Restore prompt actions ----
  const handleRestore = useCallback(() => {
    setCoreInitial(restoreState);
    setRestoreState(null);
    setPhase('active');
  }, [restoreState]);

  const handleDiscardRestore = useCallback(async () => {
    savingRef.current = true;
    try {
      await pullupStateRepo.clearPullupState();
    } catch (err) {
      console.error('Failed to clear pullup snapshot:', err);
    }
    savingRef.current = false;
    setRestoreState(null);
    setCoreInitial(buildInitialPullupState());
    setPhase('active');
  }, []);

  // ---- Save a finished/skipped session ----
  const saveSession = useCallback(
    async (res: PullupStepResult) => {
      // Guard against double-invocation: savingRef is synchronous (set immediately),
      // unlike the isSaving state which updates on the next render. The setTimeout
      // in PullupCore can fire onComplete more than once before isSaving flips.
      if (savingRef.current) return;
      savingRef.current = true;
      setIsSaving(true);
      try {
        // Standalone entry: no workout session, date = now.
        await pullupRepo.savePullupSession({
          workoutSessionId: null,
          pullupDay: res.dayNumber,
          effectiveDay: res.effectiveDay,
          sets: res.sets,
          totalReps: res.totalReps,
          skipped: res.skipped,
        });

        // Apply pull-up program progression on save (skip moves nothing  the
        // progression logic itself ignores skipped results, but we still call it
        // so the day advances exactly like the in-workout flow).
        applyAndSaveDayResult({
          dayNumber: res.dayNumber,
          day5ActualDay: res.day5ActualDay,
          sets: res.sets,
          totalReps: res.totalReps,
          skipped: res.skipped,
        });

        // Clear the crash-resilience snapshot  session is done.
        await pullupStateRepo.clearPullupState();

        // Background cloud backup (silent; may need VPN  fine if it fails).
        pushToCloud().catch((err) =>
          console.error('Cloud push after standalone pullups failed:', err)
        );

        setResult(res);
        setPhase('done');
      } catch (err) {
        console.error('Failed to save standalone pullups:', err);
        savingRef.current = false;
        setIsSaving(false);
      }
    },
    [isSaving]
  );

  const handleComplete = useCallback(
    (res: PullupStepResult) => {
      saveSession(res);
    },
    [saveSession]
  );

  const handleSkip = useCallback(
    (res: PullupStepResult) => {
      saveSession(res);
    },
    [saveSession]
  );

  // ---- Render ----

  return (
    <div className="flex flex-col min-h-screen bg-[#121212]">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-xl bg-[#1E1E1E] flex items-center justify-center active:bg-[#2A2A2A] transition-colors"
        >
          <ChevronLeft size={24} className="text-white" />
        </button>
        <h1 className="text-xl font-bold text-white">Турник</h1>
      </header>

      <main className="flex-1 px-2 pb-10">
        {phase === 'loading' && <LoadingScreen />}

        {phase === 'active' && (
          <PullupCore
            initialState={coreInitial}
            onStateChange={handleStateChange}
            onComplete={handleComplete}
            onSkip={handleSkip}
          />
        )}

        {phase === 'done' && result && (
          <DoneView result={result} onHome={() => navigate('/')} />
        )}
      </main>

      {/* Restore prompt */}
      <ConfirmModal
        isOpen={phase === 'restore-prompt'}
        title="Продолжить подтягивания?"
        message="Найдена незавершённая сессия турника. Продолжить с того места или начать заново?"
        confirmText="Продолжить"
        cancelText="Начать заново"
        onConfirm={handleRestore}
        onCancel={handleDiscardRestore}
      />
    </div>
  );
}

// ---- Done view ----

function DoneView({
  result,
  onHome,
}: {
  result: PullupStepResult;
  onHome: () => void;
}) {
  const dayName = getPullupDayName(
    result.dayNumber,
    result.day5ActualDay ?? undefined
  );

  if (result.skipped) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 px-4">
        <div className="w-16 h-16 rounded-full bg-[#2A2A2A] flex items-center justify-center">
          <SkipForward size={32} className="text-[#707070]" />
        </div>
        <p className="text-lg font-semibold text-white">Подтягивания пропущены</p>
        <p className="text-sm text-[#707070]">{dayName}</p>
        <Button variant="primary" size="lg" fullWidth onClick={onHome}>
          На главную
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-10 px-4">
      <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center">
        <Check size={32} className="text-[#4CAF50]" />
      </div>
      <p className="text-lg font-semibold text-white">Подтягивания выполнены</p>
      <p className="text-sm text-[#B0B0B0]">{dayName}</p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        <div className="bg-[#252525] rounded-xl p-3 flex flex-col items-center gap-1">
          <span className="text-xs text-[#B0B0B0]">Подходов</span>
          <span className="text-xl font-bold text-white">{result.sets.length}</span>
        </div>
        <div className="bg-[#252525] rounded-xl p-3 flex flex-col items-center gap-1">
          <span className="text-xs text-[#B0B0B0]">Всего повт.</span>
          <span className="text-xl font-bold text-[#FF9800]">{result.totalReps}</span>
        </div>
      </div>

      {result.sets.length > 0 && (
        <div className="w-full max-w-xs">
          <div className="flex flex-wrap gap-2 justify-center">
            {result.sets.map((s, i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-full flex flex-col items-center justify-center text-xs font-bold ${
                  s.succeeded ? 'bg-[#4CAF50] text-white' : 'bg-[#F44336] text-white'
                }`}
              >
                <span>{s.reps}</span>
                {s.grip && (
                  <span className="text-[8px] opacity-70">
                    {s.grip === 'normal' ? 'О' : s.grip === 'reverse' ? 'Р' : 'Ш'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Button variant="primary" size="lg" fullWidth onClick={onHome}>
        На главную
      </Button>
    </div>
  );
}
