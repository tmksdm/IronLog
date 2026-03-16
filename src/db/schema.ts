// ==========================================
// SQL schema for IronLog database
// ==========================================

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS day_types (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_ru TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    day_type_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    has_added_weight INTEGER NOT NULL DEFAULT 1,
    working_weight REAL,
    weight_increment REAL NOT NULL DEFAULT 2.5,
    warmup_1_percent REAL DEFAULT 60,
    warmup_2_percent REAL DEFAULT 80,
    warmup_1_reps INTEGER NOT NULL DEFAULT 12,
    warmup_2_reps INTEGER NOT NULL DEFAULT 10,
    max_reps_per_set INTEGER NOT NULL DEFAULT 8,
    min_reps_per_set INTEGER NOT NULL DEFAULT 4,
    num_working_sets INTEGER NOT NULL DEFAULT 3,
    is_timed INTEGER NOT NULL DEFAULT 0,
    timer_duration_seconds INTEGER,
    timer_prep_seconds INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (day_type_id) REFERENCES day_types(id)
  );

  CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY,
    day_type_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('normal', 'reverse')),
    weight_before REAL,
    weight_after REAL,
    time_start TEXT NOT NULL,
    time_end TEXT,
    total_kg REAL NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (day_type_id) REFERENCES day_types(id)
  );

  CREATE TABLE IF NOT EXISTS exercise_logs (
    id TEXT PRIMARY KEY,
    workout_session_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    set_number INTEGER NOT NULL,
    set_type TEXT NOT NULL CHECK (set_type IN ('warmup', 'working')),
    target_reps INTEGER NOT NULL,
    actual_reps INTEGER NOT NULL DEFAULT 0,
    weight REAL NOT NULL DEFAULT 0,
    is_skipped INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id),
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
  );

  CREATE TABLE IF NOT EXISTS cardio_logs (
    id TEXT PRIMARY KEY,
    workout_session_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('jump_rope', 'treadmill_3km')),
    duration_seconds INTEGER,
    count INTEGER,
    FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id)
  );

  CREATE TABLE IF NOT EXISTS active_workout_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    session_id TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pullup_logs (
    id TEXT PRIMARY KEY,
    workout_session_id TEXT NOT NULL,
    pullup_day INTEGER NOT NULL,
    effective_day INTEGER NOT NULL,
    set_number INTEGER NOT NULL,
    reps INTEGER NOT NULL DEFAULT 0,
    grip_type TEXT,
    target_reps INTEGER,
    succeeded INTEGER NOT NULL DEFAULT 0,
    total_reps INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id)
  );  

  CREATE INDEX IF NOT EXISTS idx_exercises_day_type
    ON exercises(day_type_id);
  CREATE INDEX IF NOT EXISTS idx_workout_sessions_day_type
    ON workout_sessions(day_type_id);
  CREATE INDEX IF NOT EXISTS idx_workout_sessions_date
    ON workout_sessions(date);
  CREATE INDEX IF NOT EXISTS idx_exercise_logs_session
    ON exercise_logs(workout_session_id);
  CREATE INDEX IF NOT EXISTS idx_exercise_logs_exercise
    ON exercise_logs(exercise_id);
  CREATE INDEX IF NOT EXISTS idx_cardio_logs_session
    ON cardio_logs(workout_session_id);
  CREATE INDEX IF NOT EXISTS idx_pullup_logs_session
    ON pullup_logs(workout_session_id);    
`;

export const SEED_DAY_TYPES_SQL = `
  INSERT OR IGNORE INTO day_types (id, name, name_ru) VALUES
    (1, 'Squat', 'Присед'),
    (2, 'Pull',  'Тяга'),
    (3, 'Bench', 'Жим');
`;

export const SEED_EXERCISES_SQL = `
  INSERT OR IGNORE INTO exercises
    (id, day_type_id, name, sort_order, has_added_weight,
     working_weight, weight_increment, warmup_1_percent, warmup_2_percent,
     warmup_1_reps, warmup_2_reps, max_reps_per_set, min_reps_per_set,
     num_working_sets, is_timed, timer_duration_seconds, timer_prep_seconds, is_active)
  VALUES
    ('seed-squat-01', 1, 'Присед со штангой',            1, 1, 80,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-squat-02', 1, 'Жим узким хватом',             2, 1, 50,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-squat-03', 1, 'Ножницы',                      3, 1, 30,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-squat-04', 1, 'Брусья',                       4, 0, NULL, 2.5, NULL, NULL, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-squat-05', 1, 'Выпрямление ног в тренажёре',  5, 1, 40,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-squat-06', 1, 'Отжимания',                    6, 0, NULL, 0,   NULL, NULL, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-squat-07', 1, 'Пресс верхний',                7, 0, NULL, 0,   NULL, NULL, 12, 10, 8, 4, 3, 0, NULL, NULL, 1);

  INSERT OR IGNORE INTO exercises
    (id, day_type_id, name, sort_order, has_added_weight,
     working_weight, weight_increment, warmup_1_percent, warmup_2_percent,
     warmup_1_reps, warmup_2_reps, max_reps_per_set, min_reps_per_set,
     num_working_sets, is_timed, timer_duration_seconds, timer_prep_seconds, is_active)
  VALUES
    ('seed-pull-01', 2, 'Становая тяга',                 1, 1, 100,  2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-pull-02', 2, 'Жим стоя',                      2, 1, 40,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-pull-03', 2, 'Тяга в наклоне',                3, 1, 60,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-pull-04', 2, 'Сгибание ног в тренажёре',      4, 1, 35,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-pull-05', 2, 'Подъём на бицепс',              5, 1, 25,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-pull-06', 2, 'Гиперэкстензия',                6, 0, NULL, 0,   NULL, NULL, 12, 10, 8, 0, 3, 0, NULL, NULL, 1),
    ('seed-pull-07', 2, 'Пресс нижний',                  7, 0, NULL, 0,   NULL, NULL, 12, 10, 8, 0, 3, 0, NULL, NULL, 1);

  INSERT OR IGNORE INTO exercises
    (id, day_type_id, name, sort_order, has_added_weight,
     working_weight, weight_increment, warmup_1_percent, warmup_2_percent,
     warmup_1_reps, warmup_2_reps, max_reps_per_set, min_reps_per_set,
     num_working_sets, is_timed, timer_duration_seconds, timer_prep_seconds, is_active)
  VALUES
    ('seed-bench-01', 3, 'Жим лёжа',                     1, 1, 70,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-bench-02', 3, 'Приседания в Гакке',            2, 1, 60,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-bench-03', 3, 'Разводка гантелей',             3, 1, 14,   2,   60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-bench-04', 3, 'Трицепс на блоке',              4, 1, 30,   2.5, 60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-bench-05', 3, 'Жим гантелей на наклонной',     5, 1, 22,   2,   60, 80, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-bench-06', 3, 'Отжимания',                     6, 0, NULL, 0,   NULL, NULL, 12, 10, 8, 4, 3, 0, NULL, NULL, 1),
    ('seed-bench-07', 3, 'Пресс верхний',                 7, 0, NULL, 0,   NULL, NULL, 12, 10, 8, 0, 3, 0, NULL, NULL, 1);
`;
