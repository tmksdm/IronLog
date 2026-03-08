import { useEffect, useState } from 'react';
import { getDb } from './db/database';
import type { DayType, Exercise } from './types';

function App() {
  const [status, setStatus] = useState<string>('Инициализация БД...');
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const db = await getDb();
        setStatus('БД подключена ✓');

        // Load day types
        const dtResult = await db.query('SELECT * FROM day_types ORDER BY id');
        const dtRows = dtResult.values ?? [];
        setDayTypes(
          dtRows.map((r: any) => ({
            id: r.id,
            name: r.name,
            nameRu: r.name_ru,
          }))
        );

        // Load exercises
        const exResult = await db.query(
          'SELECT * FROM exercises WHERE is_active = 1 ORDER BY day_type_id, sort_order'
        );
        const exRows = exResult.values ?? [];
        setExercises(
          exRows.map((r: any) => ({
            id: r.id,
            dayTypeId: r.day_type_id,
            name: r.name,
            sortOrder: r.sort_order,
            hasAddedWeight: r.has_added_weight === 1,
            workingWeight: r.working_weight,
            weightIncrement: r.weight_increment,
            warmup1Percent: r.warmup_1_percent,
            warmup2Percent: r.warmup_2_percent,
            warmup1Reps: r.warmup_1_reps,
            warmup2Reps: r.warmup_2_reps,
            maxRepsPerSet: r.max_reps_per_set,
            minRepsPerSet: r.min_reps_per_set,
            numWorkingSets: r.num_working_sets,
            isTimed: r.is_timed === 1,
            timerDurationSeconds: r.timer_duration_seconds,
            timerPrepSeconds: r.timer_prep_seconds,
            isActive: r.is_active === 1,
          }))
        );
      } catch (e: any) {
        console.error('DB init error:', e);
        setError(e.message || String(e));
        setStatus('Ошибка ✗');
      }
    }

    init();
  }, []);

  return (
    <div style={{ padding: 24, color: '#fff', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>IronLog — DB Test</h1>

      <p style={{ fontSize: 18, marginBottom: 16 }}>
        Статус:{' '}
        <span style={{ color: error ? '#F44336' : '#4CAF50' }}>{status}</span>
      </p>

      {error && (
        <pre style={{ color: '#F44336', whiteSpace: 'pre-wrap', marginBottom: 16 }}>
          {error}
        </pre>
      )}

      {dayTypes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>
            Типы дней ({dayTypes.length}):
          </h2>
          {dayTypes.map((dt) => (
            <p key={dt.id} style={{ marginLeft: 16 }}>
              {dt.id}. {dt.nameRu} ({dt.name})
            </p>
          ))}
        </div>
      )}

      {exercises.length > 0 && (
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>
            Упражнения ({exercises.length}):
          </h2>
          {[1, 2, 3].map((dayId) => (
            <div key={dayId} style={{ marginBottom: 16 }}>
              <h3 style={{ color: '#FF9800', marginBottom: 4 }}>
                День {dayId} — {dayTypes.find((d) => d.id === dayId)?.nameRu}
              </h3>
              {exercises
                .filter((ex) => ex.dayTypeId === dayId)
                .map((ex) => (
                  <p key={ex.id} style={{ marginLeft: 16, fontSize: 14 }}>
                    {ex.sortOrder}. {ex.name}
                    {ex.hasAddedWeight
                      ? ` — ${ex.workingWeight} кг`
                      : ' — без веса'}
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
