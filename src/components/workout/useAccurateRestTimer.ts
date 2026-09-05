import { useCallback, useEffect, useRef } from 'react';

export const REST_FINISHED_EVENT = 'ironlog:rest-finished';

interface AccurateRestTimerOptions {
  isRunning: boolean;
  endsAt: number | null;
  sync: (now: number) => boolean;
}

/** Keeps countdown UI aligned with wall-clock time after background throttling. */
export function useAccurateRestTimer({
  isRunning,
  endsAt,
  sync,
}: AccurateRestTimerOptions): void {
  const handledDeadlineRef = useRef<number | null>(null);

  const update = useCallback(() => {
    if (!isRunning || endsAt === null) return;

    const now = Date.now();
    // Keep the deadline pending while hidden so the in-app message is shown
    // when the user can actually see it again.
    if (now >= endsAt && document.visibilityState === 'hidden') return;

    const finished = sync(now);
    if (finished && handledDeadlineRef.current !== endsAt) {
      handledDeadlineRef.current = endsAt;
      window.dispatchEvent(new CustomEvent(REST_FINISHED_EVENT));
    }
  }, [endsAt, isRunning, sync]);

  useEffect(() => {
    if (!isRunning || endsAt === null) return;

    update();
    const interval = setInterval(update, 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', update);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', update);
    };
  }, [endsAt, isRunning, update]);

  useEffect(() => {
    if (endsAt !== handledDeadlineRef.current) {
      handledDeadlineRef.current = null;
    }
  }, [endsAt]);
}
