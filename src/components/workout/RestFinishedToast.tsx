import { useEffect, useRef, useState } from 'react';
import { REST_FINISHED_EVENT } from './useAccurateRestTimer';

const TOAST_DURATION_MS = 2500;

export function RestFinishedToastHost() {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = () => {
      setVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setVisible(false);
        timeoutRef.current = null;
      }, TOAST_DURATION_MS);
    };
    window.addEventListener(REST_FINISHED_EVENT, show);
    return () => {
      window.removeEventListener(REST_FINISHED_EVENT, show);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#2A2A2A]
                 px-5 py-3 text-sm font-semibold text-white shadow-xl"
    >
      Время отдыха закончилось
    </div>
  );
}
