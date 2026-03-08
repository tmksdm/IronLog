// src/components/workout/ExerciseNavGrid.tsx

/**
 * Horizontal scrollable grid of exercise status indicators.
 * Allows quick navigation between exercises.
 */

import { useRef, useEffect } from 'react';
import type { ActiveExercise } from '../../stores/workoutStore';
import { getStatusColor } from '../../theme';

interface ExerciseNavGridProps {
  exercises: ActiveExercise[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function ExerciseNavGrid({
  exercises,
  currentIndex,
  onSelect,
}: ExerciseNavGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Auto-scroll to keep current item visible
  useEffect(() => {
    const currentItem = itemRefs.current[currentIndex];
    if (currentItem && scrollRef.current) {
      const container = scrollRef.current;
      const itemLeft = currentItem.offsetLeft;
      const itemWidth = currentItem.offsetWidth;
      const containerWidth = container.offsetWidth;
      const scrollLeft = container.scrollLeft;

      // If item is not fully visible, scroll to center it
      if (
        itemLeft < scrollLeft + 16 ||
        itemLeft + itemWidth > scrollLeft + containerWidth - 16
      ) {
        container.scrollTo({
          left: itemLeft - containerWidth / 2 + itemWidth / 2,
          behavior: 'smooth',
        });
      }
    }
  }, [currentIndex]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto px-5 py-2 scrollbar-hide"
      style={{ scrollbarWidth: 'none' }}
    >
      {exercises.map((ae, idx) => {
        const isCurrent = idx === currentIndex;
        const statusColor = getStatusColor(ae.status);

        return (
          <button
            key={ae.exercise.id}
            ref={(el) => { itemRefs.current[idx] = el; }}
            className={`
              shrink-0 flex flex-col items-center justify-center
              w-12 h-12 rounded-xl text-xs font-bold
              transition-all select-none
              ${isCurrent
                ? 'ring-2 ring-white scale-110'
                : 'active:scale-95'
              }
            `}
            style={{ backgroundColor: statusColor }}
            onClick={() => onSelect(idx)}
          >
            <span className="text-white leading-none">{idx + 1}</span>
            {ae.isPriority && (
              <span className="text-[8px] text-orange-300 leading-none mt-0.5">★</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
