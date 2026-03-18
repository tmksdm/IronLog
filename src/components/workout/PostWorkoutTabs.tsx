// src/components/workout/PostWorkoutTabs.tsx

/**
 * Tab bar for post-finish workout flow.
 * Shown after user confirms "Завершить" — replaces FinishWorkoutModal.
 * Four tabs: Упражнения | Кардио | Подтягивания | Итоги
 */

import { Dumbbell, Activity, ArrowUp, ClipboardList } from 'lucide-react';
import type { PostWorkoutTab } from '../../types';
import { useWorkoutStore } from '../../stores/workoutStore';

const TABS: { id: PostWorkoutTab; label: string; icon: typeof Dumbbell }[] = [
  { id: 'exercises', label: 'Упражнения', icon: Dumbbell },
  { id: 'cardio', label: 'Кардио', icon: Activity },
  { id: 'pullups', label: 'Подтягивания', icon: ArrowUp },
  { id: 'summary', label: 'Итоги', icon: ClipboardList },
];

export function PostWorkoutTabs() {
  const activeTab = useWorkoutStore((s) => s.activeTab);
  const setActiveTab = useWorkoutStore((s) => s.setActiveTab);
  const isCardioCompleted = useWorkoutStore((s) => s.isCardioCompleted);
  const pullupResult = useWorkoutStore((s) => s.pullupResult);

  return (
    <div className="flex bg-[#1E1E1E] border-b border-[#333333]">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        // Show a green dot if tab has completed data
        const hasData =
          (tab.id === 'cardio' && isCardioCompleted) ||
          (tab.id === 'pullups' && pullupResult !== null);

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 flex flex-col items-center gap-0.5 py-2.5 relative
              transition-colors
              ${isActive
                ? 'text-[#4CAF50]'
                : 'text-[#707070] active:text-[#B0B0B0]'
              }
            `}
          >
            <Icon size={18} />
            <span className="text-[10px] font-semibold">{tab.label}</span>

            {/* Active indicator line */}
            {isActive && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#4CAF50] rounded-full" />
            )}

            {/* Completed data dot */}
            {hasData && !isActive && (
              <div className="absolute top-1.5 right-1/4 w-1.5 h-1.5 rounded-full bg-[#4CAF50]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
