// src/pages/RunningPage.tsx

/**
 * Standalone running screen.
 * Reached from the home screen ("Бег" button), NOT the bottom nav.
 *
 * Saves a standalone cardio_log (workout_session_id = null, date = now),
 * then applies the running program progression. Shows a brief confirmation.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RunningCore } from '../components/finish';
import { Button } from '../components/ui';
import { workoutRepo } from '../db';
import { applyRunResult } from '../utils/runningProgram';
import { pushToCloud } from '../lib/sync';
import { formatTimeMMSS } from '../utils/format';
import { ChevronLeft, Check } from 'lucide-react';

export function RunningPage() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState<{
    seconds: number;
    succeeded: boolean | null;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (totalSeconds: number, succeeded: boolean | null) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Standalone entry: no workout session, date = now.
      await workoutRepo.createCardioLog({
        workoutSessionId: null,
        type: 'treadmill_3km',
        durationSeconds: totalSeconds,
        count: null,
        succeeded,
      });

      // Apply running program progression only on a real save with a result.
      if (succeeded !== null) {
        applyRunResult(succeeded);
      }

      // Background cloud backup (silent, may need VPN — fine if it fails).
      pushToCloud().catch((err) =>
        console.error('Cloud push after standalone run failed:', err)
      );

      setSaved({ seconds: totalSeconds, succeeded });
    } catch (err) {
      console.error('Failed to save standalone run:', err);
      setIsSaving(false);
    }
  };

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
        <h1 className="text-xl font-bold text-white">Бег</h1>
      </header>

      <main className="flex-1 px-2 pb-10">
        {saved ? (
          <div className="flex flex-col items-center gap-4 py-12 px-4">
            <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center">
              <Check size={32} className="text-[#4CAF50]" />
            </div>
            <p className="text-lg font-semibold text-white">Бег сохранён</p>
            <p className="text-sm text-[#B0B0B0] text-center">
              3 км: {formatTimeMMSS(saved.seconds)}
              {saved.succeeded === true
                ? ' — справился'
                : saved.succeeded === false
                  ? ' — не справился'
                  : ''}
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate('/')}
            >
              На главную
            </Button>
          </div>
        ) : (
          <RunningCore onSave={handleSave} />
        )}
      </main>
    </div>
  );
}
