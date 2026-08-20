import { useRef, useState } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { JumpRopeCore } from '../components/finish';
import { Button } from '../components/ui';
import { workoutRepo } from '../db';
import { pushToCloud } from '../lib/sync';

export function JumpRopePage() {
  const navigate = useNavigate();
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const savingRef = useRef(false);

  const handleSave = async (count: number) => {
    if (savingRef.current) return;
    savingRef.current = true;

    try {
      await workoutRepo.createCardioLog({
        workoutSessionId: null,
        type: 'jump_rope',
        durationSeconds: 75,
        count,
        succeeded: null,
      });

      pushToCloud().catch((error) =>
        console.error('Cloud push after standalone jump rope failed:', error)
      );
      setSavedCount(count);
    } catch (error) {
      console.error('Failed to save standalone jump rope:', error);
      savingRef.current = false;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#121212]">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button
          onClick={() => navigate('/')}
          aria-label="Вернуться на главную"
          className="w-10 h-10 rounded-xl bg-[#1E1E1E] flex items-center justify-center active:bg-[#2A2A2A] transition-colors"
        >
          <ChevronLeft size={24} className="text-white" />
        </button>
        <h1 className="text-xl font-bold text-white">Скакалка</h1>
      </header>

      <main className="flex-1 px-2 pb-10">
        {savedCount !== null ? (
          <div className="flex flex-col items-center gap-4 py-12 px-4">
            <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center">
              <Check size={32} className="text-[#4CAF50]" />
            </div>
            <p className="text-lg font-semibold text-white">Скакалка сохранена</p>
            <p className="text-sm text-[#B0B0B0] text-center">{savedCount} прыжков</p>
            <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/')}>
              На главную
            </Button>
          </div>
        ) : (
          <JumpRopeCore onSave={handleSave} />
        )}
      </main>
    </div>
  );
}
