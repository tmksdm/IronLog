// src/components/settings/SyncDiagnostics.tsx

/**
 * Diagnostic panel for cloud sync troubleshooting.
 * Shows auth status, local row counts, cloud row counts, and last sync error.
 * Includes a manual "pull from cloud" button.
 *
 * TEMPORARY: added to debug why a device shows empty data despite cloud backup.
 */

import { useState } from 'react';
import { Card } from '../ui';
import { getDb } from '../../db/database';
import { supabase } from '../../lib/supabase';
import { pullFromCloud } from '../../lib/sync';
import { useAppStore } from '../../stores/appStore';

interface DiagInfo {
  userId: string | null;
  localExercises: number;
  localUserExercises: number;
  localSessions: number;
  cloudExercises: number | string;
  cloudSessions: number | string;
}

export function SyncDiagnostics() {
  const [info, setInfo] = useState<DiagInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  const runCheck = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // 1. Auth
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      // 2. Local counts
      const db = await getDb();
      const exAll = await db.query('SELECT COUNT(*) as cnt FROM exercises');
      const exUser = await db.query(
        "SELECT COUNT(*) as cnt FROM exercises WHERE id NOT LIKE 'seed-%'"
      );
      const sess = await db.query('SELECT COUNT(*) as cnt FROM workout_sessions');

      // 3. Cloud counts (only if logged in)
      let cloudExercises: number | string = '—';
      let cloudSessions: number | string = '—';
      if (userId) {
        const exRes = await supabase
          .from('exercises')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        const seRes = await supabase
          .from('workout_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        cloudExercises = exRes.error ? `ошибка: ${exRes.error.message}` : (exRes.count ?? 0);
        cloudSessions = seRes.error ? `ошибка: ${seRes.error.message}` : (seRes.count ?? 0);
      }

      setInfo({
        userId,
        localExercises: exAll.values?.[0]?.cnt ?? 0,
        localUserExercises: exUser.values?.[0]?.cnt ?? 0,
        localSessions: sess.values?.[0]?.cnt ?? 0,
        cloudExercises,
        cloudSessions,
      });
    } catch (err: any) {
      setMessage(`Ошибка проверки: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  const forcePull = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const hadChanges = await pullFromCloud();
      if (hadChanges) {
        await refreshNextDayInfo();
        setMessage('Данные подтянуты из облака! Открой Главную/Историю.');
      } else {
        setMessage(
          'pullFromCloud вернул false (пропущено или облако пусто). Сделай «Проверить» и посмотри причины.'
        );
      }
      await runCheck();
    } catch (err: any) {
      setMessage(`Ошибка pull: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4! space-y-3">
      <div className="text-white font-medium">Диагностика синхронизации</div>

      <div className="flex gap-2">
        <button
          onClick={runCheck}
          disabled={busy}
          className="flex-1 h-10 rounded-xl bg-[#333] text-white text-sm font-medium
            active:bg-[#444] transition-colors disabled:opacity-40"
        >
          Проверить
        </button>
        <button
          onClick={forcePull}
          disabled={busy}
          className="flex-1 h-10 rounded-xl bg-blue-600 text-white text-sm font-medium
            active:bg-blue-700 transition-colors disabled:opacity-40"
        >
          Подтянуть из облака
        </button>
      </div>

      {info && (
        <div className="text-xs text-[#bbb] space-y-1 font-mono">
          <div>userId: {info.userId ? info.userId.slice(0, 8) + '…' : 'НЕТ (не залогинен)'}</div>
          <div>локально упражнений: {info.localExercises} (свои: {info.localUserExercises})</div>
          <div>локально тренировок: {info.localSessions}</div>
          <div>облако упражнений: {String(info.cloudExercises)}</div>
          <div>облако тренировок: {String(info.cloudSessions)}</div>
        </div>
      )}

      {message && (
        <div className="text-xs text-yellow-400 wrap-break-word">{message}</div>
      )}
    </Card>
  );
}
