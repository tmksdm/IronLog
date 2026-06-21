// src/components/settings/SyncDiagnostics.tsx

/**
 * Diagnostic panel for cloud sync troubleshooting.
 * Shows auth status, local row counts, cloud row counts, and last sync error.
 * Includes a manual "pull from cloud" button.
 *
 * Resilient: shows local data first (fast), guards cloud calls with a timeout,
 * and surfaces any error on-screen so it can be read on the phone (no console needed).
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
  cloudExercises: string;
  cloudSessions: string;
}

/** Reject after `ms` so a hung network call can't freeze the UI forever. */
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: таймаут ${ms} мс`)), ms)
    ),
  ]);
}


export function SyncDiagnostics() {
  const [info, setInfo] = useState<DiagInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refreshNextDayInfo = useAppStore((s) => s.refreshNextDayInfo);

  const runCheck = async () => {
    setBusy(true);
    setMessage('Проверяю…');
    try {
      // 1. Local counts first (fast, no network).
      const db = await getDb();
      const exAll = await db.query('SELECT COUNT(*) as cnt FROM exercises');
      const exUser = await db.query(
        "SELECT COUNT(*) as cnt FROM exercises WHERE id NOT LIKE 'seed-%'"
      );
      const sess = await db.query('SELECT COUNT(*) as cnt FROM workout_sessions');

      const partial: DiagInfo = {
        userId: null,
        localExercises: exAll.values?.[0]?.cnt ?? 0,
        localUserExercises: exUser.values?.[0]?.cnt ?? 0,
        localSessions: sess.values?.[0]?.cnt ?? 0,
        cloudExercises: '…',
        cloudSessions: '…',
      };
      // Show local data immediately, even before cloud responds.
      setInfo({ ...partial });

      // 2. Auth (guarded by timeout).
      let userId: string | null = null;
      try {
        const { data } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          'getSession'
        );
        userId = data.session?.user?.id ?? null;
      } catch (e: any) {
        setMessage(`Auth: ${e?.message ?? e}`);
      }
      partial.userId = userId;
      setInfo({ ...partial });

      // 3. Cloud counts (guarded by timeout).
      if (userId) {
        try {
          const exRes = await withTimeout<{ count: number | null; error: { message: string } | null }>(
            supabase
              .from('exercises')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId),
            8000,
            'cloud exercises'
          );
          partial.cloudExercises = exRes.error
            ? `ошибка: ${exRes.error.message}`
            : String(exRes.count ?? 0);
        } catch (e: any) {
          partial.cloudExercises = `сбой: ${e?.message ?? e}`;
        }
        setInfo({ ...partial });

        try {
          const seRes = await withTimeout<{ count: number | null; error: { message: string } | null }>(
            supabase
              .from('workout_sessions')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId),
            8000,
            'cloud sessions'
          );
          partial.cloudSessions = seRes.error
            ? `ошибка: ${seRes.error.message}`
            : String(seRes.count ?? 0);
        } catch (e: any) {
          partial.cloudSessions = `сбой: ${e?.message ?? e}`;
        }
        setInfo({ ...partial });
      } else {
        partial.cloudExercises = 'нет userId';
        partial.cloudSessions = 'нет userId';
        setInfo({ ...partial });
      }

      setMessage('Готово.');
    } catch (err: any) {
      setMessage(`Ошибка проверки: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  const forcePull = async () => {
    setBusy(true);
    setMessage('Тяну из облака…');
    try {
      const hadChanges = await withTimeout(pullFromCloud(), 30000, 'pullFromCloud');
      if (hadChanges) {
        await refreshNextDayInfo();
        setMessage('Данные подтянуты! Открой Главную/Историю.');
      } else {
        setMessage('pullFromCloud вернул false (пропущено или облако пусто). Нажми «Проверить».');
      }
      await runCheck();
    } catch (err: any) {
      setMessage(`Ошибка pull: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

    const rawFetchTest = async () => {
    setBusy(true);
    setMessage('Прямой запрос к Supabase…');
    try {
      const url =
        'https://khnepdfkjwpxwtbjvqiv.supabase.co/rest/v1/exercises?select=id&limit=1';
      const anon =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtobmVwZGZrandweHd0Ymp2cWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTg0NTAsImV4cCI6MjA4ODYzNDQ1MH0.3eOC_PhzRWZXpBPH6vO57HUauM-g1vOGXqB-AkNEViU';
      const t0 = Date.now();
      const res = await fetch(url, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      });
      const ms = Date.now() - t0;
      const text = await res.text();
      setMessage(`HTTP ${res.status} за ${ms} мс. Ответ: ${text.slice(0, 200)}`);
    } catch (err: any) {
      setMessage(`fetch упал: ${err?.name ?? ''} ${err?.message ?? err}`);
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

      <button
        onClick={rawFetchTest}
        disabled={busy}
        className="w-full h-10 rounded-xl bg-[#444] text-white text-sm font-medium
          active:bg-[#555] transition-colors disabled:opacity-40"
      >
        Прямой запрос (тест сети)
      </button>


      {info && (
        <div className="text-xs text-[#bbb] space-y-1 font-mono">
          <div>userId: {info.userId ? info.userId.slice(0, 8) + '…' : 'НЕТ (не залогинен)'}</div>
          <div>локально упражнений: {info.localExercises} (свои: {info.localUserExercises})</div>
          <div>локально тренировок: {info.localSessions}</div>
          <div>облако упражнений: {info.cloudExercises}</div>
          <div>облако тренировок: {info.cloudSessions}</div>
        </div>
      )}

      {message && (
        <div className="text-xs text-yellow-400 wrap-break-word">{message}</div>
      )}
    </Card>
  );
}
